#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

namespace longview::engine {

struct AnchorRecord {
  std::string name;
  double local_offset = 0.0;
};

struct GeometryCapsule {
  std::uint64_t segment_id = 0;
  double block_start = 0.0;
  double block_size = 0.0;
  std::uint64_t style_generation = 0;
  std::uint64_t content_generation = 0;
  std::string text_digest;
  std::vector<AnchorRecord> anchors;
  bool geometry_valid = false;

  [[nodiscard]] bool ContainsDocumentOffset(double offset) const;
  [[nodiscard]] std::optional<double> ResolveAnchor(std::string_view name) const;
};

class GeometryCapsuleStore {
 public:
  void Put(GeometryCapsule capsule);
  [[nodiscard]] const GeometryCapsule* Get(std::uint64_t segment_id) const;
  [[nodiscard]] GeometryCapsule* GetMutable(std::uint64_t segment_id);
  bool Erase(std::uint64_t segment_id);
  void InvalidateContent(std::uint64_t segment_id, std::uint64_t next_generation);
  [[nodiscard]] std::size_t size() const { return capsules_.size(); }

 private:
  std::unordered_map<std::uint64_t, GeometryCapsule> capsules_;
};

}  // namespace longview::engine
