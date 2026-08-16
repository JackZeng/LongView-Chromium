export function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p / 100) - 1));
  return sorted[index];
}

function roundedMedian(values, digits = 2) {
  if (!values.length) return null;
  return Number(percentile(values, 50).toFixed(digits));
}

export function summarizeRuns(runs) {
  if (!Array.isArray(runs) || runs.length === 0) throw new Error("At least one run is required");
  const p50 = runs.map((run) => run.frameTime.p50);
  const p95 = runs.map((run) => run.frameTime.p95);
  const p99 = runs.map((run) => run.frameTime.p99);
  const dropped = runs.map((run) => run.droppedFrameRatio);
  const longTaskMs = runs.map((run) => run.longTasks.totalMs);
  const refreshHz = runs.map((run) => run.estimatedRefreshHz).filter(Number.isFinite);
  const usedHeap = runs
    .map((run) => run.memory?.usedJSHeapSize)
    .filter(Number.isFinite);
  const domNodes = runs
    .map((run) => run.cdp?.after?.domCounters?.nodes ?? run.domNodes)
    .filter(Number.isFinite);
  const layoutDuration = runs
    .map((run) => run.cdp?.delta?.LayoutDuration)
    .filter(Number.isFinite);
  const recalcStyleDuration = runs
    .map((run) => run.cdp?.delta?.RecalcStyleDuration)
    .filter(Number.isFinite);
  const scriptDuration = runs
    .map((run) => run.cdp?.delta?.ScriptDuration)
    .filter(Number.isFinite);
  const taskDuration = runs
    .map((run) => run.cdp?.delta?.TaskDuration)
    .filter(Number.isFinite);

  return {
    runCount: runs.length,
    medianP50FrameTime: roundedMedian(p50),
    medianP95FrameTime: roundedMedian(p95),
    medianP99FrameTime: roundedMedian(p99),
    p95OfP95FrameTime: Number(percentile(p95, 95).toFixed(2)),
    medianDroppedFrameRatio: roundedMedian(dropped, 4),
    medianLongTaskTime: roundedMedian(longTaskMs),
    medianEstimatedRefreshHz: roundedMedian(refreshHz, 0),
    medianUsedJSHeapSize: usedHeap.length ? roundedMedian(usedHeap, 0) : null,
    medianDOMNodes: domNodes.length ? roundedMedian(domNodes, 0) : null,
    medianLayoutDuration: layoutDuration.length ? roundedMedian(layoutDuration, 6) : null,
    medianRecalcStyleDuration: recalcStyleDuration.length ? roundedMedian(recalcStyleDuration, 6) : null,
    medianScriptDuration: scriptDuration.length ? roundedMedian(scriptDuration, 6) : null,
    medianTaskDuration: taskDuration.length ? roundedMedian(taskDuration, 6) : null
  };
}

export function compareSummaries(baseline, variant) {
  const ratio = (after, before) => {
    if (!Number.isFinite(after) || !Number.isFinite(before) || before === 0) return null;
    return Number((after / before).toFixed(4));
  };
  return {
    p50FrameTimeRatio: ratio(variant.medianP50FrameTime, baseline.medianP50FrameTime),
    p95FrameTimeRatio: ratio(variant.medianP95FrameTime, baseline.medianP95FrameTime),
    p99FrameTimeRatio: ratio(variant.medianP99FrameTime, baseline.medianP99FrameTime),
    droppedFrameRatio: ratio(variant.medianDroppedFrameRatio, baseline.medianDroppedFrameRatio),
    longTaskTimeRatio: ratio(variant.medianLongTaskTime, baseline.medianLongTaskTime),
    usedHeapRatio: ratio(variant.medianUsedJSHeapSize, baseline.medianUsedJSHeapSize),
    domNodesRatio: ratio(variant.medianDOMNodes, baseline.medianDOMNodes),
    layoutDurationRatio: ratio(variant.medianLayoutDuration, baseline.medianLayoutDuration),
    recalcStyleDurationRatio: ratio(
      variant.medianRecalcStyleDuration,
      baseline.medianRecalcStyleDuration
    ),
    scriptDurationRatio: ratio(variant.medianScriptDuration, baseline.medianScriptDuration),
    taskDurationRatio: ratio(variant.medianTaskDuration, baseline.medianTaskDuration)
  };
}

export function fitScalingExponent(points) {
  const usable = points
    .map((point) => ({ x: Number(point.turns), y: Number(point.value) }))
    .filter((point) => point.x > 0 && point.y > 0 && Number.isFinite(point.x) && Number.isFinite(point.y));
  if (usable.length < 2) return { exponent: null, rSquared: null, samples: usable.length };

  const logs = usable.map((point) => ({ x: Math.log(point.x), y: Math.log(point.y) }));
  const meanX = logs.reduce((sum, point) => sum + point.x, 0) / logs.length;
  const meanY = logs.reduce((sum, point) => sum + point.y, 0) / logs.length;
  let numerator = 0;
  let denominator = 0;
  for (const point of logs) {
    numerator += (point.x - meanX) * (point.y - meanY);
    denominator += (point.x - meanX) ** 2;
  }
  if (denominator === 0) return { exponent: null, rSquared: null, samples: usable.length };

  const exponent = numerator / denominator;
  const intercept = meanY - exponent * meanX;
  let residual = 0;
  let total = 0;
  for (const point of logs) {
    const predicted = intercept + exponent * point.x;
    residual += (point.y - predicted) ** 2;
    total += (point.y - meanY) ** 2;
  }
  const rSquared = total === 0 ? 1 : 1 - residual / total;
  return {
    exponent: Number(exponent.toFixed(4)),
    rSquared: Number(rSquared.toFixed(4)),
    samples: usable.length
  };
}

export function summarizeScaling(entries, metricName) {
  const baseline = fitScalingExponent(entries.map((entry) => ({
    turns: entry.turns,
    value: entry.baseline.summary[metricName]
  })));
  const longview = fitScalingExponent(entries.map((entry) => ({
    turns: entry.turns,
    value: entry.longview.summary[metricName]
  })));
  return {
    metric: metricName,
    baseline,
    longview,
    exponentDelta: Number.isFinite(baseline.exponent) && Number.isFinite(longview.exponent)
      ? Number((longview.exponent - baseline.exponent).toFixed(4))
      : null
  };
}
