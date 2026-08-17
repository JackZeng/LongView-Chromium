#include "longview/blink/blink_cold_backend.h"

namespace longview::blink_bridge {

BlinkColdBackend::BlinkColdBackend(DerivedStateDelegate& delegate)
    : delegate_(delegate) {}

engine::FreezeResult BlinkColdBackend::Freeze(
    std::uint64_t segment_id,
    const engine::GeometryCapsule& capsule,
    const engine::DerivedStateEstimate& estimate) {
  if (const auto existing = frozen_.find(segment_id); existing != frozen_.end()) {
    return {.success = true, .released = existing->second};
  }
  engine::FreezeResult result =
      delegate_.ReleaseDerivedState(segment_id, capsule, estimate);
  if (!result.success) return result;
  frozen_.emplace(segment_id, result.released);
  released_bytes_ += result.released.total();
  return result;
}

bool BlinkColdBackend::Thaw(std::uint64_t segment_id) {
  const auto existing = frozen_.find(segment_id);
  if (existing == frozen_.end()) return false;
  if (!delegate_.RestoreDerivedState(segment_id)) return false;
  released_bytes_ -= existing->second.total();
  frozen_.erase(existing);
  return true;
}

bool BlinkColdBackend::IsFrozen(std::uint64_t segment_id) const {
  return frozen_.contains(segment_id);
}

std::size_t BlinkColdBackend::ReleasedBytes() const {
  return released_bytes_;
}

}  // namespace longview::blink_bridge
