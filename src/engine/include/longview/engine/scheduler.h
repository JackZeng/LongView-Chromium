#pragma once

#include <cstdint>
#include <unordered_map>

#include "longview/engine/types.h"

namespace longview::engine {

struct SchedulerInput {
  SegmentState state = SegmentState::kCold;
  double distance_to_viewport = 0.0;
  double scroll_velocity = 0.0;
  bool in_scroll_direction = false;
  bool has_pending_observer_work = false;
  bool has_pending_raster = false;
};

class SchedulerCoordinator {
 public:
  [[nodiscard]] WorkPriority ComputePriority(const SchedulerInput& input) const;
  void Update(std::uint64_t segment_id, const SchedulerInput& input);
  [[nodiscard]] WorkPriority PriorityFor(std::uint64_t segment_id) const;

 private:
  std::unordered_map<std::uint64_t, WorkPriority> priorities_;
};

}  // namespace longview::engine
