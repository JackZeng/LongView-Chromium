#include "longview/engine/scheduler.h"

#include <cmath>

namespace longview::engine {

WorkPriority SchedulerCoordinator::ComputePriority(const SchedulerInput& input) const {
  if (input.state == SegmentState::kPinned || input.state == SegmentState::kHot) {
    return WorkPriority::kInputCritical;
  }
  if (input.state == SegmentState::kCold) {
    return input.has_pending_observer_work ? WorkPriority::kBackground
                                           : WorkPriority::kSuspended;
  }
  const double speed = std::abs(input.scroll_velocity);
  if (input.has_pending_raster && input.in_scroll_direction &&
      (speed > 0.25 || input.distance_to_viewport < 1200.0)) {
    return WorkPriority::kRasterSoon;
  }
  return input.has_pending_observer_work ? WorkPriority::kNormal
                                         : WorkPriority::kBackground;
}

void SchedulerCoordinator::Update(std::uint64_t segment_id,
                                  const SchedulerInput& input) {
  priorities_.insert_or_assign(segment_id, ComputePriority(input));
}

WorkPriority SchedulerCoordinator::PriorityFor(std::uint64_t segment_id) const {
  const auto it = priorities_.find(segment_id);
  return it == priorities_.end() ? WorkPriority::kNormal : it->second;
}

}  // namespace longview::engine
