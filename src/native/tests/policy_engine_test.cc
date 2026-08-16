#include <cassert>
#include <cstdint>
#include <iostream>
#include <vector>

#include "longview/policy_engine.h"

namespace {

longview::Segment MakeSegment(std::uint64_t id, double start, double end) {
  longview::Segment segment;
  segment.id = id;
  segment.start = start;
  segment.end = end;
  segment.block_size = end - start;
  return segment;
}

}  // namespace

int main() {
  longview::PolicyConfig config;
  config.hot_demotion_delay_ms = 100;
  config.warm_demotion_delay_ms = 200;
  config.pin_after_materializations = 3;
  config.materialization_window_ms = 1000;

  longview::PolicyEngine engine(config);
  engine.Reset({
      MakeSegment(1, 0.0, 500.0),
      MakeSegment(2, 600.0, 1100.0),
      MakeSegment(3, 20'000.0, 20'500.0),
  });
  assert(engine.telemetry().segment_count == 3);
  assert(engine.telemetry().index_rebuilds == 1);

  longview::Viewport viewport;
  viewport.start = 0.0;
  viewport.end = 800.0;
  viewport.direction = 1;
  viewport.velocity = 0.0;
  engine.Update(viewport, 10);
  assert(engine.segments()[0].state == longview::SegmentState::kHot);

  engine.RecordMaterialization(3, longview::MaterializationReason::kGeometryQuery,
                               100);
  engine.RecordMaterialization(3, longview::MaterializationReason::kFindInPage,
                               200);
  engine.RecordMaterialization(3, longview::MaterializationReason::kFocus, 300);
  assert(engine.segments()[2].state == longview::SegmentState::kPinned);
  assert(engine.telemetry().states.pinned == 1);
  assert(engine.telemetry().materializations[
             longview::MaterializationReasonIndex(
                 longview::MaterializationReason::kGeometryQuery)] == 1);

  std::cout << "LongView policy engine tests passed.\n";
  return 0;
}
