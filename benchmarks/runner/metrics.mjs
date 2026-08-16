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

  return {
    runCount: runs.length,
    medianP50FrameTime: roundedMedian(p50),
    medianP95FrameTime: roundedMedian(p95),
    medianP99FrameTime: roundedMedian(p99),
    p95OfP95FrameTime: Number(percentile(p95, 95).toFixed(2)),
    medianDroppedFrameRatio: roundedMedian(dropped, 4),
    medianLongTaskTime: roundedMedian(longTaskMs),
    medianEstimatedRefreshHz: roundedMedian(refreshHz, 0),
    medianUsedJSHeapSize: usedHeap.length ? roundedMedian(usedHeap, 0) : null
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
    usedHeapRatio: ratio(variant.medianUsedJSHeapSize, baseline.medianUsedJSHeapSize)
  };
}
