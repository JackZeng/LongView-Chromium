#pragma once

#include <cstddef>
#include <cstdint>
#include <unordered_map>

#include "longview/engine/geometry_capsule.h"

namespace longview::engine {

struct DerivedStateEstimate {
  std::size_t layout_bytes = 0;
  std::size_t paint_bytes = 0;
  std::size_t raster_bytes = 0;
  std::size_t accessibility_bytes = 0;

  [[nodiscard]] std::size_t total() const {
    return layout_bytes + paint_bytes + raster_bytes + accessibility_bytes;
  }
};

struct FreezeResult {
  bool success = false;
  DerivedStateEstimate released;
};

class ColdBackend {
 public:
  virtual ~ColdBackend() = default;
  virtual FreezeResult Freeze(std::uint64_t segment_id,
                              const GeometryCapsule& capsule,
                              const DerivedStateEstimate& estimate) = 0;
  virtual bool Thaw(std::uint64_t segment_id) = 0;
  [[nodiscard]] virtual bool IsFrozen(std::uint64_t segment_id) const = 0;
  [[nodiscard]] virtual std::size_t ReleasedBytes() const = 0;
};

class InMemoryColdBackend final : public ColdBackend {
 public:
  FreezeResult Freeze(std::uint64_t segment_id,
                      const GeometryCapsule& capsule,
                      const DerivedStateEstimate& estimate) override;
  bool Thaw(std::uint64_t segment_id) override;
  [[nodiscard]] bool IsFrozen(std::uint64_t segment_id) const override;
  [[nodiscard]] std::size_t ReleasedBytes() const override { return released_bytes_; }
  [[nodiscard]] std::size_t frozen_count() const { return frozen_.size(); }
  [[nodiscard]] std::size_t released_bytes() const { return released_bytes_; }

 private:
  struct FrozenRecord {
    GeometryCapsule capsule;
    DerivedStateEstimate released;
  };
  std::unordered_map<std::uint64_t, FrozenRecord> frozen_;
  std::size_t released_bytes_ = 0;
};

}  // namespace longview::engine
