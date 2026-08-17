#pragma once

#include <cstddef>
#include <cstdint>
#include <unordered_map>

#include "longview/engine/cold_backend.h"

namespace longview::blink_bridge {

class DerivedStateDelegate {
 public:
  virtual ~DerivedStateDelegate() = default;
  virtual engine::FreezeResult ReleaseDerivedState(
      std::uint64_t segment_id,
      const engine::GeometryCapsule& capsule,
      const engine::DerivedStateEstimate& estimate) = 0;
  virtual bool RestoreDerivedState(std::uint64_t segment_id) = 0;
};

// Engine-facing adapter. A Blink owner supplies a delegate that performs the
// actual display-lock/layout/paint work. The controller remains testable
// without importing Blink headers into its policy layer.
class BlinkColdBackend final : public engine::ColdBackend {
 public:
  explicit BlinkColdBackend(DerivedStateDelegate& delegate);

  engine::FreezeResult Freeze(
      std::uint64_t segment_id,
      const engine::GeometryCapsule& capsule,
      const engine::DerivedStateEstimate& estimate) override;
  bool Thaw(std::uint64_t segment_id) override;
  [[nodiscard]] bool IsFrozen(std::uint64_t segment_id) const override;
  [[nodiscard]] std::size_t ReleasedBytes() const override;

 private:
  DerivedStateDelegate& delegate_;
  std::unordered_map<std::uint64_t, engine::DerivedStateEstimate> frozen_;
  std::size_t released_bytes_ = 0;
};

}  // namespace longview::blink_bridge
