import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(here, "../shared/core.js"), "utf8");
const context = vm.createContext({ globalThis: {} });
context.globalThis = context;
vm.runInContext(source, context);
const Core = context.LongViewCore;

test("normalizes unsafe settings", () => {
  const settings = Core.normalizeSettings({ mode: "unknown", hotScreens: 99, minimumSegments: 1, excludedHosts: [" Example.com ", ""] });
  assert.equal(settings.mode, "conservative");
  assert.equal(settings.hotScreens, 6);
  assert.equal(settings.minimumSegments, 4);
  assert.deepEqual([...settings.excludedHosts], ["example.com"]);
});

test("predictive working set expands in scroll direction", () => {
  const down = Core.computeWorkingSet({ scrollY: 10_000, viewportHeight: 1000, velocity: 5000, documentHeight: 100_000, settings: {} });
  const up = Core.computeWorkingSet({ scrollY: 10_000, viewportHeight: 1000, velocity: -5000, documentHeight: 100_000, settings: {} });
  assert.equal(down.direction, 1);
  assert.equal(up.direction, -1);
  assert.ok(down.warmBottom > up.warmBottom);
  assert.ok(up.warmTop < down.warmTop);
});

test("classifies and indexes segment ranges", () => {
  const segments = [
    { top: 0, bottom: 99 }, { top: 100, bottom: 199 }, { top: 200, bottom: 299 }, { top: 300, bottom: 399 }
  ];
  assert.deepEqual({ ...Core.rangeForWindow(segments, 120, 280) }, { start: 1, end: 3 });
  assert.equal(Core.classifySegment(segments[1], { hotTop: 110, hotBottom: 160, warmTop: 0, warmBottom: 500 }), "hot");
  assert.equal(Core.classifySegment(segments[3], { hotTop: 110, hotBottom: 160, warmTop: 0, warmBottom: 500 }), "warm");
});

test("matches exact and wildcard hosts", () => {
  assert.equal(Core.hostMatches("chat.example.com", "example.com"), true);
  assert.equal(Core.hostMatches("chat.example.com", "*.example.com"), true);
  assert.equal(Core.hostMatches("notexample.com", "example.com"), false);
});
