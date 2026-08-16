#include "longview/segment_index.h"

#include <algorithm>

namespace longview {

void SegmentIndex::Rebuild(const std::vector<Segment>& segments) {
  segments_.clear();
  segments_.reserve(segments.size());
  for (const auto& segment : segments) {
    segments_.push_back(const_cast<Segment*>(&segment));
  }
  std::sort(segments_.begin(), segments_.end(),
            [](const Segment* left, const Segment* right) {
              if (left->start == right->start) {
                return left->id < right->id;
              }
              return left->start < right->start;
            });
}

std::size_t SegmentIndex::size() const {
  return segments_.size();
}

std::pair<std::size_t, std::size_t> SegmentIndex::Intersecting(
    double start,
    double end) const {
  if (segments_.empty() || end < start) {
    return {0, 0};
  }
  const auto first = std::lower_bound(
      segments_.begin(), segments_.end(), start,
      [](const Segment* segment, double value) {
        return segment->end < value;
      });
  const auto last = std::upper_bound(
      first, segments_.end(), end,
      [](double value, const Segment* segment) {
        return value < segment->start;
      });
  return {static_cast<std::size_t>(first - segments_.begin()),
          static_cast<std::size_t>(last - segments_.begin())};
}

const Segment* SegmentIndex::At(std::size_t position) const {
  return position < segments_.size() ? segments_[position] : nullptr;
}

Segment* SegmentIndex::MutableAt(std::size_t position) {
  return position < segments_.size() ? segments_[position] : nullptr;
}

}  // namespace longview
