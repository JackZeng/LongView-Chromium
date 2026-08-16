#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { summarizeRuns } from "./metrics.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const fixtureRoot = path.join(repoRoot, "benchmarks/fixtures/conversation");

function parseArgs(argv) {
  const output = {
    turns: 500,
    runs: 3,
    duration: 9000,
    stream: false,
    stress: false,
    longview: false,
    headless: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--stream") output.stream = true;
    else if (arg === "--stress") output.stress = true;
    else if (arg === "--longview") output.longview = true;
    else if (arg === "--headless") output.headless = true;
    else if (arg.startsWith("--")) output[arg.slice(2)] = argv[++index];
  }

  output.turns = Number(output.turns);
  output.runs = Number(output.runs);
  output.duration = Number(output.duration);
  if (!output.executable) throw new Error("Pass --executable /path/to/chrome or chrome.exe");
  if (!Number.isInteger(output.turns) || output.turns < 10 || output.turns > 5000) {
    throw new Error("--turns must be an integer from 10 to 5000");
  }
  if (!Number.isInteger(output.runs) || output.runs < 1 || output.runs > 100) {
    throw new Error("--runs must be an integer from 1 to 100");
  }
  if (!Number.isFinite(output.duration) || output.duration < 1000 || output.duration > 300_000) {
    throw new Error("--duration must be from 1000 to 300000 milliseconds");
  }
  if (output.longview && output.turns < 50) {
    throw new Error("LongView benchmark mode requires at least 50 turns so the fixture crosses activation thresholds");
  }
  const executable = path.resolve(output.executable);
  if (!fs.existsSync(executable)) throw new Error(`Browser executable does not exist: ${executable}`);
  output.executable = executable;
  return output;
}

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

function resolveServedFile(root, relative) {
  const base = path.resolve(root);
  const file = path.resolve(base, relative);
  const relation = path.relative(base, file);
  if (relation.startsWith("..") || path.isAbsolute(relation)) return null;
  return file;
}

async function serve(root) {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = resolveServedFile(root, relative);
    if (!file) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        response.writeHead(404).end("Not found");
        return;
      }
      response.writeHead(200, { "content-type": contentType(file), "cache-control": "no-store" });
      response.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, port: server.address().port };
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function waitForLongView(page, turns) {
  const minimum = Math.min(turns, 12);
  const handle = await page.waitForFunction((required) => {
    const nodes = [...document.querySelectorAll('[data-longview-segment="true"]')];
    const states = nodes.reduce((counts, node) => {
      const state = node.dataset.longviewState || "unknown";
      counts[state] = (counts[state] || 0) + 1;
      return counts;
    }, {});
    if (nodes.length >= required && states.hot > 0 && states.cold > 0) {
      return { nodes: nodes.length, states };
    }
    return false;
  }, minimum, { timeout: 20_000, polling: 100 });
  return handle.jsonValue();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { server, port } = await serve(fixtureRoot);
  const extensionPath = path.join(repoRoot, "product/extension");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "longview-benchmark-"));
  const browserArgs = [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--enable-precise-memory-info",
    "--no-first-run",
    "--no-default-browser-check"
  ];
  if (args.longview) {
    browserArgs.push(
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    );
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: args.executable,
    // Extension benchmarks intentionally use a real headed browser. Use
    // xvfb-run on Linux CI or remote hosts without a display server.
    headless: Boolean(args.headless && !args.longview),
    args: browserArgs,
    viewport: { width: 1440, height: 900 }
  });

  const results = [];
  let browserVersion = null;
  try {
    browserVersion = context.browser()?.version() || null;
    for (let run = 0; run < args.runs; run += 1) {
      const page = await context.newPage();
      const query = new URLSearchParams({
        turns: String(args.turns),
        duration: String(args.duration),
        stream: args.stream ? "1" : "0",
        stress: args.stress ? "1" : "0",
        seed: String(42 + run)
      });
      await page.goto(`http://127.0.0.1:${port}/?${query}`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => Boolean(window.__LONGVIEW_BENCHMARK__));
      await page.evaluate(() => window.__LONGVIEW_BENCHMARK__.ready);

      const activation = args.longview ? await waitForLongView(page, args.turns) : null;
      const correctness = await page.evaluate(() => window.__LONGVIEW_BENCHMARK__.correctnessProbe());
      if (!correctness.ok || !correctness.geometryFinite || !correctness.focusWorks ||
          !correctness.selectionWorks || !correctness.anchorWorks) {
        throw new Error(`Correctness probe failed: ${JSON.stringify(correctness)}`);
      }

      const metrics = await page.evaluate(
        (durationMs) => window.__LONGVIEW_BENCHMARK__.runScroll({ durationMs, passes: 1 }),
        args.duration
      );
      if (args.longview && (!metrics.longView.hot || !metrics.longView.cold)) {
        throw new Error(`LongView state disappeared during run: ${JSON.stringify(metrics.longView)}`);
      }
      results.push({ ...metrics, run, correctness, activation });
      await page.close();
    }
  } finally {
    await context.close();
    await closeServer(server);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      executable: args.executable,
      browserVersion,
      longview: args.longview,
      turns: args.turns,
      stream: args.stream,
      stress: args.stress,
      duration: args.duration,
      platform: process.platform,
      arch: process.arch,
      node: process.version
    },
    summary: summarizeRuns(results),
    runs: results
  };
  const output = args.output
    ? path.resolve(args.output)
    : path.join(
      repoRoot,
      "benchmark-results",
      `${args.longview ? "longview" : "baseline"}-${args.turns}-${Date.now()}.json`
    );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, summary: report.summary }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
