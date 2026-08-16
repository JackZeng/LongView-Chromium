#include "longview/telemetry.h"

namespace longview {

std::size_t MaterializationReasonIndex(MaterializationReason reason) {
  return static_cast<std::size_t>(reason);
}

std::size_t IneligibleReasonIndex(IneligibleReason reason) {
  return static_cast<std::size_t>(reason);
}

}  // namespace longview
