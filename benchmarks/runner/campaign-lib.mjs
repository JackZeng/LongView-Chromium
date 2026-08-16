import { compareSummaries, summarizeScaling } from "./metrics.mjs";

export const DEFAULT_THRESHOLDS = Object.freeze({
  maximumLargestScaleP95Ratio: 1.05,
  maximumLargestScaleDroppedFrameRatio: 1.1,
  maximumLargestScaleHeapRatio: 1.25,
  maximumP95ScalingExponentDelta: 0.05
});

export function parseTurns(value) {
  const turns = [...new Set(String(value)
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item >= 10 && item <= 5000))]
    .sort((a, b) => a - b);
  if (turns.length < 2) throw new Error("Evidence campaigns require at least two turn scales");
  return turns;
}

export function browserVersionMatchesPin(browserVersion, pinnedVersion) {
  if (!browserVersion || !pinnedVersion) return false;
  return String(browserVersion).split("/").pop() === String(pinnedVersion);
}

function correctnessOk(report) {
  return (report?.runs || []).every((run) => run.correctness?.ok &&
    run.correctness.geometryFinite && run.correctness.focusWorks &&
    run.correctness.selectionWorks && run.correctness.anchorWorks);
}

export function buildCampaignSummary(entries) {
  const metrics = [
    "medianP95FrameTime",
    "medianP99FrameTime",
    "medianDroppedFrameRatio",
    "medianLongTaskTime",
    "medianUsedJSHeapSize",
    "medianDOMNodes",
    "medianLayoutDuration",
    "medianRecalcStyleDuration",
    "medianScriptDuration",
    "medianTaskDuration"
  ];
  const scaling = Object.fromEntries(metrics.map((metric) => [metric, summarizeScaling(entries, metric)]));
  return {
    entries,
    scaling,
    correctness: {
      baseline: entries.every((entry) => correctnessOk(entry.baseline)),
      longview: entries.every((entry) => correctnessOk(entry.longview))
    }
  };
}

export function evaluateCampaign(campaign, thresholds = DEFAULT_THRESHOLDS) {
  const largest = campaign.entries.at(-1);
  if (!largest) throw new Error("Campaign has no benchmark entries");
  const ratios = largest.ratios || compareSummaries(largest.baseline.summary, largest.longview.summary);
  const p95Delta = campaign.scaling.medianP95FrameTime.exponentDelta;
  const checks = [
    {
      name: "baseline-correctness",
      passed: campaign.correctness?.baseline === true,
      actual: campaign.correctness?.baseline
    },
    {
      name: "longview-correctness",
      passed: campaign.correctness?.longview === true,
      actual: campaign.correctness?.longview
    },
    {
      name: "largest-scale-p95",
      passed: ratios.p95FrameTimeRatio === null || ratios.p95FrameTimeRatio <= thresholds.maximumLargestScaleP95Ratio,
      actual: ratios.p95FrameTimeRatio,
      expectedMaximum: thresholds.maximumLargestScaleP95Ratio
    },
    {
      name: "largest-scale-dropped-frame-ratio",
      passed: ratios.droppedFrameRatio === null || ratios.droppedFrameRatio <= thresholds.maximumLargestScaleDroppedFrameRatio,
      actual: ratios.droppedFrameRatio,
      expectedMaximum: thresholds.maximumLargestScaleDroppedFrameRatio
    },
    {
      name: "largest-scale-heap",
      passed: ratios.usedHeapRatio === null || ratios.usedHeapRatio <= thresholds.maximumLargestScaleHeapRatio,
      actual: ratios.usedHeapRatio,
      expectedMaximum: thresholds.maximumLargestScaleHeapRatio
    },
    {
      name: "p95-scaling-exponent",
      passed: p95Delta === null || p95Delta <= thresholds.maximumP95ScalingExponentDelta,
      actual: p95Delta,
      expectedMaximum: thresholds.maximumP95ScalingExponentDelta
    }
  ];
  return {
    passed: checks.every((check) => check.passed),
    thresholds,
    checks
  };
}

function value(value, digits = 3) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : "n/a";
}

export function renderCampaignMarkdown(campaign) {
  const lines = [
    "# LongView evidence campaign",
    "",
    `Generated: ${campaign.metadata.generatedAt}`,
    `Executable: \`${campaign.metadata.executable}\``,
    `Browser: ${campaign.metadata.browserVersion || "unknown"}`,
    `LongView commit: ${campaign.metadata.repository?.longviewCommit || "unknown"}`,
    `Trace policy: ${campaign.metadata.tracePolicy}`,
    "",
    "| Turns | Baseline p95 | LongView p95 | Ratio | Baseline dropped | LongView dropped | Baseline layout s | LongView layout s |",
    "|---:|---:|---:|---:|---:|---:|---:|---:|"
  ];
  for (const entry of campaign.entries) {
    lines.push(`| ${entry.turns} | ${value(entry.baseline.summary.medianP95FrameTime)} | ${value(entry.longview.summary.medianP95FrameTime)} | ${value(entry.ratios.p95FrameTimeRatio)} | ${value(entry.baseline.summary.medianDroppedFrameRatio, 4)} | ${value(entry.longview.summary.medianDroppedFrameRatio, 4)} | ${value(entry.baseline.summary.medianLayoutDuration, 6)} | ${value(entry.longview.summary.medianLayoutDuration, 6)} |`);
  }
  lines.push(
    "",
    "## Scaling exponents",
    "",
    "Lower exponents mean the metric grows more slowly with total document scale.",
    "",
    "| Metric | Baseline | LongView | Delta |",
    "|---|---:|---:|---:|"
  );
  for (const item of Object.values(campaign.scaling)) {
    lines.push(`| ${item.metric} | ${value(item.baseline.exponent)} | ${value(item.longview.exponent)} | ${value(item.exponentDelta)} |`);
  }
  lines.push("", `## Gate: ${campaign.gate.passed ? "PASS" : "FAIL"}`, "");
  for (const check of campaign.gate.checks) {
    lines.push(`- ${check.passed ? "PASS" : "FAIL"}: ${check.name} (${value(check.actual)})`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderCampaignCsv(campaign) {
  const header = [
    "turns",
    "baseline_p95_ms",
    "longview_p95_ms",
    "p95_ratio",
    "baseline_dropped_ratio",
    "longview_dropped_ratio",
    "baseline_heap_bytes",
    "longview_heap_bytes",
    "baseline_dom_nodes",
    "longview_dom_nodes",
    "baseline_layout_seconds",
    "longview_layout_seconds"
  ];
  const rows = campaign.entries.map((entry) => [
    entry.turns,
    entry.baseline.summary.medianP95FrameTime,
    entry.longview.summary.medianP95FrameTime,
    entry.ratios.p95FrameTimeRatio,
    entry.baseline.summary.medianDroppedFrameRatio,
    entry.longview.summary.medianDroppedFrameRatio,
    entry.baseline.summary.medianUsedJSHeapSize,
    entry.longview.summary.medianUsedJSHeapSize,
    entry.baseline.summary.medianDOMNodes,
    entry.longview.summary.medianDOMNodes,
    entry.baseline.summary.medianLayoutDuration,
    entry.longview.summary.medianLayoutDuration
  ].map((item) => item ?? "").join(","));
  return `${[header.join(","), ...rows].join("\n")}\n`;
}
