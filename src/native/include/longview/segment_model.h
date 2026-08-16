#ifndef LONGVIEW_SEGMENT_MODEL_H_
#define LONGVIEW_SEGMENT_MODEL_H_

#include <chrono>
#include <cstddef>
#include <cstdint>
#include <deque>

namespace longview {

enum class SegmentState : std::uint8_t {
  kHot,
  kWarm,
  kCold,
  kPinned,
};

enum class MaterializationReason : std::uint8_t {
  kViewportApproach,
  kGeometryQuery,
  kFindInPage,
  kFocus,
  kSelection,
  kAnchorNavigation,
  kAccessibility,
  kScreenshot,
  kPrint,
  kScriptMutation,
};

struct SegmentGeometry {
  double top = 0.0;
  double height = 0.0;

  [[nodiscard]] double bottom() const { return top + height; }
};

struct WorkingSetSettings {
  double hot_screens = 1.25;
  double warm_ahead_screens = 6.0;
  double warm_behind_screens = 2.5;
  double maximum_prediction_boost_screens = 5.0;
  double prediction_seconds = 0.35;
};

struct WorkingSet {
  double hot_top = 0.0;
  double hot_bottom = 0.0;
  double warm_top = 0.0;
  double warm_bottom = 0.0;
  int direction = 0;
};

[[nodiscard]] WorkingSet ComputeWorkingSet(
    double scroll_y,
    double viewport_height,
    double velocity_pixels_per_second,
    double document_height,
    const WorkingSetSettings& settings);

[[nodiscard]] SegmentState ClassifySegment(
    const SegmentGeometry& geometry,
    const WorkingSet& working_set);

class SegmentLifecycle {
 public:
  using Clock = std::chrono::steady_clock;
  using TimePoint = Clock::time_point;

  explicit SegmentLifecycle(SegmentGeometry geometry);

  [[nodiscard]] SegmentState state() const { return state_; }
  [[nodiscard]] const SegmentGeometry& geometry() const { return geometry_; }
  [[nodiscard]] std::size_t transition_count() const { return transition_count_; }
  [[nodiscard]] bool IsPinned(TimePoint now) const;

  void SetGeometry(SegmentGeometry geometry);
  bool TransitionTo(SegmentState next, TimePoint now);
  void RecordMaterialization(MaterializationReason reason, TimePoint now);
  SegmentState ResolveDesiredState(SegmentState working_set_state, TimePoint now);

 private:
  void RemoveExpiredMaterializations(TimePoint now);

  SegmentGeometry geometry_;
  SegmentState state_ = SegmentState::kCold;
  std::size_t transition_count_ = 0;
  TimePoint pinned_until_{};
  std::deque<TimePoint> recent_materializations_;
  MaterializationReason last_materialization_reason_ =
      MaterializationReason::kViewportApproach;
};

}  // namespace longview

#endif  // LONGVIEW_SEGMENT_MODEL_H_
