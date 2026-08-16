#include "longview/segment_model.h"

#include <algorithm>
#include <cmath>

namespace longview {
namespace {

double Clamp(double value, double minimum, double maximum) {
  return std::min(maximum, std::max(minimum, value));
}

}  // namespace

WorkingSet ComputeWorkingSet(double scroll_y,
                             double viewport_height,
                             double velocity_pixels_per_second,
                             double document_height,
                             const WorkingSetSettings& settings) {
  viewport_height = std::max(1.0, viewport_height);
  document_height = std::max(viewport_height, document_height);
  scroll_y = Clamp(scroll_y, 0.0, document_height);

  const int direction = velocity_pixels_per_second == 0.0
                            ? 0
                            : (velocity_pixels_per_second > 0.0 ? 1 : -1);
  const double predicted_pixels =
      std::abs(velocity_pixels_per_second) * settings.prediction_seconds;
  const double prediction_boost = Clamp(
      predicted_pixels / viewport_height, 0.0,
      settings.maximum_prediction_boost_screens);

  double ahead = settings.warm_ahead_screens;
  double behind = settings.warm_behind_screens;
  if (direction > 0) {
    ahead += prediction_boost;
  } else if (direction < 0) {
    behind += prediction_boost;
  }

  const double hot_padding = settings.hot_screens * viewport_height;
  WorkingSet result;
  result.hot_top = Clamp(scroll_y - hot_padding, 0.0, document_height);
  result.hot_bottom = Clamp(scroll_y + viewport_height + hot_padding, 0.0,
                            document_height);
  result.warm_top =
      Clamp(scroll_y - behind * viewport_height, 0.0, document_height);
  result.warm_bottom = Clamp(
      scroll_y + viewport_height + ahead * viewport_height, 0.0,
      document_height);
  result.direction = direction;
  return result;
}

SegmentState ClassifySegment(const SegmentGeometry& geometry,
                             const WorkingSet& working_set) {
  if (geometry.bottom() >= working_set.hot_top &&
      geometry.top <= working_set.hot_bottom) {
    return SegmentState::kHot;
  }
  if (geometry.bottom() >= working_set.warm_top &&
      geometry.top <= working_set.warm_bottom) {
    return SegmentState::kWarm;
  }
  return SegmentState::kCold;
}

SegmentLifecycle::SegmentLifecycle(SegmentGeometry geometry)
    : geometry_(geometry) {}

bool SegmentLifecycle::IsPinned(TimePoint now) const {
  return pinned_until_ != TimePoint{} && now < pinned_until_;
}

void SegmentLifecycle::SetGeometry(SegmentGeometry geometry) {
  geometry_ = geometry;
}

bool SegmentLifecycle::TransitionTo(SegmentState next, TimePoint now) {
  if (IsPinned(now)) {
    next = SegmentState::kPinned;
  }
  if (state_ == next) {
    return false;
  }
  state_ = next;
  ++transition_count_;
  return true;
}

void SegmentLifecycle::RemoveExpiredMaterializations(TimePoint now) {
  constexpr auto kWindow = std::chrono::seconds(2);
  while (!recent_materializations_.empty() &&
         now - recent_materializations_.front() > kWindow) {
    recent_materializations_.pop_front();
  }
}

void SegmentLifecycle::RecordMaterialization(MaterializationReason reason,
                                             TimePoint now) {
  last_materialization_reason_ = reason;
  recent_materializations_.push_back(now);
  RemoveExpiredMaterializations(now);

  // Repeated off-screen access is a signal that freezing this segment would
  // thrash. Pin it briefly so the caller can keep authoritative state warm.
  if (recent_materializations_.size() >= 3) {
    pinned_until_ = std::max(pinned_until_, now + std::chrono::seconds(5));
  } else if (reason == MaterializationReason::kFocus ||
             reason == MaterializationReason::kSelection ||
             reason == MaterializationReason::kAccessibility) {
    pinned_until_ = std::max(pinned_until_, now + std::chrono::seconds(3));
  }
}

SegmentState SegmentLifecycle::ResolveDesiredState(
    SegmentState working_set_state,
    TimePoint now) {
  RemoveExpiredMaterializations(now);
  if (IsPinned(now)) {
    return SegmentState::kPinned;
  }
  return working_set_state;
}

}  // namespace longview
