'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow } = require('electron');

function parseCliArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) continue;
    const [rawKey, inlineValue] = argument.slice(2).split('=', 2);
    const next = argv[index + 1];
    if (inlineValue !== undefined) result[rawKey] = inlineValue;
    else if (next && !next.startsWith('--')) {
      result[rawKey] = next;
      index += 1;
    } else result[rawKey] = true;
  }
  return result;
}

async function waitForBenchmarkReady(webContents, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const ready = await webContents.executeJavaScript('Boolean(window.__LONGVIEW_BENCHMARK_READY__)');
      if (ready) return;
    } catch {
      // Renderer may still be navigating.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Benchmark page did not become ready in time');
}

async function runSingle({ appRoot, browserApp, turns, longviewMode, runIndex, durationMs }) {
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(appRoot, 'src', 'preload', 'page-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      backgroundThrottling: false,
      partition: 'persist:longview-benchmark'
    }
  });

  const enabled = longviewMode !== 'off';
  browserApp.setConfigOverride(window.webContents.id, {
    ...browserApp.getSettings(),
    longviewEnabled: enabled,
    longviewMode: enabled ? longviewMode : 'compatibility',
    hotScreens: 2,
    warmScreens: 8,
    predictionMs: 240,
    genericSegmentation: true
  });

  const url = `longview://benchmark/?turns=${turns}&seed=42&run=${runIndex}`;
  await window.loadURL(url);
  await waitForBenchmarkReady(window.webContents);
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const result = await window.webContents.executeJavaScript(`
    window.__LONGVIEW_BENCHMARK__.run({
      durationMs: ${JSON.stringify(durationMs)},
      scrollStep: 760,
      pauseMs: 16,
      streaming: true
    })
  `);
  const longviewMetrics = browserApp.latestMetrics.get(window.webContents.id) || null;
  browserApp.clearConfigOverride(window.webContents.id);
  window.destroy();
  return { ...result, longviewMetrics };
}

function summarizeRuns(runs) {
  const numericKeys = [
    'frameP50Ms',
    'frameP95Ms',
    'frameP99Ms',
    'longFrameRatio',
    'averageFps',
    'scrollDurationMs',
    'domNodes',
    'documentHeight',
    'jsHeapUsed'
  ];
  const summary = {};
  for (const key of numericKeys) {
    const values = runs.map((run) => Number(run[key])).filter(Number.isFinite);
    if (!values.length) continue;
    summary[key] = Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
  }
  return summary;
}

async function runBenchmarkCli({ appRoot, browserApp, argv = process.argv.slice(2) }) {
  const args = parseCliArgs(argv);
  const turns = Math.max(10, Math.min(5000, Number(args.turns) || 1000));
  const runsCount = Math.max(1, Math.min(10, Number(args.runs) || 3));
  const durationMs = Math.max(3000, Math.min(60000, Number(args.duration) || 12000));
  const longviewMode = ['off', 'compatibility', 'balanced', 'aggressive'].includes(args.longview)
    ? args.longview
    : 'balanced';
  const output = path.resolve(args.output || `artifacts/${longviewMode}-${turns}.json`);

  const runs = [];
  for (let index = 0; index < runsCount; index += 1) {
    runs.push(await runSingle({ appRoot, browserApp, turns, longviewMode, runIndex: index, durationMs }));
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    configuration: { turns, runs: runsCount, durationMs, longviewMode },
    runtime: {
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      v8: process.versions.v8
    },
    summary: summarizeRuns(runs),
    runs
  };

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Benchmark report written to ${output}`);
  return report;
}

module.exports = {
  parseCliArgs,
  runBenchmarkCli,
  summarizeRuns,
  waitForBenchmarkReady
};
