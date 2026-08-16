#include "longview/policy_engine.h"

#include <algorithm>

namespace longview {

PolicyEngine::PolicyEngine(PolicyConfig config) : config_(config) {}

void PolicyEngine::Reset(std::vector<Segment> segments) {
  segments_ = std::move(segments);
  for (auto& segment : segments_) {
    EligibilityInput input;
    input.start = segment.start;
    input.end = segment.end;
    input.block_size = segment.block_size > 0.0
                           ? segment.block_size
                           : segment.end - segment.start;
    input.recent_materializations = segment.materialization_timestamps.size();
    const auto eligibility = EvaluateEligibility(input, config_);
    segment.eligible = eligibility.eligible;
    segment.pinned = segment.pinned || eligibility.pin;
    segment.ineligible_reason = eligibility.reason;
  }
  RebuildIndex();
  RecountEligibility();
  RecountStates();
}

void PolicyEngine::RebuildIndex() {
  index_.Rebuild(segments_);
  telemetry_.index_rebuilds += 1;
}

void PolicyEngine::Update(const Viewport& viewport, std::uint64_t now_ms) {
  const WorkingSet set = ComputeWorkingSet(viewport, config_);
  const auto range = index_.Intersecting(set.warm_start, set.warm_end);

  std::vector<bool> in_warm_range(segments_.size(), false);
  for (std::size_t position = range.first; position < range.second; ++position) {
    const Segment* segment = index_.At(position);
    if (!segment) {
      continue;
    }
    const auto iterator = std::find_if(
        segments_.begin(), segments_.end(),
        [segment](const Segment& candidate) { return candidate.id == segment->id; });
    if (iterator != segments_.end()) {
      in_warm_range[static_cast<std::size_t>(iterator - segments_.begin())] = true;
    }
  }

  for (std::size_t index = 0; index < segments_.size(); ++index) {
    Segment& segment = segments_[index];
    PruneMaterializations(&segment, config_, now_ms);
    if (segment.materialization_timestamps.size() >=
        config_.pin_after_materializations) {
      segment.pinned = true;
      segment.ineligible_reason = IneligibleReason::kFrequentlyMaterialized;
    }

    SegmentState next;
    if (!in_warm_range[index] && segment.eligible && !segment.pinned) {
      next = Classify(segment, set, config_, now_ms);
    } else {
      next = Classify(segment, set, config_, now_ms);
    }
    if (next != segment.state) {
      segment.state = next;
      segment.last_transition_ms = now_ms;
      telemetry_.transitions += 1;
    }
    if (segment.state == SegmentState::kHot) {
      segment.last_hot_ms = now_ms;
    } else if (segment.state == SegmentState::kWarm) {
      segment.last_warm_ms = now_ms;
    }
  }
  RecountEligibility();
  RecountStates();
}

void PolicyEngine::RecordMaterialization(std::uint64_t segment_id,
                                         MaterializationReason reason,
                                         std::uint64_t now_ms) {
  Segment* segment = FindSegment(segment_id);
  if (!segment) {
    return;
  }
  segment->materialization_timestamps.push_back(now_ms);
  PruneMaterializations(segment, config_, now_ms);
  telemetry_.materializations[MaterializationReasonIndex(reason)] += 1;
  if (segment->materialization_timestamps.size() >=
      config_.pin_after_materializations) {
    segment->pinned = true;
    segment->state = SegmentState::kPinned;
    segment->ineligible_reason = IneligibleReason::kFrequentlyMaterialized;
  } else {
    segment->state = SegmentState::kHot;
    segment->last_hot_ms = now_ms;
  }
  RecountEligibility();
  RecountStates();
}

const std::vector<Segment>& PolicyEngine::segments() const {
  return segments_;
}

const PolicyTelemetry& PolicyEngine::telemetry() const {
  return telemetry_;
}

Segment* PolicyEngine::FindSegment(std::uint64_t id) {
  const auto iterator = std::find_if(
      segments_.begin(), segments_.end(),
      [id](const Segment& segment) { return segment.id == id; });
  return iterator == segments_.end() ? nullptr : &*iterator;
}

void PolicyEngine::RecountEligibility() {
  telemetry_.segment_count = segments_.size();
  telemetry_.eligible_count = 0;
  telemetry_.ineligible_count = 0;
  telemetry_.ineligible_reasons.fill(0);
  for (const auto& segment : segments_) {
    if (segment.eligible && !segment.pinned) {
      telemetry_.eligible_count += 1;
    } else {
      telemetry_.ineligible_count += 1;
      telemetry_.ineligible_reasons[IneligibleReasonIndex(
          segment.ineligible_reason)] += 1;
    }
  }
}

void PolicyEngine::RecountStates() {
  telemetry_.states = {};
  for (const auto& segment : segments_) {
    switch (segment.state) {
      case SegmentState::kHot:
        telemetry_.states.hot += 1;
        break;
      case SegmentState::kWarm:
        telemetry_.states.warm += 1;
        break;
      case SegmentState::kCold:
        telemetry_.states.cold += 1;
        break;
      case SegmentState::kPinned:
        telemetry_.states.pinned += 1;
        break;
    }
  }
}

}  // namespace longview
