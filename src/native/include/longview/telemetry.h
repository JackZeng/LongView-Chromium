#ifndef LONGVIEW_TELEMETRY_H_
#define LONGVIEW_TELEMETRY_H_

#include <array>
#include <cstddef>

#include "longview/segment_model.h"

namespace longview {

struct StateCounts {
  std::size_t hot = 0;
  std::size_t warm = 0;
  std::size_t cold = 0;
  std::size_t pinned = 0;
};

struct PolicyTelemetry {
  std::size_t segment_count = 0;
  std::size_t eligible_count = 0;
  std::size_t ineligible_count = 0;
  std::array<std::size_t, 8> ineligible_reasons{};
  StateCounts states;
  std::array<std::size_t, 10> materializations{};
  std::size_t transitions = 0;
  std::size_t index_rebuilds = 0;
};

std::size_t MaterializationReasonIndex(MaterializationReason reason);
std::size_t IneligibleReasonIndex(IneligibleReason reason);

}  // namespace longview

#endif  // LONGVIEW_TELEMETRY_H_
