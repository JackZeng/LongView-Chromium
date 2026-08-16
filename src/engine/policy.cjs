'use strict';

const SegmentState = Object.freeze({
  HOT: 'hot',
  WARM: 'warm',
  COLD: 'cold'
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizePolicyConfig(input = {}) {
  return {
    hotScreens: clamp(finiteNumber(input.hotScreens, 2), 0.5, 8),
    warmScreens: clamp(finiteNumber(input.warmScreens, 8), 2, 30),
    predictionMs: clamp(finiteNumber(input.predictionMs, 240), 0, 1000),
    velocityLimit: clamp(finiteNumber(input.velocityLimit, 12000), 1000, 50000)
  };
}

function rangesIntersect(aStart, aEnd, bStart, bEnd) {
  return aEnd >= bStart && aStart <= bEnd;
}

function computePolicyRanges(input) {
  const config = normalizePolicyConfig(input.config);
  const viewportTop = Number(input.viewportTop) || 0;
  const viewportHeight = Math.max(1, Number(input.viewportHeight) || 1);
  const viewportBottom = viewportTop + viewportHeight;
  const velocity = clamp(Number(input.velocity) || 0, -config.velocityLimit, config.velocityLimit);
  const predictedTop = Math.max(0, viewportTop + (velocity * config.predictionMs) / 1000);
  const predictedBottom = predictedTop + viewportHeight;

  const forwardBias = velocity >= 0 ? 1.35 : 0.65;
  const backwardBias = velocity >= 0 ? 0.65 : 1.35;
  const hotAhead = config.hotScreens * viewportHeight * forwardBias;
  const hotBehind = config.hotScreens * viewportHeight * backwardBias;
  const warmAhead = config.warmScreens * viewportHeight * forwardBias;
  const warmBehind = config.warmScreens * viewportHeight * backwardBias;

  const anchorStart = Math.min(viewportTop, predictedTop);
  const anchorEnd = Math.max(viewportBottom, predictedBottom);

  return {
    viewportTop,
    viewportBottom,
    predictedTop,
    predictedBottom,
    hotStart: Math.max(0, anchorStart - hotBehind),
    hotEnd: anchorEnd + hotAhead,
    warmStart: Math.max(0, anchorStart - warmBehind),
    warmEnd: anchorEnd + warmAhead
  };
}

function classifySegment(input) {
  const top = Number(input.top) || 0;
  const height = Math.max(1, Number(input.height) || 1);
  const bottom = top + height;
  const ranges = computePolicyRanges(input);

  if (rangesIntersect(top, bottom, ranges.hotStart, ranges.hotEnd)) {
    return SegmentState.HOT;
  }
  if (rangesIntersect(top, bottom, ranges.warmStart, ranges.warmEnd)) {
    return SegmentState.WARM;
  }
  return SegmentState.COLD;
}

module.exports = {
  SegmentState,
  clamp,
  classifySegment,
  computePolicyRanges,
  normalizePolicyConfig,
  rangesIntersect
};
