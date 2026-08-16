import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCampaignSummary,
  browserVersionMatchesPin,
  evaluateCampaign,
  parseTurns
} from "../campaign-lib.mjs";

function report(p95, dropped, heap, nodes, correctness = true) {
  return {
    summary: {
      medianP50FrameTime: p95 / 2,
      medianP95FrameTime: p95,
      medianP99FrameTime: p95 * 1.2,
      medianDroppedFrameRatio: dropped,
      medianLongTaskTime: p95 * 3,
      medianUsedJSHeapSize: heap,
      medianDOMNodes: nodes,
      medianLayoutDuration: p95 / 1000,
      medianRecalcStyleDuration: p95 / 1500,
      medianScriptDuration: p95 / 900,
      medianTaskDuration: p95 / 700
    },
    runs: [{
      correctness: {
        ok: correctness,
        geometryFinite: correctness,
        focusWorks: correctness,
        selectionWorks: correctness,
        anchorWorks: correctness
      }
    }]
  };
}

test("turn matrix parsing is ordered and unique", () => {
  assert.deepEqual(parseTurns("1000,100,500,500"), [100, 500, 1000]);
  assert.throws(() => parseTurns("9,100"));
  assert.throws(() => parseTurns("100"));
});

test("campaign summary calculates scaling and checks", () => {
  const entries = [100, 500, 1000].map((turns) => ({
    turns,
    baseline: report(turns / 40, 0.1, turns * 1000, turns * 50),
    longview: report(turns / 60, 0.05, turns * 900, turns * 48),
    ratios: { p95FrameTimeRatio: 2 / 3 }
  }));
  const summary = buildCampaignSummary(entries);
  const campaign = { ...summary };
  const gate = evaluateCampaign(campaign);
  assert.ok(summary.scaling.medianP95FrameTime.longview.exponent <= summary.scaling.medianP95FrameTime.baseline.exponent);
  assert.equal(gate.passed, true);
});

test("campaign gate rejects correctness failures", () => {
  const entries = [100, 500].map((turns) => ({
    turns,
    baseline: report(10, 0.02, 1, 1),
    longview: report(9, 0.02, 1, 1, turns !== 500),
    ratios: { p95FrameTimeRatio: 0.9 }
  }));
  const campaign = { ...buildCampaignSummary(entries) };
  assert.equal(evaluateCampaign(campaign).passed, false);
});

test("browser version matching accepts product prefixes but rejects another pin", () => {
  assert.equal(browserVersionMatchesPin("Chrome/151.0.7922.77", "151.0.7922.77"), true);
  assert.equal(browserVersionMatchesPin("Chromium/151.0.7922.77", "151.0.7922.77"), true);
  assert.equal(browserVersionMatchesPin("Chrome/151.0.7922.76", "151.0.7922.77"), false);
  assert.equal(browserVersionMatchesPin(null, "151.0.7922.77"), false);
});
