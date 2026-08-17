#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <string>

#include "longview/engine/long_page_controller.h"

using longview::engine::GeometryCapsule;
using longview::engine::InMemoryColdBackend;
using longview::engine::LongPageController;
using longview::engine::MaterializationReason;
using longview::engine::PolicyConfig;
using longview::engine::SegmentCapabilities;
using longview::engine::SegmentRecord;
using longview::engine::SegmentState;
using longview::engine::ViewportState;
using longview::engine::WorkPriority;

namespace {

void Check(bool condition, const char* expression, const char* file, int line) {
  if (condition) return;
  std::cerr << "CHECK failed: " << expression << " at " << file << ':' << line << '\n';
  std::exit(1);
}

#define CHECK(expression) Check(static_cast<bool>(expression), #expression, __FILE__, __LINE__)

SegmentRecord MakeSegment(std::uint64_t id, double start) {
  SegmentRecord segment;
  segment.id = id;
  segment.start = start;
  segment.size = 800.0;
  segment.derived_state.layout_bytes = 4096;
  segment.derived_state.paint_bytes = 2048;
  segment.derived_state.raster_bytes = 8192;
  segment.derived_state.accessibility_bytes = 1024;
  return segment;
}

GeometryCapsule MakeCapsule(std::uint64_t id, double start) {
  GeometryCapsule capsule;
  capsule.segment_id = id;
  capsule.block_start = start;
  capsule.block_size = 800.0;
  capsule.geometry_valid = true;
  capsule.text_digest = "digest-" + std::to_string(id);
  capsule.anchors.push_back({"anchor-" + std::to_string(id), 120.0});
  return capsule;
}

void TestFeatureOffPreservesHot() {
  LongPageController controller(PolicyConfig{}, std::make_unique<InMemoryColdBackend>());
  CHECK(controller.RegisterSegment(MakeSegment(1, 0), MakeCapsule(1, 0)));
  CHECK(controller.RegisterSegment(MakeSegment(2, 8000), MakeCapsule(2, 8000)));
  controller.UpdateViewport({.top = 0, .height = 900, .now_ms = 1000});
  CHECK(controller.StateFor(1) == SegmentState::kHot);
  CHECK(controller.StateFor(2) == SegmentState::kHot);
}

void TestWorkingSetAndColdRelease() {
  PolicyConfig config;
  config.enabled = true;
  config.cold_hysteresis_ms = 0;
  LongPageController controller(config, std::make_unique<InMemoryColdBackend>());
  for (std::uint64_t i = 1; i <= 20; ++i) {
    const double start = static_cast<double>((i - 1) * 900);
    CHECK(controller.RegisterSegment(MakeSegment(i, start), MakeCapsule(i, start)));
  }
  controller.UpdateViewport({.top = 0, .height = 900, .velocity_px_per_ms = 1.0, .now_ms = 1000});
  const auto stats = controller.stats();
  CHECK(stats.hot > 0);
  CHECK(stats.warm > 0);
  CHECK(stats.cold > 0);
  CHECK(stats.released_bytes > 0);
  CHECK(controller.PriorityFor(1) == WorkPriority::kInputCritical);
}

void TestCorrectnessMaterializationAndThrashPin() {
  PolicyConfig config;
  config.enabled = true;
  config.cold_hysteresis_ms = 0;
  config.thrash_threshold = 3;
  config.thrash_window_ms = 1000;
  LongPageController controller(config, std::make_unique<InMemoryColdBackend>());
  CHECK(controller.RegisterSegment(MakeSegment(10, 20000), MakeCapsule(10, 20000)));
  controller.UpdateViewport({.top = 0, .height = 900, .now_ms = 10});
  CHECK(controller.StateFor(10) == SegmentState::kCold);
  CHECK(controller.Materialize(10, MaterializationReason::kGeometryQuery, 100));
  CHECK(controller.StateFor(10) == SegmentState::kPinned);
  controller.Materialize(10, MaterializationReason::kViewportApproach, 200);
  controller.Materialize(10, MaterializationReason::kViewportApproach, 300);
  CHECK(controller.stats().thrash_pins >= 1);
}

void TestGeometryAndMutation() {
  PolicyConfig config;
  config.enabled = true;
  LongPageController controller(config, std::make_unique<InMemoryColdBackend>());
  CHECK(controller.RegisterSegment(MakeSegment(7, 7000), MakeCapsule(7, 7000)));
  const auto* capsule = controller.CapsuleFor(7);
  CHECK(capsule != nullptr);
  CHECK(capsule->ResolveAnchor("anchor-7").value() == 7120.0);
  CHECK(controller.NotifyMutation(7, 50));
  capsule = controller.CapsuleFor(7);
  CHECK(capsule != nullptr);
  CHECK(capsule->text_digest.empty());
  CHECK(capsule->anchors.empty());
  CHECK(controller.StateFor(7) == SegmentState::kPinned);
}

void TestAccessibilityPins() {
  PolicyConfig config;
  config.enabled = true;
  config.cold_hysteresis_ms = 0;
  LongPageController controller(config, std::make_unique<InMemoryColdBackend>());
  CHECK(controller.RegisterSegment(MakeSegment(11, 30000), MakeCapsule(11, 30000)));
  controller.UpdateViewport({.top = 0, .height = 900, .now_ms = 100});
  CHECK(controller.StateFor(11) == SegmentState::kCold);
  SegmentCapabilities capabilities;
  capabilities.accessibility_active = true;
  CHECK(controller.UpdateCapabilities(11, capabilities, 200));
  CHECK(controller.StateFor(11) == SegmentState::kPinned);
}

}  // namespace

int main() {
  TestFeatureOffPreservesHot();
  TestWorkingSetAndColdRelease();
  TestCorrectnessMaterializationAndThrashPin();
  TestGeometryAndMutation();
  TestAccessibilityPins();
  std::cout << "LongView engine tests passed.\n";
  return 0;
}
