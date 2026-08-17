#include <cstdlib>
#include <iostream>

#include "longview/blink/blink_cold_backend.h"

namespace {
#define CHECK(condition) do { if (!(condition)) { std::cerr << "CHECK failed: " #condition << '\n'; std::abort(); } } while (false)

class FakeDelegate final : public longview::blink_bridge::DerivedStateDelegate {
 public:
  longview::engine::FreezeResult ReleaseDerivedState(
      std::uint64_t,
      const longview::engine::GeometryCapsule& capsule,
      const longview::engine::DerivedStateEstimate& estimate) override {
    if (!capsule.geometry_valid) return {};
    ++releases;
    return {.success = true, .released = estimate};
  }
  bool RestoreDerivedState(std::uint64_t) override {
    ++restores;
    return true;
  }
  int releases = 0;
  int restores = 0;
};
}  // namespace

int main() {
  FakeDelegate delegate;
  longview::blink_bridge::BlinkColdBackend backend(delegate);
  longview::engine::GeometryCapsule capsule;
  capsule.segment_id = 7;
  capsule.block_size = 1000;
  capsule.geometry_valid = true;
  longview::engine::DerivedStateEstimate estimate{
      .layout_bytes = 100,
      .paint_bytes = 200,
      .raster_bytes = 300,
      .accessibility_bytes = 40,
  };
  const auto result = backend.Freeze(7, capsule, estimate);
  CHECK(result.success);
  CHECK(delegate.releases == 1);
  CHECK(backend.IsFrozen(7));
  CHECK(backend.ReleasedBytes() == 640);
  CHECK(backend.Thaw(7));
  CHECK(delegate.restores == 1);
  CHECK(backend.ReleasedBytes() == 0);
  std::cout << "LongView Blink bridge contract passed.\n";
  return 0;
}
