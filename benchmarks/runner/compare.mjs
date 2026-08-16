#!/usr/bin/env node
import fs from "node:fs";
import { compareSummaries } from "./metrics.mjs";
const [baselinePath, variantPath] = process.argv.slice(2);
if (!baselinePath || !variantPath) throw new Error("Usage: node compare.mjs baseline.json longview.json");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const variant = JSON.parse(fs.readFileSync(variantPath, "utf8"));
console.log(JSON.stringify({ baseline: baseline.summary, variant: variant.summary, ratios: compareSummaries(baseline.summary, variant.summary) }, null, 2));
