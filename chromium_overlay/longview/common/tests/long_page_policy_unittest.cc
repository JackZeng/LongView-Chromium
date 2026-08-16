// Copyright 2026 LongView Chromium contributors

#include "longview/common/long_page_policy.h"

#include "testing/gtest/include/gtest/gtest.h"

namespace longview {
namespace {

TEST(LongPagePolicyTest, ClassifiesViewportAndDistantSegments) {
  PolicyInput input;
  input.viewport_top = 1000.0;
  input.viewport_height = 800.0;
  input.config.hot_screens = 1.0;
  input.config.warm_screens = 4.0;
  input.config.prediction_ms = 0.0;

  EXPECT_EQ(SegmentState::kHot, ClassifySegment(900.0, 200.0, input));
  EXPECT_EQ(SegmentState::kWarm, ClassifySegment(3000.0, 200.0, input));
  EXPECT_EQ(SegmentState::kCold, ClassifySegment(9000.0, 200.0, input));
}

TEST(LongPagePolicyTest, PredictionExtendsForwardRange) {
  PolicyInput stationary;
  stationary.viewport_top = 1000.0;
  stationary.viewport_height = 800.0;
  stationary.config.prediction_ms = 250.0;

  PolicyInput moving = stationary;
  moving.scroll_velocity = 4000.0;

  const PolicyRanges stationary_ranges = ComputePolicyRanges(stationary);
  const PolicyRanges moving_ranges = ComputePolicyRanges(moving);
  EXPECT_GT(moving_ranges.predicted_top, stationary_ranges.predicted_top);
  EXPECT_GT(moving_ranges.warm_end, stationary_ranges.warm_end);
}

}  // namespace
}  // namespace longview
