#include "longview/common/segment_index.h"

#include <algorithm>

namespace longview {

void SegmentIndex::Reset(std::vector<IndexedSegment> segments) {
  std::sort(segments.begin(), segments.end(),
            [](const IndexedSegment& left, const IndexedSegment& right) {
              if (left.start == right.start) {
                return left.id < right.id;
              }
              return left.start < right.start;
            });
  segments_ = std::move(segments);
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
      [](const IndexedSegment& segment, double value) {
        return segment.end < value;
      });
  const auto last = std::upper_bound(
      first, segments_.end(), end,
      [](double value, const IndexedSegment& segment) {
        return value < segment.start;
      });
  return {static_cast<std::size_t>(first - segments_.begin()),
          static_cast<std::size_t>(last - segments_.begin())};
}

}  // namespace longview
