#pragma once

#include <cstddef>
#include <cstdint>
#include <deque>
#include <memory>
#include <optional>
#include <unordered_map>
#include <vector>

#include "longview/engine/cold_backend.h"
#include "longview/engine/geometry_capsule.h"
#include "longview/engine/scheduler.h"
#include "longview/engine/types.h"

namespace longview::engine {

struct PolicyConfig {
  bool enabled = false;
  double hot_margin_px = 900.0;
  double warm_margin_px = 3200.0;
  double prediction_horizon_ms = 350.0;
  double max_prediction_px = 12000.0;
  double cold_hysteresis_ms = 700.0;
  double pin_duration_ms = 5000.0;
  double thrash_window_ms = 10000.0;
  std::size_t thrash_threshold = 3;
  std::size_t max_warm_segments = 48;
};

struct ViewportState {
  double top = 0.0;
  double height = 0.0;
  double velocity_px_per_ms = 0.0;
  double now_ms = 0.0;
};

struct SegmentCapabilities {
  bool eligible = true;
  bool has_focus = false;
  bool has_selection = false;
  bool media_active = false;
  bool overlay_active = false;
  bool accessibility_active = false;
  bool editable = false;
};

struct SegmentRecord {
  std::uint64_t id = 0;
  double start = 0.0;
  double size = 0.0;
  std::uint64_t style_generation = 0;
  std::uint64_t content_generation = 0;
  SegmentCapabilities capabilities;
  DerivedStateEstimate derived_state;
  SegmentState state = SegmentState::kHot;
  double last_near_ms = 0.0;
  double pinned_until_ms = 0.0;
  std::deque<double> materialization_times;
  std::size_t transition_count = 0;
};

struct ControllerStats {
  std::size_t hot = 0;
  std::size_t warm = 0;
  std::size_t cold = 0;
  std::size_t pinned = 0;
  std::size_t transitions = 0;
  std::size_t materializations = 0;
  std::size_t thrash_pins = 0;
  std::size_t freeze_failures = 0;
  std::size_t released_bytes = 0;
};

class LongPageController {
 public:
  explicit LongPageController(PolicyConfig config,
                              std::unique_ptr<ColdBackend> backend);

  bool RegisterSegment(SegmentRecord segment, GeometryCapsule capsule);
  bool RemoveSegment(std::uint64_t segment_id);
  bool UpdateGeometry(std::uint64_t segment_id, double start, double size,
                      std::uint64_t style_generation);
  bool UpdateCapabilities(std::uint64_t segment_id,
                          SegmentCapabilities capabilities,
                          double now_ms);
  void UpdateViewport(const ViewportState& viewport);
  bool Materialize(std::uint64_t segment_id, MaterializationReason reason,
                   double now_ms);
  bool NotifyMutation(std::uint64_t segment_id, double now_ms);

  [[nodiscard]] const SegmentRecord* GetSegment(std::uint64_t segment_id) const;
  [[nodiscard]] SegmentState StateFor(std::uint64_t segment_id) const;
  [[nodiscard]] const GeometryCapsule* CapsuleFor(std::uint64_t segment_id) const;
  [[nodiscard]] WorkPriority PriorityFor(std::uint64_t segment_id) const;
  [[nodiscard]] ControllerStats stats() const;
  [[nodiscard]] const PolicyConfig& config() const { return config_; }

 private:
  SegmentState DesiredState(const SegmentRecord& segment,
                            const ViewportState& viewport,
                            double predicted_top,
                            double predicted_bottom) const;
  bool MustPin(const SegmentRecord& segment, double now_ms) const;
  void Transition(SegmentRecord& segment, SegmentState next,
                  double now_ms);
  void TrimThrashHistory(SegmentRecord& segment, double now_ms);
  void RecomputeScheduler(const ViewportState& viewport);

  PolicyConfig config_;
  std::unique_ptr<ColdBackend> backend_;
  GeometryCapsuleStore capsules_;
  SchedulerCoordinator scheduler_;
  std::unordered_map<std::uint64_t, SegmentRecord> segments_;
  ControllerStats stats_;
};

}  // namespace longview::engine
