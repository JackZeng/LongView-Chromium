#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { launchChromium } from "./browser.mjs";
import { collectCdpSnapshot } from "./cdp.mjs";

const executable = process.argv[2];
if (!executable || !fs.existsSync(executable)) {
  throw new Error("Usage: node driver-smoke.mjs /path/to/chromium");
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "longview-driver-smoke-"));
let browser = null;
try {
  browser = await launchChromium({ executable: path.resolve(executable), userDataDir: profile, headless: true });
  await browser.setDocumentContent(`<!doctype html><meta charset="utf-8"><title>CDP smoke</title>
    <main id="root"></main><script>
      const root = document.getElementById("root");
      for (let i = 0; i < 100; i += 1) {
        const item = document.createElement("article");
        item.textContent = "segment-" + i;
        root.appendChild(item);
      }
      window.__DRIVER_SMOKE__ = { count: root.children.length, title: document.title };
    <\/script>`);
  const value = await browser.client.evaluate("window.__DRIVER_SMOKE__");
  const snapshot = await collectCdpSnapshot(browser.client);
  if (value?.count !== 100 || value?.title !== "CDP smoke") {
    throw new Error(`Unexpected driver result: ${JSON.stringify(value)}`);
  }
  if (!Number.isFinite(snapshot.domCounters?.nodes) || snapshot.domCounters.nodes < 100) {
    throw new Error(`DOM counters were not collected: ${JSON.stringify(snapshot.domCounters)}`);
  }
  console.log(JSON.stringify({ browser: browser.version?.Browser, value, domCounters: snapshot.domCounters }, null, 2));
} finally {
  if (browser) await browser.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
