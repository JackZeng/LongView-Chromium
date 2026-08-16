#include "longview/segment_model.h"

#include <algorithm>
#include <cmath>

namespace longview {
namespace {

bool IsFinitePositive(double value) {
  return std::isfinite(value) && value > 0.0;
}

}  // namespace

EligibilityResult EvaluateEligibility(const EligibilityInput& input,
                                      const PolicyConfig& config) {
  if (!std::isfinite(input.start) || !std::isfinite(input.end) ||
      input.end <= input.start || !IsFinitePositive(input.block_size)) {
    return {false, false, IneligibleReason::kInvalidGeometry};
  }
  if (input.block_size < config.minimum_block_size) {
    return {false, false, IneligibleReason::kTooSmall};
  }
  if (input.has_focus || input.has_selection || input.is_editable) {
    return {true, true, IneligibleReason::kActiveInteraction};
  }
  if (input.has_live_media) {
    return {true, true, IneligibleReason::kLiveMedia};
  }
  if (input.has_canvas || input.has_webgl || input.has_dialog ||
      input.has_popover) {
    return {false, false, IneligibleReason::kDynamicSurface};
  }
  if (input.has_cross_boundary_sticky || input.has_fixed_descendant) {
    return {false, false, IneligibleReason::kCrossBoundaryPositioning};
  }
  if (input.recent_materializations >= config.pin_after_materializations) {
    return {true, true, IneligibleReason::kFrequentlyMaterialized};
  }
  return {true, false, IneligibleReason::kNone};
}

WorkingSet ComputeWorkingSet(const Viewport& viewport,
                             const PolicyConfig& config) {
  const double viewport_size = std::max(1.0, viewport.end - viewport.start);
  const double normalized_speed = std::clamp(
      std::abs(viewport.velocity) / std::max(1.0, config.velocity_reference),
      0.0, config.velocity_cap);
  const double ahead = config.warm_ahead_viewports +
                       normalized_speed * config.speed_ahead_viewports;
  const double behind = config.warm_behind_viewports +
                        normalized_speed * config.speed_behind_viewports;

  WorkingSet set;
  set.hot_start = viewport.start - viewport_size * config.hot_viewports;
  set.hot_end = viewport.end + viewport_size * config.hot_viewports;
  if (viewport.direction >= 0) {
    set.warm_start = viewport.start - viewport_size * behind;
    set.warm_end = viewport.end + viewport_size * ahead;
  } else {
    set.warm_start = viewport.start - viewport_size * ahead;
    set.warm_end = viewport.end + viewport_size * behind;
  }
  return set;
}

SegmentState Classify(const Segment& segment,
                      const WorkingSet& set,
                      const PolicyConfig& config,
                      std::uint64_t now_ms) {
  if (!segment.eligible) {
    return SegmentState::kHot;
  }
  if (segment.pinned ||
      segment.materialization_timestamps.size() >=
          config.pin_after_materializations) {
    return SegmentState::kPinned;
  }
  if (segment.end >= set.hot_start && segment.start <= set.hot_end) {
    return SegmentState::kHot;
  }
  if (segment.end >= set.warm_start && segment.start <= set.warm_end) {
    return SegmentState::kWarm;
  }
  if (segment.state == SegmentState::kHot &&
      now_ms < segment.last_hot_ms + config.hot_demotion_delay_ms) {
    return SegmentState::kWarm;
  }
  if (segment.state == SegmentState::kWarm &&
      now_ms < segment.last_warm_ms + config.warm_demotion_delay_ms) {
    return SegmentState::kWarm;
  }
  return SegmentState::kCold;
}

void PruneMaterializations(Segment* segment,
                           const PolicyConfig& config,
                           std::uint64_t now_ms) {
  while (!segment->materialization_timestamps.empty() &&
         now_ms - segment->materialization_timestamps.front() >
             config.materialization_window_ms) {
    segment->materialization_timestamps.pop_front();
  }
}

std::string_view SegmentStateName(SegmentState state) {
  switch (state) {
    case SegmentState::kHot:
      return "hot";
    case SegmentState::kWarm:
      return "warm";
    case SegmentState::kCold:
      return "cold";
    case SegmentState::kPinned:
      return "pinned";
  }
  return "unknown";
}

std::string_view MaterializationReasonName(MaterializationReason reason) {
  switch (reason) {
    case MaterializationReason::kViewportApproach:
      return "viewport-approach";
    case MaterializationReason::kGeometryQuery:
      return "geometry-query";
    case MaterializationReason::kFindInPage:
      return "find-in-page";
    case MaterializationReason::kFocus:
      return "focus";
    case MaterializationReason::kSelection:
      return "selection";
    case MaterializationReason::kAnchorNavigation:
      return "anchor-navigation";
    case MaterializationReason::kAccessibility:
      return "accessibility";
    case MaterializationReason::kScreenshot:
      return "screenshot";
    case MaterializationReason::kPrint:
      return "print";
    case MaterializationReason::kScriptMutation:
      return "script-mutation";
  }
  return "unknown";
}

std::string_view IneligibleReasonName(IneligibleReason reason) {
  switch (reason) {
    case IneligibleReason::kNone:
      return "none";
    case IneligibleReason::kInvalidGeometry:
      return "invalid-geometry";
    case IneligibleReason::kTooSmall:
      return "too-small";
    case IneligibleReason::kActiveInteraction:
      return "active-interaction";
    case IneligibleReason::kLiveMedia:
      return "live-media";
    case IneligibleReason::kDynamicSurface:
      return "dynamic-surface";
    case IneligibleReason::kCrossBoundaryPositioning:
      return "cross-boundary-positioning";
    case IneligibleReason::kFrequentlyMaterialized:
      return "frequently-materialized";
  }
  return "unknown";
}

}  // namespace longview
