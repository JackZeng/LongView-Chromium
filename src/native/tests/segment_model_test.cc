#include "longview/segment_model.h"

#include <cassert>
#include <chrono>
#include <iostream>

using longview::ClassifySegment;
using longview::ComputeWorkingSet;
using longview::MaterializationReason;
using longview::SegmentGeometry;
using longview::SegmentLifecycle;
using longview::SegmentState;
using longview::WorkingSetSettings;

int main() {
  const WorkingSetSettings settings;
  const auto down = ComputeWorkingSet(10'000, 1'000, 4'000, 100'000, settings);
  assert(down.direction == 1);
  assert(down.warm_bottom > 17'000);
  assert(down.warm_top < 10'000);

  assert(ClassifySegment({10'200, 500}, down) == SegmentState::kHot);
  assert(ClassifySegment({16'000, 500}, down) == SegmentState::kWarm);
  assert(ClassifySegment({50'000, 500}, down) == SegmentState::kCold);

  SegmentLifecycle lifecycle({50'000, 500});
  const auto now = SegmentLifecycle::Clock::now();
  assert(lifecycle.TransitionTo(SegmentState::kWarm, now));
  assert(!lifecycle.TransitionTo(SegmentState::kWarm, now));
  assert(lifecycle.transition_count() == 1);

  lifecycle.RecordMaterialization(MaterializationReason::kGeometryQuery, now);
  lifecycle.RecordMaterialization(MaterializationReason::kGeometryQuery,
                                  now + std::chrono::milliseconds(200));
  lifecycle.RecordMaterialization(MaterializationReason::kFindInPage,
                                  now + std::chrono::milliseconds(400));
  assert(lifecycle.IsPinned(now + std::chrono::seconds(1)));
  assert(lifecycle.ResolveDesiredState(SegmentState::kCold,
                                       now + std::chrono::seconds(1)) ==
         SegmentState::kPinned);
  assert(lifecycle.ResolveDesiredState(SegmentState::kCold,
                                       now + std::chrono::seconds(7)) ==
         SegmentState::kCold);

  std::cout << "LongView native segment model tests passed\n";
  return 0;
}
