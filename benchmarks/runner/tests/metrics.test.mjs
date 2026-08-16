import assert from "node:assert/strict";
import test from "node:test";
import {
  compareSummaries,
  fitScalingExponent,
  percentile,
  summarizeRuns
} from "../metrics.mjs";

test("percentile is deterministic", () => {
  assert.equal(percentile([5, 1, 3, 4, 2], 50), 3);
  assert.equal(percentile([1, 2, 3, 4, 5], 95), 5);
});

test("summary includes frame, memory, DOM, and CDP work", () => {
  const runs = [1, 2, 3].map((value) => ({
    frameTime: { p50: value, p95: value * 2, p99: value * 3 },
    droppedFrameRatio: value / 100,
    longTasks: { totalMs: value * 10 },
    estimatedRefreshHz: 60,
    memory: { usedJSHeapSize: value * 1000 },
    cdp: {
      after: { domCounters: { nodes: value * 100 } },
      delta: {
        LayoutDuration: value / 10,
        RecalcStyleDuration: value / 20,
        ScriptDuration: value / 5,
        TaskDuration: value / 4
      }
    }
  }));
  const summary = summarizeRuns(runs);
  assert.equal(summary.medianP95FrameTime, 4);
  assert.equal(summary.medianDOMNodes, 200);
  assert.equal(summary.medianLayoutDuration, 0.2);
});

test("compare summaries returns lower-is-better ratios", () => {
  const baseline = {
    medianP50FrameTime: 10,
    medianP95FrameTime: 20,
    medianP99FrameTime: 30,
    medianDroppedFrameRatio: 0.1,
    medianLongTaskTime: 100,
    medianUsedJSHeapSize: 1000,
    medianDOMNodes: 2000,
    medianLayoutDuration: 2,
    medianRecalcStyleDuration: 1,
    medianScriptDuration: 3,
    medianTaskDuration: 4
  };
  const variant = Object.fromEntries(Object.entries(baseline).map(([key, value]) => [key, value / 2]));
  assert.equal(compareSummaries(baseline, variant).p95FrameTimeRatio, 0.5);
  assert.equal(compareSummaries(baseline, variant).layoutDurationRatio, 0.5);
});

test("scaling exponent identifies linear and sublinear growth", () => {
  const linear = fitScalingExponent([
    { turns: 100, value: 10 },
    { turns: 500, value: 50 },
    { turns: 1000, value: 100 },
    { turns: 2000, value: 200 }
  ]);
  const sublinear = fitScalingExponent([
    { turns: 100, value: 10 },
    { turns: 500, value: 20 },
    { turns: 1000, value: 28 },
    { turns: 2000, value: 40 }
  ]);
  assert.ok(Math.abs(linear.exponent - 1) < 0.01);
  assert.ok(sublinear.exponent < linear.exponent);
});
