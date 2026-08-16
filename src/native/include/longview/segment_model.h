#ifndef LONGVIEW_SEGMENT_MODEL_H_
#define LONGVIEW_SEGMENT_MODEL_H_

#include <cstddef>
#include <cstdint>
#include <deque>
#include <string_view>

namespace longview {

enum class SegmentState {
  kHot,
  kWarm,
  kCold,
  kPinned,
};

enum class MaterializationReason {
  kViewportApproach,
  kGeometryQuery,
  kFindInPage,
  kFocus,
  kSelection,
  kAnchorNavigation,
  kAccessibility,
  kScreenshot,
  kPrint,
  kScriptMutation,
};

enum class IneligibleReason {
  kNone,
  kInvalidGeometry,
  kTooSmall,
  kActiveInteraction,
  kLiveMedia,
  kDynamicSurface,
  kCrossBoundaryPositioning,
  kFrequentlyMaterialized,
};

struct PolicyConfig {
  double minimum_block_size = 96.0;
  double hot_viewports = 1.25;
  double warm_ahead_viewports = 7.0;
  double warm_behind_viewports = 2.5;
  double speed_ahead_viewports = 2.0;
  double speed_behind_viewports = 0.5;
  double velocity_reference = 1200.0;
  double velocity_cap = 3.0;
  std::uint64_t hot_demotion_delay_ms = 250;
  std::uint64_t warm_demotion_delay_ms = 700;
  std::uint64_t materialization_window_ms = 2000;
  std::size_t pin_after_materializations = 4;
};

struct EligibilityInput {
  double start = 0.0;
  double end = 0.0;
  double block_size = 0.0;
  bool has_focus = false;
  bool has_selection = false;
  bool is_editable = false;
  bool has_live_media = false;
  bool has_canvas = false;
  bool has_webgl = false;
  bool has_dialog = false;
  bool has_popover = false;
  bool has_cross_boundary_sticky = false;
  bool has_fixed_descendant = false;
  std::size_t recent_materializations = 0;
};

struct EligibilityResult {
  bool eligible = false;
  bool pin = false;
  IneligibleReason reason = IneligibleReason::kNone;
};

struct Viewport {
  double start = 0.0;
  double end = 0.0;
  double velocity = 0.0;
  int direction = 1;
};

struct WorkingSet {
  double hot_start = 0.0;
  double hot_end = 0.0;
  double warm_start = 0.0;
  double warm_end = 0.0;
};

struct Segment {
  std::uint64_t id = 0;
  double start = 0.0;
  double end = 0.0;
  double block_size = 0.0;
  bool eligible = true;
  bool pinned = false;
  IneligibleReason ineligible_reason = IneligibleReason::kNone;
  SegmentState state = SegmentState::kHot;
  std::uint64_t last_transition_ms = 0;
  std::uint64_t last_hot_ms = 0;
  std::uint64_t last_warm_ms = 0;
  std::deque<std::uint64_t> materialization_timestamps;
};

EligibilityResult EvaluateEligibility(const EligibilityInput& input,
                                      const PolicyConfig& config);
WorkingSet ComputeWorkingSet(const Viewport& viewport,
                             const PolicyConfig& config);
SegmentState Classify(const Segment& segment,
                      const WorkingSet& set,
                      const PolicyConfig& config,
                      std::uint64_t now_ms);
void PruneMaterializations(Segment* segment,
                           const PolicyConfig& config,
                           std::uint64_t now_ms);
std::string_view SegmentStateName(SegmentState state);
std::string_view MaterializationReasonName(MaterializationReason reason);
std::string_view IneligibleReasonName(IneligibleReason reason);

}  // namespace longview

#endif  // LONGVIEW_SEGMENT_MODEL_H_
