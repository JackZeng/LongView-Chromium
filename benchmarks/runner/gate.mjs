#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { DEFAULT_THRESHOLDS, evaluateCampaign } from "./campaign-lib.mjs";

function parseArgs(argv) {
  const args = { enforce: false, thresholds: { ...DEFAULT_THRESHOLDS } };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--enforce") args.enforce = true;
    else if (item === "--max-p95-ratio") args.thresholds.maximumLargestScaleP95Ratio = Number(argv[++index]);
    else if (item === "--max-dropped-ratio") args.thresholds.maximumLargestScaleDroppedFrameRatio = Number(argv[++index]);
    else if (item === "--max-exponent-delta") args.thresholds.maximumP95ScalingExponentDelta = Number(argv[++index]);
    else if (!item.startsWith("--") && !args.campaign) args.campaign = item;
    else throw new Error(`Unknown argument: ${item}`);
  }
  if (!args.campaign) throw new Error("Usage: node gate.mjs campaign.json [--enforce]");
  return args;
}

const args = parseArgs(process.argv.slice(2));
const pathname = path.resolve(args.campaign);
const campaign = JSON.parse(fs.readFileSync(pathname, "utf8"));
const gate = evaluateCampaign(campaign, args.thresholds);
console.log(JSON.stringify(gate, null, 2));
if (args.enforce && !gate.passed) process.exitCode = 3;
