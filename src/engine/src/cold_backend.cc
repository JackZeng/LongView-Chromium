#include "longview/engine/cold_backend.h"

namespace longview::engine {

FreezeResult InMemoryColdBackend::Freeze(std::uint64_t segment_id,
                                         const GeometryCapsule& capsule,
                                         const DerivedStateEstimate& estimate) {
  if (!capsule.geometry_valid || capsule.block_size <= 0.0) return {};
  if (const auto it = frozen_.find(segment_id); it != frozen_.end()) {
    return {.success = true, .released = it->second.released};
  }
  frozen_.emplace(segment_id, FrozenRecord{capsule, estimate});
  released_bytes_ += estimate.total();
  return {.success = true, .released = estimate};
}

bool InMemoryColdBackend::Thaw(std::uint64_t segment_id) {
  const auto it = frozen_.find(segment_id);
  if (it == frozen_.end()) return false;
  released_bytes_ -= it->second.released.total();
  frozen_.erase(it);
  return true;
}

bool InMemoryColdBackend::IsFrozen(std::uint64_t segment_id) const {
  return frozen_.contains(segment_id);
}

}  // namespace longview::engine
