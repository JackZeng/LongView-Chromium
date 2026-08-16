#ifndef LONGVIEW_SEGMENT_INDEX_H_
#define LONGVIEW_SEGMENT_INDEX_H_

#include <cstddef>
#include <cstdint>
#include <utility>
#include <vector>

#include "longview/segment_model.h"

namespace longview {

class SegmentIndex {
 public:
  void Rebuild(const std::vector<Segment>& segments);
  std::size_t size() const;
  std::pair<std::size_t, std::size_t> Intersecting(double start,
                                                   double end) const;
  const Segment* At(std::size_t position) const;
  Segment* MutableAt(std::size_t position);

 private:
  std::vector<Segment*> segments_;
};

}  // namespace longview

#endif  // LONGVIEW_SEGMENT_INDEX_H_
