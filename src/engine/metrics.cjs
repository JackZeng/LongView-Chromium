'use strict';

class LongViewMetrics {
  constructor(onSnapshot = () => {}) {
    this.onSnapshot = onSnapshot;
    this.longTasks = [];
    this.frameIntervals = [];
    this.lastFrameAt = 0;
    this.frameHandle = null;
    this.timer = null;
    this.observers = [];
    this.context = {};
  }

  start() {
    this.lastFrameAt = performance.now();
    const frame = (now) => {
      const interval = now - this.lastFrameAt;
      this.lastFrameAt = now;
      if (interval > 0 && interval < 1000) {
        this.frameIntervals.push(interval);
        if (this.frameIntervals.length > 600) this.frameIntervals.shift();
      }
      this.frameHandle = requestAnimationFrame(frame);
    };
    this.frameHandle = requestAnimationFrame(frame);

    if ('PerformanceObserver' in globalThis) {
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          const now = performance.now();
          for (const entry of list.getEntries()) {
            this.longTasks.push({ at: now, duration: entry.duration });
          }
          this.longTasks = this.longTasks.filter((item) => now - item.at < 10000);
        });
        longTaskObserver.observe({ type: 'longtask', buffered: true });
        this.observers.push(longTaskObserver);
      } catch {
        // Long Task API is not available on every page/origin.
      }
    }

    this.timer = setInterval(() => this.emit(), 1000);
  }

  setContext(context) {
    this.context = { ...context };
  }

  percentile(values, p) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[index];
  }

  emit() {
    const intervals = this.frameIntervals.slice(-300);
    const average = intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : 0;
    const estimatedFps = average > 0 ? Math.min(240, 1000 / average) : 0;
    const memory = performance.memory
      ? {
          jsHeapUsed: performance.memory.usedJSHeapSize,
          jsHeapTotal: performance.memory.totalJSHeapSize,
          jsHeapLimit: performance.memory.jsHeapSizeLimit
        }
      : null;

    this.onSnapshot({
      ...this.context,
      timestamp: Date.now(),
      estimatedFps: Number(estimatedFps.toFixed(1)),
      frameP95Ms: Number(this.percentile(intervals, 95).toFixed(2)),
      frameP99Ms: Number(this.percentile(intervals, 99).toFixed(2)),
      longTasks10s: this.longTasks.length,
      longTaskTime10s: Number(this.longTasks.reduce((sum, item) => sum + item.duration, 0).toFixed(1)),
      memory
    });
  }

  stop() {
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    if (this.timer) clearInterval(this.timer);
    for (const observer of this.observers) observer.disconnect();
    this.observers = [];
  }
}

module.exports = { LongViewMetrics };
