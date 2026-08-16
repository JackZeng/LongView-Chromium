import assert from "node:assert/strict";
import test from "node:test";
import { diffMetrics, metricsToObject } from "../cdp.mjs";

test("metricsToObject normalizes CDP metrics", () => {
  assert.deepEqual(metricsToObject({ metrics: [
    { name: "LayoutDuration", value: 1.25 },
    { name: "TaskDuration", value: 3.5 }
  ] }), { LayoutDuration: 1.25, TaskDuration: 3.5 });
});

test("diffMetrics subtracts counters and preserves new values", () => {
  assert.deepEqual(diffMetrics(
    { LayoutDuration: 1, Nodes: 10 },
    { LayoutDuration: 1.75, Nodes: 15, ScriptDuration: 0.5 }
  ), {
    LayoutDuration: 0.75,
    Nodes: 5,
    ScriptDuration: 0.5
  });
});
