#include <cassert>
#include <cmath>
#include <iostream>

#include "longview/segment_model.h"

int main() {
  longview::PolicyConfig config;

  longview::EligibilityInput safe;
  safe.start = 100.0;
  safe.end = 900.0;
  safe.block_size = 800.0;
  const auto safe_result = longview::EvaluateEligibility(safe, config);
  assert(safe_result.eligible);
  assert(!safe_result.pin);

  auto dynamic = safe;
  dynamic.has_canvas = true;
  const auto dynamic_result = longview::EvaluateEligibility(dynamic, config);
  assert(!dynamic_result.eligible);
  assert(dynamic_result.reason == longview::IneligibleReason::kDynamicSurface);

  auto sticky = safe;
  sticky.has_cross_boundary_sticky = true;
  const auto sticky_result = longview::EvaluateEligibility(sticky, config);
  assert(!sticky_result.eligible);
  assert(sticky_result.reason ==
         longview::IneligibleReason::kCrossBoundaryPositioning);

  longview::Viewport down;
  down.start = 1000.0;
  down.end = 1800.0;
  down.velocity = 2400.0;
  down.direction = 1;
  const auto down_set = longview::ComputeWorkingSet(down, config);
  down.direction = -1;
  const auto up_set = longview::ComputeWorkingSet(down, config);
  assert(down_set.warm_end - 1800.0 > 1000.0 - down_set.warm_start);
  assert(1000.0 - up_set.warm_start > up_set.warm_end - 1800.0);

  longview::Segment far;
  far.start = 30'000.0;
  far.end = 31'000.0;
  far.state = longview::SegmentState::kHot;
  far.last_hot_ms = 900;
  assert(longview::Classify(far, down_set, config, 1000) ==
         longview::SegmentState::kWarm);
  assert(longview::Classify(far, down_set, config, 5000) ==
         longview::SegmentState::kCold);

  far.materialization_timestamps = {100, 200, 300, 400};
  assert(longview::Classify(far, down_set, config, 5000) ==
         longview::SegmentState::kPinned);
  longview::PruneMaterializations(&far, config, 5000);
  assert(far.materialization_timestamps.empty());

  std::cout << "LongView segment model tests passed.\n";
  return 0;
}
