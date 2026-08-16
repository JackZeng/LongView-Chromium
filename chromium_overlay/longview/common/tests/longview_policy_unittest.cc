#include <cassert>
#include <cmath>
#include <iostream>
#include <vector>

#include "longview/common/longview_policy.h"
#include "longview/common/segment_index.h"

int main() {
  longview::PolicyConfig config;

  longview::EligibilityInput safe;
  safe.start = 100.0;
  safe.end = 900.0;
  safe.block_size = 800.0;
  const auto safe_result = longview::EvaluateEligibility(safe, config);
  assert(safe_result.eligible);
  assert(!safe_result.pin);

  auto sticky = safe;
  sticky.has_cross_boundary_sticky = true;
  const auto sticky_result = longview::EvaluateEligibility(sticky, config);
  assert(!sticky_result.eligible);
  assert(sticky_result.reason ==
         longview::IneligibleReason::kCrossBoundaryPositioning);

  const auto down = longview::ComputeWorkingSet(1000.0, 1800.0, 2400.0, 1,
                                                 config);
  const auto up = longview::ComputeWorkingSet(1000.0, 1800.0, 2400.0, -1,
                                               config);
  assert(down.warm_end - 1800.0 > 1000.0 - down.warm_start);
  assert(1000.0 - up.warm_start > up.warm_end - 1800.0);

  longview::SegmentRecord far;
  far.start = 30'000.0;
  far.end = 31'000.0;
  far.state = longview::SegmentState::kHot;
  far.last_hot_ms = 900;
  assert(longview::Classify(far, down, config, 1000) ==
         longview::SegmentState::kWarm);
  assert(longview::Classify(far, down, config, 5000) ==
         longview::SegmentState::kCold);
  far.recent_materializations = config.pin_after_materializations;
  assert(longview::Classify(far, down, config, 5000) ==
         longview::SegmentState::kPinned);

  longview::SegmentIndex index;
  index.Reset({{3, 300.0, 380.0}, {1, 0.0, 100.0}, {2, 150.0, 250.0}});
  assert(index.size() == 3);
  const auto range = index.Intersecting(175.0, 325.0);
  assert(range.first == 1);
  assert(range.second == 3);

  std::cout << "LongView overlay policy tests passed.\n";
  return 0;
}
