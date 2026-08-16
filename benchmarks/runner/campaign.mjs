#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_THRESHOLDS,
  buildCampaignSummary,
  evaluateCampaign,
  parseTurns,
  browserVersionMatchesPin,
  renderCampaignCsv,
  renderCampaignMarkdown
} from "./campaign-lib.mjs";
import { compareSummaries } from "./metrics.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

function parseArgs(argv) {
  const args = {
    turns: "100,500,1000,2000",
    runs: 3,
    duration: 9000,
    stream: false,
    stress: false,
    trace: false,
    traceAll: false,
    enforce: false,
    label: null,
    displayHz: null,
    powerMode: null,
    gpu: null,
    notes: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (["--stream", "--stress", "--trace", "--enforce"].includes(item)) {
      args[item.slice(2)] = true;
    } else if (item === "--trace-all") {
      args.trace = true;
      args.traceAll = true;
    } else if (item.startsWith("--")) {
      if (index + 1 >= argv.length) throw new Error(`${item} requires a value`);
      const key = item.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      args[key] = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${item}`);
    }
  }
  if (!args.executable) throw new Error("Pass --executable /path/to/chrome or chrome.exe");
  args.executable = path.resolve(args.executable);
  if (!fs.existsSync(args.executable)) throw new Error(`Browser executable does not exist: ${args.executable}`);
  args.turns = parseTurns(args.turns);
  args.runs = Number(args.runs);
  args.duration = Number(args.duration);
  if (args.displayHz !== null) args.displayHz = Number(args.displayHz);
  if (!Number.isInteger(args.runs) || args.runs < 1 || args.runs > 20) throw new Error("--runs must be 1..20");
  if (!Number.isInteger(args.duration) || args.duration < 1000 || args.duration > 300000) throw new Error("--duration must be 1000..300000");
  if (args.displayHz !== null && (!Number.isFinite(args.displayHz) || args.displayHz <= 0)) {
    throw new Error("--displayHz must be a positive number");
  }
  args.outputDir = path.resolve(args.outputDir || path.join(repoRoot, "benchmark-results", `campaign-${Date.now()}`));
  return args;
}

function runRunner(args, turns, longview, outputPath, traceDir, captureTrace) {
  const command = [
    path.join(here, "runner.mjs"),
    "--executable", args.executable,
    "--turns", String(turns),
    "--runs", String(args.runs),
    "--duration", String(args.duration),
    "--output", outputPath
  ];
  if (longview) command.push("--longview");
  if (args.stream) command.push("--stream");
  if (args.stress) command.push("--stress");
  if (captureTrace) command.push("--trace", "--traceDir", traceDir);

  const result = spawnSync(process.execPath, command, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.status !== 0) {
    throw new Error(`Benchmark runner failed for ${turns} turns (${longview ? "LongView" : "baseline"})`);
  }
}

function hostMetadata() {
  const cpus = os.cpus();
  return {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model || null,
    logicalCpus: cpus.length,
    totalMemoryBytes: os.totalmem(),
    node: process.version
  };
}

function repositoryMetadata() {
  const pin = JSON.parse(fs.readFileSync(path.join(repoRoot, "chromium.version"), "utf8"));
  const version = fs.readFileSync(path.join(repoRoot, "VERSION"), "utf8").trim();
  const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8" });
  return {
    longviewVersion: version,
    longviewCommit: commit.status === 0 ? commit.stdout.trim() : null,
    dirty: status.status === 0 ? Boolean(status.stdout.trim()) : null,
    chromiumVersion: pin.version,
    chromiumCommit: pin.commit
  };
}

function validatePair(turns, baseline, longview, pinnedVersion) {
  if (baseline.metadata.longview !== false || longview.metadata.longview !== true) {
    throw new Error(`Variant labels are invalid for ${turns} turns`);
  }
  if (baseline.metadata.turns !== turns || longview.metadata.turns !== turns) {
    throw new Error(`Scale metadata mismatch for ${turns} turns`);
  }
  if (baseline.metadata.browserVersion !== longview.metadata.browserVersion) {
    throw new Error(`Baseline and LongView used different browser versions at ${turns} turns`);
  }
  if (baseline.metadata.executable !== longview.metadata.executable) {
    throw new Error(`Baseline and LongView used different executables at ${turns} turns`);
  }
  for (const [name, report] of [["baseline", baseline], ["LongView", longview]]) {
    if (report.metadata.fixtureTransport !== "http" ||
        report.metadata.publishableEvidence !== true) {
      throw new Error(`${name} ${turns}-turn report is not publishable HTTP evidence`);
    }
    if (!browserVersionMatchesPin(report.metadata.browserVersion, pinnedVersion)) {
      throw new Error(
        `${name} ${turns}-turn browser ${report.metadata.browserVersion} does not match pinned ${pinnedVersion}`
      );
    }
  }
}

function load(pathname) {
  return JSON.parse(fs.readFileSync(pathname, "utf8"));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.outputDir, { recursive: true });
  const entries = [];
  const repository = repositoryMetadata();
  const largestTurns = args.turns.at(-1);

  for (const turns of args.turns) {
    const scaleDir = path.join(args.outputDir, String(turns));
    fs.mkdirSync(scaleDir, { recursive: true });
    const baselinePath = path.join(scaleDir, "baseline.json");
    const longviewPath = path.join(scaleDir, "longview.json");
    const captureTrace = args.trace && (args.traceAll || turns === largestTurns);
    runRunner(
      args, turns, false, baselinePath,
      path.join(scaleDir, "traces-baseline"), captureTrace
    );
    runRunner(
      args, turns, true, longviewPath,
      path.join(scaleDir, "traces-longview"), captureTrace
    );
    const baseline = load(baselinePath);
    const longview = load(longviewPath);
    validatePair(turns, baseline, longview, repository.chromiumVersion);
    entries.push({
      turns,
      baseline: { path: path.relative(args.outputDir, baselinePath), ...baseline },
      longview: { path: path.relative(args.outputDir, longviewPath), ...longview },
      ratios: compareSummaries(baseline.summary, longview.summary)
    });
  }

  const summary = buildCampaignSummary(entries);
  const campaign = {
    schemaVersion: 1,
    metadata: {
      generatedAt: new Date().toISOString(),
      executable: args.executable,
      turns: args.turns,
      runsPerVariant: args.runs,
      durationMs: args.duration,
      stream: args.stream,
      stress: args.stress,
      trace: args.trace,
      tracePolicy: args.trace ? (args.traceAll ? "all-scales" : "largest-scale") : "none",
      host: hostMetadata(),
      environment: {
        label: args.label,
        displayHz: args.displayHz,
        powerMode: args.powerMode,
        gpu: args.gpu,
        notes: args.notes
      },
      repository,
      browserVersion: entries[0]?.baseline.metadata.browserVersion || null
    },
    ...summary
  };
  campaign.gate = evaluateCampaign(campaign, DEFAULT_THRESHOLDS);

  fs.writeFileSync(path.join(args.outputDir, "campaign.json"), JSON.stringify(campaign, null, 2));
  fs.writeFileSync(path.join(args.outputDir, "REPORT.md"), renderCampaignMarkdown(campaign));
  fs.writeFileSync(path.join(args.outputDir, "campaign.csv"), renderCampaignCsv(campaign));
  console.log(JSON.stringify({ outputDir: args.outputDir, gate: campaign.gate }, null, 2));
  if (args.enforce && !campaign.gate.passed) process.exitCode = 3;
}

try {
  main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
