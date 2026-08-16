#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launchChromium } from "./browser.mjs";
import {
  DEFAULT_TRACE_CATEGORIES,
  collectCdpSnapshot,
  diffMetrics,
  startTrace,
  stopTrace
} from "./cdp.mjs";
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
    headless: false,
    trace: false,
    inlineFixture: false,
    traceCategories: DEFAULT_TRACE_CATEGORIES
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--stream") output.stream = true;
    else if (arg === "--stress") output.stress = true;
    else if (arg === "--longview") output.longview = true;
    else if (arg === "--headless") output.headless = true;
    else if (arg === "--trace") output.trace = true;
    else if (arg === "--inline-fixture") output.inlineFixture = true;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (index + 1 >= argv.length) throw new Error(`${arg} requires a value`);
      output[key] = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
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
  if (output.longview && output.headless && !output.inlineFixture) {
    throw new Error(
      "Real-extension LongView runs must be headed; use xvfb-run on headless Linux hosts"
    );
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

export function resolveServedFile(root, relative) {
  const base = path.resolve(root);
  const file = path.resolve(base, relative);
  const relation = path.relative(base, file);
  if (relation.startsWith("..") || path.isAbsolute(relation)) return null;
  return file;
}

export function hasLiveLongViewStates(states) {
  const active = Number(states?.hot ?? states?.active ?? 0);
  const cold = Number(states?.cold ?? 0);
  return Number.isFinite(active) && Number.isFinite(cold) && active > 0 && cold > 0;
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
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { server, port: server.address().port };
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function waitForLongView(client, turns) {
  const minimum = Math.min(turns, 12);
  const expression = `(() => {
    const nodes = [...document.querySelectorAll('[data-longview-segment="true"]')];
    const states = nodes.reduce((counts, node) => {
      const state = node.dataset.longviewState || "unknown";
      counts[state] = (counts[state] || 0) + 1;
      return counts;
    }, {});
    return nodes.length >= ${minimum} && states.hot > 0 && states.cold > 0
      ? { nodes: nodes.length, states }
      : false;
  })()`;
  return client.waitForExpression(expression, { timeout: 20_000, polling: 100 });
}

function escapeInlineScript(source) {
  return source.replace(/<\/script/gi, "<\\/script");
}

function buildInlineFixture(query) {
  const index = fs.readFileSync(path.join(fixtureRoot, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(fixtureRoot, "styles.css"), "utf8");
  const app = fs.readFileSync(path.join(fixtureRoot, "app.js"), "utf8")
    .replace(
      "new URLSearchParams(location.search)",
      `new URLSearchParams(${JSON.stringify(`?${query.toString()}`)})`
    );
  return index
    .replace('<link rel="stylesheet" href="styles.css">', `<style>${css}</style>`)
    .replace('<script src="app.js"></script>', `<script>${escapeInlineScript(app)}</script>`);
}

async function injectLongViewRuntime(client) {
  await client.evaluate(`(() => {
    const listeners = [];
    globalThis.chrome = {
      runtime: {
        sendMessage: async (message) => {
          if (message?.type === "longview:get-settings") {
            return { settings: { showDiagnostics: false } };
          }
          return { ok: true };
        },
        onMessage: { addListener: (listener) => listeners.push(listener) }
      }
    };
    globalThis.__LONGVIEW_INLINE_LISTENERS__ = listeners;
    return true;
  })()`);
  const scripts = [
    "shared/core.js",
    "content/00-namespace.js",
    "content/10-config.js",
    "content/20-adapters.js",
    "content/30-segment-controller.js",
    "content/40-diagnostics.js",
    "content/50-bootstrap.js"
  ];
  for (const relative of scripts) {
    const source = fs.readFileSync(path.join(repoRoot, "product/extension", relative), "utf8");
    await client.evaluate(`${source}\n//# sourceURL=longview-inline://${relative}`);
  }
}

function hostMetadata() {
  const cpus = os.cpus();
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model || null,
    logicalCpus: cpus.length,
    totalMemoryBytes: os.totalmem(),
    node: process.version
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const output = args.output
    ? path.resolve(args.output)
    : path.join(
      repoRoot,
      "benchmark-results",
      `${args.longview ? "longview" : "baseline"}-${args.turns}-${Date.now()}.json`
    );
  const traceDirectory = args.traceDir
    ? path.resolve(args.traceDir)
    : path.join(path.dirname(output), "traces", path.basename(output, path.extname(output)));

  const { server, port } = await serve(fixtureRoot);
  const extensionPath = path.join(repoRoot, "product/extension");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "longview-benchmark-"));
  let browser = null;
  const results = [];
  let browserVersion = null;

  try {
    browser = await launchChromium({
      executable: args.executable,
      userDataDir,
      extensionPath: args.longview && !args.inlineFixture ? extensionPath : null,
      headless: Boolean(args.headless && (!args.longview || args.inlineFixture)),
      browserArgs: [
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows",
        "--enable-precise-memory-info"
      ]
    });
    browserVersion = browser.version?.Browser || browser.version?.product || null;

    for (let run = 0; run < args.runs; run += 1) {
      const query = new URLSearchParams({
        turns: String(args.turns),
        duration: String(args.duration),
        stream: args.stream ? "1" : "0",
        stress: args.stress ? "1" : "0",
        seed: String(42 + run)
      });
      if (args.inlineFixture) {
        await browser.setDocumentContent(buildInlineFixture(query));
      } else {
        await browser.navigate(`http://127.0.0.1:${port}/?${query}`);
      }
      await browser.client.waitForExpression("Boolean(window.__LONGVIEW_BENCHMARK__)", { timeout: 30_000 });
      await browser.client.evaluate("window.__LONGVIEW_BENCHMARK__.ready.then(() => true)");
      if (args.longview && args.inlineFixture) await injectLongViewRuntime(browser.client);

      const activation = args.longview ? await waitForLongView(browser.client, args.turns) : null;
      const correctness = await browser.client.evaluate("window.__LONGVIEW_BENCHMARK__.correctnessProbe()");
      if (!correctness?.ok || !correctness.geometryFinite || !correctness.focusWorks ||
          !correctness.selectionWorks || !correctness.anchorWorks) {
        throw new Error(`Correctness probe failed: ${JSON.stringify(correctness)}`);
      }

      const before = await collectCdpSnapshot(browser.client);
      let trace = null;
      if (args.trace) await startTrace(browser.browserClient, args.traceCategories);
      const metrics = await browser.client.evaluate(
        `window.__LONGVIEW_BENCHMARK__.runScroll({ durationMs: ${args.duration}, passes: 1 })`
      );
      if (args.trace) {
        const tracePath = path.join(traceDirectory, `run-${String(run + 1).padStart(2, "0")}.json`);
        trace = await stopTrace(browser.browserClient, tracePath);
      }
      const after = await collectCdpSnapshot(browser.client);
      if (args.longview && !hasLiveLongViewStates(metrics?.longView)) {
        throw new Error(`LongView state disappeared during run: ${JSON.stringify(metrics?.longView)}`);
      }
      results.push({
        ...metrics,
        run,
        correctness,
        activation,
        trace,
        cdp: {
          before,
          after,
          delta: diffMetrics(before.performance, after.performance)
        }
      });
    }
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  const report = {
    schemaVersion: 2,
    metadata: {
      generatedAt: new Date().toISOString(),
      executable: args.executable,
      browserVersion,
      longview: args.longview,
      turns: args.turns,
      stream: args.stream,
      stress: args.stress,
      duration: args.duration,
      tracing: args.trace,
      headless: Boolean(args.headless && (!args.longview || args.inlineFixture)),
      fixtureTransport: args.inlineFixture ? "inline-smoke" : "http",
      publishableEvidence: !args.inlineFixture,
      host: hostMetadata()
    },
    summary: summarizeRuns(results),
    runs: results
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, summary: report.summary }, null, 2));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
