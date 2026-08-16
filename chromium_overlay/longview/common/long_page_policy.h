// Copyright 2026 LongView Chromium contributors
// Use of this source code is governed by a BSD-style license that can be
// found in the LongView Chromium LICENSE file.

#ifndef LONGVIEW_COMMON_LONG_PAGE_POLICY_H_
#define LONGVIEW_COMMON_LONG_PAGE_POLICY_H_

namespace longview {

enum class SegmentState {
  kHot,
  kWarm,
  kCold,
};

struct PolicyConfig {
  double hot_screens = 2.0;
  double warm_screens = 8.0;
  double prediction_ms = 240.0;
  double velocity_limit = 12000.0;
};

struct PolicyInput {
  double viewport_top = 0.0;
  double viewport_height = 1.0;
  double scroll_velocity = 0.0;
  PolicyConfig config;
};

struct PolicyRanges {
  double viewport_top = 0.0;
  double viewport_bottom = 0.0;
  double predicted_top = 0.0;
  double predicted_bottom = 0.0;
  double hot_start = 0.0;
  double hot_end = 0.0;
  double warm_start = 0.0;
  double warm_end = 0.0;
};

PolicyRanges ComputePolicyRanges(const PolicyInput& input);
SegmentState ClassifySegment(double segment_top,
                             double segment_height,
                             const PolicyInput& input);

}  // namespace longview

#endif  // LONGVIEW_COMMON_LONG_PAGE_POLICY_H_
