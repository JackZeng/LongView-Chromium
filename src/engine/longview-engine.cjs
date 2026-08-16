'use strict';

const { chooseAdapter, findScrollRoot } = require('./adapters.cjs');
const { LongViewMetrics } = require('./metrics.cjs');
const { SegmentState, classifySegment, computePolicyRanges, normalizePolicyConfig } = require('./policy.cjs');

const STYLE_ID = 'longview-runtime-style';
const SEGMENT_CLASS = 'lv-segment';

function lowerBoundByBottom(segments, value) {
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    const segment = segments[middle];
    if (segment.top + segment.height < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBoundByTop(segments, value) {
  let low = 0;
  let high = segments.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (segments[middle].top <= value) low = middle + 1;
    else high = middle;
  }
  return low;
}

class LongViewEngine {
  constructor(options = {}) {
    this.document = options.document || document;
    this.window = this.document.defaultView || window;
    this.config = this.normalizeConfig(options.config || {});
    this.onMetrics = options.onMetrics || (() => {});
    this.scrollRoot = null;
    this.adapterName = 'none';
    this.segments = [];
    this.segmentByElement = new WeakMap();
    this.activeSegments = new Set();
    this.enabled = this.config.longviewEnabled !== false;
    this.started = false;
    this.lastScrollTop = 0;
    this.lastScrollAt = performance.now();
    this.velocity = 0;
    this.updateScheduled = false;
    this.scanTimer = null;
    this.scanDueAt = 0;
    this.pendingScanReason = null;
    this.materializeTimer = null;
    this.materializedReason = null;
    this.mutationObserver = null;
    this.resizeObserver = null;
    this.metrics = new LongViewMetrics((snapshot) => this.onMetrics(snapshot));
    this.boundOnScroll = () => this.scheduleUpdate();
    this.boundOnResize = () => this.scheduleScan('viewport-resize', 80);
    this.boundOnFocusChange = () => this.scheduleUpdate();
    this.boundOnSelectionChange = () => this.scheduleUpdate();
    this.boundOnBeforeMatch = () => this.materializeAll('beforematch', 2500);
    this.boundOnBeforePrint = () => this.materializeAll('print', 0);
    this.boundOnAfterPrint = () => this.releaseMaterialization('print');
    this.boundOnCopy = () => this.materializeAll('copy', 1000);
  }

  normalizeConfig(input) {
    const policy = normalizePolicyConfig(input);
    const mode = ['compatibility', 'balanced', 'aggressive'].includes(input.longviewMode)
      ? input.longviewMode
      : 'balanced';
    return {
      ...input,
      ...policy,
      longviewEnabled: input.longviewEnabled !== false,
      longviewMode: mode,
      genericSegmentation: input.genericSegmentation !== false
    };
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.installStyle();
    this.document.documentElement.dataset.longviewMode = this.config.longviewMode;
    this.scrollRoot = findScrollRoot(this.document);
    this.lastScrollTop = this.getScrollTop();
    this.scrollRoot.addEventListener('scroll', this.boundOnScroll, { passive: true });
    this.window.addEventListener('resize', this.boundOnResize, { passive: true });
    this.document.addEventListener('focusin', this.boundOnFocusChange, true);
    this.document.addEventListener('focusout', this.boundOnFocusChange, true);
    this.document.addEventListener('selectionchange', this.boundOnSelectionChange, { passive: true });
    this.document.addEventListener('beforematch', this.boundOnBeforeMatch, true);
    this.document.addEventListener('copy', this.boundOnCopy, true);
    this.window.addEventListener('beforeprint', this.boundOnBeforePrint);
    this.window.addEventListener('afterprint', this.boundOnAfterPrint);

    this.mutationObserver = new MutationObserver((records) => {
      const structuralChange = records.some((record) => record.addedNodes.length || record.removedNodes.length);
      if (structuralChange) this.scheduleScan('mutation', 350);
    });
    this.mutationObserver.observe(this.document.documentElement, { childList: true, subtree: true });

    this.resizeObserver = new ResizeObserver(() => this.scheduleScan('segment-resize', 180));
    this.metrics.start();
    this.scan('start');
  }

  installStyle() {
    if (this.document.getElementById(STYLE_ID)) return;
    const style = this.document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${SEGMENT_CLASS}.lv-cold,
      html[data-longview-mode="balanced"] .${SEGMENT_CLASS}.lv-warm,
      html[data-longview-mode="aggressive"] .${SEGMENT_CLASS}.lv-warm {
        content-visibility: auto !important;
        contain-intrinsic-size: auto var(--lv-intrinsic-block-size, 480px) !important;
      }
      html[data-longview-mode="aggressive"] .${SEGMENT_CLASS}.lv-cold {
        content-visibility: hidden !important;
        contain: layout style paint !important;
      }
      html[data-longview-mode="aggressive"] .${SEGMENT_CLASS}.lv-cold *,
      html[data-longview-mode="aggressive"] .${SEGMENT_CLASS}.lv-warm * {
        animation-play-state: paused !important;
      }
    `;
    (this.document.head || this.document.documentElement).appendChild(style);
  }

  setConfig(nextConfig) {
    const previousEnabled = this.enabled;
    this.config = this.normalizeConfig({ ...this.config, ...nextConfig });
    this.enabled = this.config.longviewEnabled !== false;
    this.document.documentElement.dataset.longviewMode = this.config.longviewMode;

    if (!this.enabled) {
      this.restoreAll();
    } else if (!previousEnabled) {
      this.scan('re-enabled');
    } else {
      this.scheduleScan('config-change', 0);
    }
  }

  getScrollTop() {
    if (this.scrollRoot === this.document.scrollingElement || this.scrollRoot === this.document.documentElement) {
      return this.window.scrollY || this.scrollRoot.scrollTop || 0;
    }
    return this.scrollRoot.scrollTop;
  }

  getViewportHeight() {
    if (this.scrollRoot === this.document.scrollingElement || this.scrollRoot === this.document.documentElement) {
      return this.window.innerHeight || this.document.documentElement.clientHeight || 1;
    }
    return this.scrollRoot.clientHeight || 1;
  }

  elementGeometry(element) {
    const rect = element.getBoundingClientRect();
    const scrollTop = this.getScrollTop();
    if (this.scrollRoot === this.document.scrollingElement || this.scrollRoot === this.document.documentElement) {
      return { top: rect.top + scrollTop, height: Math.max(1, rect.height) };
    }
    const rootRect = this.scrollRoot.getBoundingClientRect();
    return { top: rect.top - rootRect.top + scrollTop, height: Math.max(1, rect.height) };
  }

  scan(reason = 'manual') {
    if (!this.started || !this.enabled) return;
    clearTimeout(this.scanTimer);
    this.scanTimer = null;
    this.scanDueAt = 0;
    this.pendingScanReason = null;

    const selected = chooseAdapter(this.document, this.config);
    this.adapterName = selected.name;
    const next = [];
    const present = new Set(selected.elements);

    for (const element of selected.elements) {
      let segment = this.segmentByElement.get(element);
      if (!segment) {
        segment = {
          element,
          top: 0,
          height: 1,
          state: null,
          transitions: 0,
          lastChangedAt: 0
        };
        this.segmentByElement.set(element, segment);
      }
      const geometry = this.elementGeometry(element);
      segment.top = geometry.top;
      segment.height = geometry.height;
      element.style.setProperty('--lv-intrinsic-block-size', `${Math.ceil(segment.height)}px`);
      element.classList.add(SEGMENT_CLASS);
      next.push(segment);
    }

    for (const segment of this.segments) {
      if (!present.has(segment.element)) this.restoreSegment(segment);
    }

    this.segments = next.sort((a, b) => a.top - b.top);
    this.lastDomNodeCount = this.document.getElementsByTagName('*').length;
    this.activeSegments.clear();
    for (const segment of this.segments) {
      this.applyState(segment, SegmentState.COLD, true);
    }
    this.lastScanReason = reason;
    this.update(true);
  }

  scheduleScan(reason, delay = 250) {
    const dueAt = performance.now() + Math.max(0, delay);
    this.pendingScanReason = reason;
    if (this.scanTimer && this.scanDueAt <= dueAt) return;
    clearTimeout(this.scanTimer);
    this.scanDueAt = dueAt;
    this.scanTimer = setTimeout(() => {
      const nextReason = this.pendingScanReason || reason;
      this.scan(nextReason);
    }, Math.max(0, dueAt - performance.now()));
  }

  scheduleUpdate() {
    if (this.updateScheduled || !this.enabled) return;
    this.updateScheduled = true;
    requestAnimationFrame(() => {
      this.updateScheduled = false;
      this.update(false);
    });
  }


  segmentForNode(node) {
    let element = node?.nodeType === 1 ? node : node?.parentElement;
    while (element) {
      const segment = this.segmentByElement.get(element);
      if (segment) return segment;
      element = element.parentElement;
    }
    return null;
  }

  collectPinnedSegments() {
    const pinned = new Set();
    const addNode = (node) => {
      const segment = this.segmentForNode(node);
      if (segment) pinned.add(segment);
    };

    addNode(this.document.activeElement);
    addNode(this.document.fullscreenElement);
    const selection = this.document.getSelection?.();
    if (selection?.rangeCount) {
      addNode(selection.anchorNode);
      addNode(selection.focusNode);
    }
    return pinned;
  }

  update(force = false) {
    if (!this.enabled || !this.segments.length || this.materializedReason) {
      this.updateMetricsContext();
      return;
    }

    const now = performance.now();
    const scrollTop = this.getScrollTop();
    const elapsed = Math.max(1, now - this.lastScrollAt);
    const instantaneousVelocity = ((scrollTop - this.lastScrollTop) / elapsed) * 1000;
    this.velocity = this.velocity * 0.72 + instantaneousVelocity * 0.28;
    this.lastScrollTop = scrollTop;
    this.lastScrollAt = now;

    const viewportHeight = this.getViewportHeight();
    const policyInput = {
      viewportTop: scrollTop,
      viewportHeight,
      velocity: this.velocity,
      config: this.config
    };
    const ranges = computePolicyRanges(policyInput);
    const first = lowerBoundByBottom(this.segments, ranges.warmStart);
    const end = upperBoundByTop(this.segments, ranges.warmEnd);
    const nextActive = new Set();

    for (let index = first; index < end; index += 1) {
      const segment = this.segments[index];
      const state = classifySegment({
        top: segment.top,
        height: segment.height,
        ...policyInput
      });
      this.applyState(segment, state, force);
      nextActive.add(segment);
    }

    for (const segment of this.collectPinnedSegments()) {
      this.applyState(segment, SegmentState.HOT, force);
      nextActive.add(segment);
    }

    for (const segment of this.activeSegments) {
      if (!nextActive.has(segment)) this.applyState(segment, SegmentState.COLD, force);
    }

    this.activeSegments = nextActive;
    this.updateMetricsContext();
  }

  applyState(segment, state, force = false) {
    if (!force && segment.state === state) return;
    const element = segment.element;
    if (!element.isConnected) return;

    element.classList.remove('lv-hot', 'lv-warm', 'lv-cold');
    element.classList.add(`lv-${state}`);
    element.dataset.longviewState = state;
    element.style.setProperty('--lv-intrinsic-block-size', `${Math.ceil(segment.height)}px`);

    if (state === SegmentState.HOT || state === SegmentState.WARM) {
      this.resizeObserver?.observe(element);
    } else {
      this.resizeObserver?.unobserve(element);
    }

    segment.state = state;
    segment.transitions += 1;
    segment.lastChangedAt = performance.now();
  }

  materializeAll(reason = 'external-operation', holdMs = 5000) {
    if (!this.enabled) return;
    clearTimeout(this.materializeTimer);
    this.materializedReason = reason;
    for (const segment of this.segments) this.applyState(segment, SegmentState.HOT, true);
    this.activeSegments = new Set(this.segments);
    this.updateMetricsContext();
    if (Number.isFinite(holdMs) && holdMs > 0) {
      this.materializeTimer = setTimeout(() => this.releaseMaterialization(reason), holdMs);
    }
  }

  releaseMaterialization(reason) {
    if (reason && this.materializedReason && reason !== this.materializedReason) return;
    clearTimeout(this.materializeTimer);
    this.materializeTimer = null;
    this.materializedReason = null;
    this.update(true);
  }

  forceRescan() {
    this.scan('forced');
  }

  updateMetricsContext() {
    const counts = { hot: 0, warm: 0, cold: 0 };
    for (const segment of this.segments) {
      if (segment.state && counts[segment.state] !== undefined) counts[segment.state] += 1;
    }
    this.metrics.setContext({
      enabled: this.enabled,
      mode: this.config.longviewMode,
      adapter: this.adapterName,
      segments: this.segments.length,
      ...counts,
      scrollVelocity: Math.round(this.velocity),
      documentHeight: this.scrollRoot?.scrollHeight || this.document.documentElement.scrollHeight || 0,
      domNodes: this.lastDomNodeCount || (this.lastDomNodeCount = this.document.getElementsByTagName('*').length),
      materializedReason: this.materializedReason,
      lastScanReason: this.lastScanReason || null
    });
  }

  restoreSegment(segment) {
    const element = segment.element;
    if (!element) return;
    this.resizeObserver?.unobserve(element);
    element.classList.remove(SEGMENT_CLASS, 'lv-hot', 'lv-warm', 'lv-cold');
    element.removeAttribute('data-longview-state');
    element.style.removeProperty('--lv-intrinsic-block-size');
    segment.state = null;
  }

  restoreAll() {
    clearTimeout(this.materializeTimer);
    this.materializedReason = null;
    for (const segment of this.segments) this.restoreSegment(segment);
    this.activeSegments.clear();
    this.document.documentElement.removeAttribute('data-longview-mode');
    this.updateMetricsContext();
  }

  destroy() {
    this.restoreAll();
    this.scrollRoot?.removeEventListener('scroll', this.boundOnScroll);
    this.window.removeEventListener('resize', this.boundOnResize);
    this.document.removeEventListener('focusin', this.boundOnFocusChange, true);
    this.document.removeEventListener('focusout', this.boundOnFocusChange, true);
    this.document.removeEventListener('selectionchange', this.boundOnSelectionChange);
    this.document.removeEventListener('beforematch', this.boundOnBeforeMatch, true);
    this.document.removeEventListener('copy', this.boundOnCopy, true);
    this.window.removeEventListener('beforeprint', this.boundOnBeforePrint);
    this.window.removeEventListener('afterprint', this.boundOnAfterPrint);
    this.mutationObserver?.disconnect();
    this.resizeObserver?.disconnect();
    this.metrics.stop();
    clearTimeout(this.scanTimer);
    this.document.getElementById(STYLE_ID)?.remove();
    this.started = false;
  }
}

module.exports = {
  LongViewEngine,
  lowerBoundByBottom,
  upperBoundByTop
};
