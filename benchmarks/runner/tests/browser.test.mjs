import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isLoopbackUrl, parseWebSocketDebuggerUrl, selectPageTarget } from "../browser.mjs";
import { hasLiveLongViewStates, resolveServedFile } from "../runner.mjs";

const targets = [
  { id: "devtools", type: "page", url: "devtools://devtools/bundled/" },
  { id: "extension", type: "page", url: "chrome-extension://abc/welcome.html" },
  { id: "benchmark", type: "page", url: "http://127.0.0.1:8080/?turns=100" }
];

test("selectPageTarget prefers the expected benchmark URL", () => {
  assert.equal(selectPageTarget(targets, "http://127.0.0.1:8080")?.id, "benchmark");
});

test("selectPageTarget ignores extension and devtools pages", () => {
  assert.equal(selectPageTarget(targets)?.id, "benchmark");
});

test("isLoopbackUrl rejects non-loopback targets", () => {
  assert.equal(isLoopbackUrl("http://127.0.0.1:9222/json"), true);
  assert.equal(isLoopbackUrl("http://localhost:9222/json"), true);
  assert.equal(isLoopbackUrl("http://192.168.1.10:9222/json"), false);
  assert.equal(isLoopbackUrl("https://127.0.0.1:9222/json"), false);
});

test("parseWebSocketDebuggerUrl validates the DevToolsActivePort endpoint", () => {
  const url = parseWebSocketDebuggerUrl("37111\n/devtools/browser/abc\n", "127.0.0.1");
  assert.equal(url, "ws://127.0.0.1:37111/devtools/browser/abc");
  assert.throws(() => parseWebSocketDebuggerUrl("bad\n/path\n", "127.0.0.1"));
  assert.throws(() => parseWebSocketDebuggerUrl("37111\n/http://evil.example\n", "127.0.0.1"));
});

test("fixture resolution stays within the configured root", () => {
  const root = path.join(os.tmpdir(), "longview-fixture");
  assert.equal(resolveServedFile(root, "index.html"), path.resolve(root, "index.html"));
  assert.equal(resolveServedFile(root, "../secret"), null);
  assert.equal(resolveServedFile(root, path.resolve(root, "..", "outside.txt")), null);
});

test("LongView smoke accepts both hot and legacy active state names", () => {
  assert.equal(hasLiveLongViewStates({ hot: 2, cold: 8 }), true);
  assert.equal(hasLiveLongViewStates({ active: 2, cold: 8 }), true);
  assert.equal(hasLiveLongViewStates({ active: 2, cold: 0 }), false);
  assert.equal(hasLiveLongViewStates(null), false);
});
