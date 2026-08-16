// Copyright 2026 LongView Chromium contributors

#include "longview/common/long_page_policy.h"

#include <algorithm>

namespace longview {
namespace {

double Clamp(double value, double minimum, double maximum) {
  return std::min(maximum, std::max(minimum, value));
}

bool Intersects(double a_start,
                double a_end,
                double b_start,
                double b_end) {
  return a_end >= b_start && a_start <= b_end;
}

}  // namespace

PolicyRanges ComputePolicyRanges(const PolicyInput& input) {
  const double viewport_height = std::max(1.0, input.viewport_height);
  const double viewport_top = std::max(0.0, input.viewport_top);
  const double viewport_bottom = viewport_top + viewport_height;
  const double hot_screens = Clamp(input.config.hot_screens, 0.5, 8.0);
  const double warm_screens = Clamp(input.config.warm_screens, 2.0, 30.0);
  const double prediction_ms = Clamp(input.config.prediction_ms, 0.0, 1000.0);
  const double velocity_limit =
      Clamp(input.config.velocity_limit, 1000.0, 50000.0);
  const double velocity =
      Clamp(input.scroll_velocity, -velocity_limit, velocity_limit);
  const double predicted_top = std::max(
      0.0, viewport_top + velocity * prediction_ms / 1000.0);
  const double predicted_bottom = predicted_top + viewport_height;

  const double forward_bias = velocity >= 0.0 ? 1.35 : 0.65;
  const double backward_bias = velocity >= 0.0 ? 0.65 : 1.35;
  const double anchor_start = std::min(viewport_top, predicted_top);
  const double anchor_end = std::max(viewport_bottom, predicted_bottom);

  PolicyRanges output;
  output.viewport_top = viewport_top;
  output.viewport_bottom = viewport_bottom;
  output.predicted_top = predicted_top;
  output.predicted_bottom = predicted_bottom;
  output.hot_start = std::max(
      0.0, anchor_start - hot_screens * viewport_height * backward_bias);
  output.hot_end =
      anchor_end + hot_screens * viewport_height * forward_bias;
  output.warm_start = std::max(
      0.0, anchor_start - warm_screens * viewport_height * backward_bias);
  output.warm_end =
      anchor_end + warm_screens * viewport_height * forward_bias;
  return output;
}

SegmentState ClassifySegment(double segment_top,
                             double segment_height,
                             const PolicyInput& input) {
  const PolicyRanges ranges = ComputePolicyRanges(input);
  const double segment_bottom = segment_top + std::max(1.0, segment_height);
  if (Intersects(segment_top, segment_bottom, ranges.hot_start,
                 ranges.hot_end)) {
    return SegmentState::kHot;
  }
  if (Intersects(segment_top, segment_bottom, ranges.warm_start,
                 ranges.warm_end)) {
    return SegmentState::kWarm;
  }
  return SegmentState::kCold;
}

}  // namespace longview
