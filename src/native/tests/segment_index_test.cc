#include <cassert>
#include <iostream>
#include <vector>

#include "longview/segment_index.h"

int main() {
  std::vector<longview::Segment> segments(4);
  segments[0].id = 4;
  segments[0].start = 500.0;
  segments[0].end = 600.0;
  segments[1].id = 1;
  segments[1].start = 0.0;
  segments[1].end = 100.0;
  segments[2].id = 3;
  segments[2].start = 300.0;
  segments[2].end = 450.0;
  segments[3].id = 2;
  segments[3].start = 150.0;
  segments[3].end = 250.0;

  longview::SegmentIndex index;
  index.Rebuild(segments);
  assert(index.size() == 4);
  assert(index.At(0)->id == 1);
  assert(index.At(3)->id == 4);

  const auto middle = index.Intersecting(175.0, 525.0);
  assert(middle.first == 1);
  assert(middle.second == 4);

  const auto empty = index.Intersecting(700.0, 800.0);
  assert(empty.first == 4);
  assert(empty.second == 4);

  std::cout << "LongView segment index tests passed.\n";
  return 0;
}
