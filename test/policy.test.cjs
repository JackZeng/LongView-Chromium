'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SegmentState, classifySegment, computePolicyRanges } = require('../src/engine/policy.cjs');
const { lowerBoundByBottom, upperBoundByTop } = require('../src/engine/longview-engine.cjs');

const base = { viewportTop: 1000, viewportHeight: 800, velocity: 0, config: { hotScreens: 1, warmScreens: 4, predictionMs: 0 } };

test('classifies near, prefetched, and distant segments', () => {
  assert.equal(classifySegment({ ...base, top: 900, height: 200 }), SegmentState.HOT);
  assert.equal(classifySegment({ ...base, top: 3000, height: 200 }), SegmentState.WARM);
  assert.equal(classifySegment({ ...base, top: 9000, height: 200 }), SegmentState.COLD);
});

test('prediction biases ranges in scroll direction', () => {
  const stationary = computePolicyRanges(base);
  const moving = computePolicyRanges({ ...base, velocity: 4000, config: { ...base.config, predictionMs: 250 } });
  assert.ok(moving.predictedTop > stationary.predictedTop);
  assert.ok(moving.warmEnd > stationary.warmEnd);
});

test('binary search bounds only select intersecting segment window', () => {
  const segments = [0, 100, 200, 300, 400].map((top) => ({ top, height: 80 }));
  assert.equal(lowerBoundByBottom(segments, 150), 1);
  assert.equal(upperBoundByTop(segments, 320), 4);
});


test('policy accepts a disabled prediction window', () => {
  const ranges = computePolicyRanges({ ...base, velocity: 5000, config: { ...base.config, predictionMs: 0 } });
  assert.equal(ranges.predictedTop, base.viewportTop);
});
