import test from "node:test";
import assert from "node:assert/strict";
import { percentile, summarizeRuns, compareSummaries } from "../metrics.mjs";

test("percentile uses nearest-rank semantics", () => {
  assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
  assert.equal(percentile([5, 1, 3, 2, 4], 95), 5);
});

test("summarize and compare benchmark runs", () => {
  const make = (p95, dropped, totalMs, heap) => ({
    frameTime: { p50: p95 / 2, p95, p99: p95 * 1.5 },
    droppedFrameRatio: dropped,
    longTasks: { totalMs },
    estimatedRefreshHz: 60,
    memory: { usedJSHeapSize: heap }
  });
  const baseline = summarizeRuns([
    make(20, 0.2, 100, 200),
    make(22, 0.3, 120, 220),
    make(18, 0.1, 80, 180)
  ]);
  const variant = summarizeRuns([
    make(10, 0.1, 50, 100),
    make(11, 0.15, 60, 110),
    make(9, 0.05, 40, 90)
  ]);
  const comparison = compareSummaries(baseline, variant);
  assert.equal(comparison.p50FrameTimeRatio, 0.5);
  assert.equal(comparison.p95FrameTimeRatio, 0.5);
  assert.equal(comparison.p99FrameTimeRatio, 0.5);
  assert.equal(comparison.longTaskTimeRatio, 0.5);
  assert.equal(comparison.usedHeapRatio, 0.5);
});
