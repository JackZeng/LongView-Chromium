#include "longview/engine/long_page_controller.h"

#include <algorithm>
#include <cmath>
#include <limits>
#include <utility>

namespace longview::engine {
namespace {

bool Intersects(double start, double size, double range_start, double range_end) {
  return start < range_end && start + size > range_start;
}

double DistanceToRange(double start, double size, double range_start,
                       double range_end) {
  const double end = start + size;
  if (end < range_start) return range_start - end;
  if (start > range_end) return start - range_end;
  return 0.0;
}

}  // namespace

LongPageController::LongPageController(PolicyConfig config,
                                       std::unique_ptr<ColdBackend> backend)
    : config_(config), backend_(std::move(backend)) {
  if (!backend_) backend_ = std::make_unique<InMemoryColdBackend>();
}

bool LongPageController::RegisterSegment(SegmentRecord segment,
                                         GeometryCapsule capsule) {
  if (segment.id == 0 || segment.size <= 0.0 || segments_.contains(segment.id)) {
    return false;
  }
  capsule.segment_id = segment.id;
  capsule.block_start = segment.start;
  capsule.block_size = segment.size;
  capsule.style_generation = segment.style_generation;
  capsule.content_generation = segment.content_generation;
  capsule.geometry_valid = true;
  capsules_.Put(std::move(capsule));
  segments_.emplace(segment.id, std::move(segment));
  return true;
}

bool LongPageController::RemoveSegment(std::uint64_t segment_id) {
  if (backend_->IsFrozen(segment_id)) backend_->Thaw(segment_id);
  capsules_.Erase(segment_id);
  return segments_.erase(segment_id) > 0;
}

bool LongPageController::UpdateGeometry(std::uint64_t segment_id, double start,
                                        double size,
                                        std::uint64_t style_generation) {
  auto it = segments_.find(segment_id);
  if (it == segments_.end() || size <= 0.0) return false;
  it->second.start = start;
  it->second.size = size;
  it->second.style_generation = style_generation;
  auto* capsule = capsules_.GetMutable(segment_id);
  if (!capsule) return false;
  capsule->block_start = start;
  capsule->block_size = size;
  capsule->style_generation = style_generation;
  capsule->geometry_valid = true;
  return true;
}

bool LongPageController::UpdateCapabilities(
    std::uint64_t segment_id, SegmentCapabilities capabilities, double now_ms) {
  auto it = segments_.find(segment_id);
  if (it == segments_.end()) return false;
  it->second.capabilities = capabilities;
  if (MustPin(it->second, now_ms)) Transition(it->second, SegmentState::kPinned, now_ms);
  return true;
}

bool LongPageController::MustPin(const SegmentRecord& segment,
                                 double now_ms) const {
  const auto& c = segment.capabilities;
  return segment.pinned_until_ms > now_ms || c.has_focus || c.has_selection ||
         c.media_active || c.overlay_active || c.accessibility_active || c.editable;
}

SegmentState LongPageController::DesiredState(
    const SegmentRecord& segment, const ViewportState& viewport,
    double predicted_top, double predicted_bottom) const {
  if (!config_.enabled) return SegmentState::kHot;
  if (!segment.capabilities.eligible) return SegmentState::kPinned;
  if (MustPin(segment, viewport.now_ms)) return SegmentState::kPinned;

  const double viewport_bottom = viewport.top + viewport.height;
  if (Intersects(segment.start, segment.size,
                 viewport.top - config_.hot_margin_px,
                 viewport_bottom + config_.hot_margin_px)) {
    return SegmentState::kHot;
  }
  if (Intersects(segment.start, segment.size,
                 predicted_top - config_.warm_margin_px,
                 predicted_bottom + config_.warm_margin_px)) {
    return SegmentState::kWarm;
  }
  if (viewport.now_ms - segment.last_near_ms < config_.cold_hysteresis_ms) {
    return SegmentState::kWarm;
  }
  return SegmentState::kCold;
}

void LongPageController::Transition(SegmentRecord& segment, SegmentState next,
                                    double now_ms) {
  if (segment.state == next) return;
  if (segment.state == SegmentState::kCold && next != SegmentState::kCold) {
    backend_->Thaw(segment.id);
  }
  if (next == SegmentState::kCold) {
    const auto* capsule = capsules_.Get(segment.id);
    if (!capsule) {
      ++stats_.freeze_failures;
      return;
    }
    const FreezeResult result = backend_->Freeze(segment.id, *capsule,
                                                 segment.derived_state);
    if (!result.success) {
      ++stats_.freeze_failures;
      return;
    }
    stats_.released_bytes += result.released.total();
  }
  segment.state = next;
  ++segment.transition_count;
  ++stats_.transitions;
  if (next == SegmentState::kHot || next == SegmentState::kWarm ||
      next == SegmentState::kPinned) {
    segment.last_near_ms = now_ms;
  }
}

void LongPageController::UpdateViewport(const ViewportState& viewport) {
  const double prediction = std::clamp(
      viewport.velocity_px_per_ms * config_.prediction_horizon_ms,
      -config_.max_prediction_px, config_.max_prediction_px);
  const double predicted_top = viewport.top + prediction;
  const double predicted_bottom = predicted_top + viewport.height;

  struct WarmCandidate {
    std::uint64_t id;
    double distance;
  };
  std::vector<WarmCandidate> warm_candidates;

  for (auto& [id, segment] : segments_) {
    SegmentState desired = DesiredState(segment, viewport, predicted_top,
                                        predicted_bottom);
    if (desired == SegmentState::kWarm) {
      warm_candidates.push_back({id, DistanceToRange(
          segment.start, segment.size, predicted_top, predicted_bottom)});
    } else {
      Transition(segment, desired, viewport.now_ms);
    }
  }

  std::sort(warm_candidates.begin(), warm_candidates.end(),
            [](const WarmCandidate& a, const WarmCandidate& b) {
              return a.distance < b.distance;
            });
  for (std::size_t index = 0; index < warm_candidates.size(); ++index) {
    auto& segment = segments_.at(warm_candidates[index].id);
    const SegmentState desired = index < config_.max_warm_segments
                                     ? SegmentState::kWarm
                                     : SegmentState::kCold;
    Transition(segment, desired, viewport.now_ms);
  }
  RecomputeScheduler(viewport);
}

void LongPageController::TrimThrashHistory(SegmentRecord& segment,
                                           double now_ms) {
  while (!segment.materialization_times.empty() &&
         now_ms - segment.materialization_times.front() >
             config_.thrash_window_ms) {
    segment.materialization_times.pop_front();
  }
}

bool LongPageController::Materialize(std::uint64_t segment_id,
                                     MaterializationReason reason,
                                     double now_ms) {
  auto it = segments_.find(segment_id);
  if (it == segments_.end()) return false;
  auto& segment = it->second;
  TrimThrashHistory(segment, now_ms);
  segment.materialization_times.push_back(now_ms);
  ++stats_.materializations;

  const bool correctness_pin = reason != MaterializationReason::kViewportApproach;
  if (correctness_pin) {
    segment.pinned_until_ms = std::max(segment.pinned_until_ms,
                                       now_ms + config_.pin_duration_ms);
  }
  if (segment.materialization_times.size() >= config_.thrash_threshold) {
    segment.pinned_until_ms = std::max(segment.pinned_until_ms,
                                       now_ms + config_.thrash_window_ms);
    ++stats_.thrash_pins;
  }
  Transition(segment,
             (correctness_pin || segment.pinned_until_ms > now_ms)
                 ? SegmentState::kPinned
                 : SegmentState::kHot,
             now_ms);
  return true;
}

bool LongPageController::NotifyMutation(std::uint64_t segment_id,
                                        double now_ms) {
  auto it = segments_.find(segment_id);
  if (it == segments_.end()) return false;
  ++it->second.content_generation;
  capsules_.InvalidateContent(segment_id, it->second.content_generation);
  return Materialize(segment_id, MaterializationReason::kScriptMutation, now_ms);
}

void LongPageController::RecomputeScheduler(const ViewportState& viewport) {
  const double viewport_bottom = viewport.top + viewport.height;
  for (const auto& [id, segment] : segments_) {
    const double distance = DistanceToRange(segment.start, segment.size,
                                            viewport.top, viewport_bottom);
    const bool downward = viewport.velocity_px_per_ms >= 0.0;
    const bool in_direction = downward ? segment.start >= viewport.top
                                       : segment.start + segment.size <= viewport_bottom;
    scheduler_.Update(id, SchedulerInput{
        .state = segment.state,
        .distance_to_viewport = distance,
        .scroll_velocity = viewport.velocity_px_per_ms,
        .in_scroll_direction = in_direction,
        .has_pending_observer_work = segment.state != SegmentState::kCold,
        .has_pending_raster = segment.state == SegmentState::kWarm,
    });
  }
}

const SegmentRecord* LongPageController::GetSegment(
    std::uint64_t segment_id) const {
  const auto it = segments_.find(segment_id);
  return it == segments_.end() ? nullptr : &it->second;
}

SegmentState LongPageController::StateFor(std::uint64_t segment_id) const {
  const auto* segment = GetSegment(segment_id);
  return segment ? segment->state : SegmentState::kCold;
}

const GeometryCapsule* LongPageController::CapsuleFor(
    std::uint64_t segment_id) const {
  return capsules_.Get(segment_id);
}

WorkPriority LongPageController::PriorityFor(std::uint64_t segment_id) const {
  return scheduler_.PriorityFor(segment_id);
}

ControllerStats LongPageController::stats() const {
  ControllerStats output = stats_;
  output.hot = output.warm = output.cold = output.pinned = 0;
  for (const auto& [_, segment] : segments_) {
    switch (segment.state) {
      case SegmentState::kHot: ++output.hot; break;
      case SegmentState::kWarm: ++output.warm; break;
      case SegmentState::kCold: ++output.cold; break;
      case SegmentState::kPinned: ++output.pinned; break;
    }
  }
  output.released_bytes = backend_->ReleasedBytes();
  return output;
}

}  // namespace longview::engine
