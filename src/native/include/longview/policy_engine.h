#ifndef LONGVIEW_POLICY_ENGINE_H_
#define LONGVIEW_POLICY_ENGINE_H_

#include <cstdint>
#include <vector>

#include "longview/segment_index.h"
#include "longview/segment_model.h"
#include "longview/telemetry.h"

namespace longview {

class PolicyEngine {
 public:
  explicit PolicyEngine(PolicyConfig config = {});

  void Reset(std::vector<Segment> segments);
  void RebuildIndex();
  void Update(const Viewport& viewport, std::uint64_t now_ms);
  void RecordMaterialization(std::uint64_t segment_id,
                             MaterializationReason reason,
                             std::uint64_t now_ms);

  const std::vector<Segment>& segments() const;
  const PolicyTelemetry& telemetry() const;

 private:
  Segment* FindSegment(std::uint64_t id);
  void RecountEligibility();
  void RecountStates();

  PolicyConfig config_;
  std::vector<Segment> segments_;
  SegmentIndex index_;
  PolicyTelemetry telemetry_;
};

}  // namespace longview

#endif  // LONGVIEW_POLICY_ENGINE_H_
