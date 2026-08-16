#ifndef LONGVIEW_COMMON_SEGMENT_INDEX_H_
#define LONGVIEW_COMMON_SEGMENT_INDEX_H_

#include <cstddef>
#include <cstdint>
#include <utility>
#include <vector>

namespace longview {

struct IndexedSegment {
  std::uint64_t id = 0;
  double start = 0.0;
  double end = 0.0;
};

class SegmentIndex {
 public:
  void Reset(std::vector<IndexedSegment> segments);
  std::size_t size() const;
  std::pair<std::size_t, std::size_t> Intersecting(double start,
                                                   double end) const;

 private:
  std::vector<IndexedSegment> segments_;
};

}  // namespace longview

#endif  // LONGVIEW_COMMON_SEGMENT_INDEX_H_
