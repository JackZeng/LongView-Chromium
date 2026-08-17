#include "longview/engine/geometry_capsule.h"

#include <algorithm>

namespace longview::engine {

bool GeometryCapsule::ContainsDocumentOffset(double offset) const {
  return geometry_valid && offset >= block_start && offset < block_start + block_size;
}

std::optional<double> GeometryCapsule::ResolveAnchor(std::string_view name) const {
  if (!geometry_valid) return std::nullopt;
  const auto it = std::find_if(anchors.begin(), anchors.end(), [name](const AnchorRecord& anchor) {
    return anchor.name == name;
  });
  if (it == anchors.end()) return std::nullopt;
  return block_start + it->local_offset;
}

void GeometryCapsuleStore::Put(GeometryCapsule capsule) {
  capsules_.insert_or_assign(capsule.segment_id, std::move(capsule));
}

const GeometryCapsule* GeometryCapsuleStore::Get(std::uint64_t segment_id) const {
  const auto it = capsules_.find(segment_id);
  return it == capsules_.end() ? nullptr : &it->second;
}

GeometryCapsule* GeometryCapsuleStore::GetMutable(std::uint64_t segment_id) {
  const auto it = capsules_.find(segment_id);
  return it == capsules_.end() ? nullptr : &it->second;
}

bool GeometryCapsuleStore::Erase(std::uint64_t segment_id) {
  return capsules_.erase(segment_id) > 0;
}

void GeometryCapsuleStore::InvalidateContent(std::uint64_t segment_id,
                                             std::uint64_t next_generation) {
  if (auto* capsule = GetMutable(segment_id)) {
    capsule->content_generation = next_generation;
    capsule->text_digest.clear();
    capsule->anchors.clear();
  }
}

}  // namespace longview::engine
