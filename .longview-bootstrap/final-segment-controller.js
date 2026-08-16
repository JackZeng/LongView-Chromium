(function installSegmentController(global) {
  "use strict";

  const LV = global.LongView;
  const Core = global.LongViewCore;
  const { SegmentState } = Core;
  const STYLE_PROPERTIES = ["content-visibility", "contain-intrinsic-block-size", "overflow-anchor"];

  function captureStyle(node) {
    return Object.fromEntries(STYLE_PROPERTIES.map((property) => [property, {
      value: node.style.getPropertyValue(property),
      priority: node.style.getPropertyPriority(property)
    }]));
  }

  function restoreStyle(node, snapshot) {
    for (const property of STYLE_PROPERTIES) {
      const original = snapshot[property];
      if (!original?.value && !original?.priority) node.style.removeProperty(property);
      else node.style.setProperty(property, original.value, original.priority);
    }
    node.style.removeProperty("--longview-intrinsic-height");
  }

  function eligible(node, settings) {
    if (!(node instanceof HTMLElement) || !node.isConnected || node === document.body || node === document.documentElement) return false;
    const rect = node.getBoundingClientRect();
    if (rect.height < settings.minimumSegmentHeight || rect.width < innerWidth * 0.3) return false;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || style.position === "fixed" || style.position === "sticky") return false;
    if (node.matches('dialog[open], [popover]:popover-open') || node.querySelector('dialog[open], [popover]:popover-open')) return false;
    for (const media of node.querySelectorAll("video,audio")) if (!media.paused && !media.ended) return false;
    return true;
  }

  class SegmentController {
    constructor(discovery, settings) {
      this.discovery = discovery;
      this.settings = Core.normalizeSettings(settings);
      this.root = discovery.root;
      this.segments = [];
      this.segmentByNode = new Map();
      this.previousWarmRange = null;
      this.scrollSamples = [];
      this.velocity = 0;
      this.framePending = false;
      this.rediscoveryTimer = 0;
      this.remeasureTimer = 0;
      this.started = false;
      this.destroyed = false;
      this.mutationObserver = null;
      this.resizeObserver = null;
      this.longTaskObserver = null;
      this.observedResize = new Set();
      this.metricsTimer = 0;
      this.stats = {
        active: false, adapter: discovery.adapterId, confidence: discovery.confidence,
        segments: 0, hot: 0, warm: 0, cold: 0, pinned: 0,
        transitions: 0, reindexes: 0, mutations: 0, longTasks: 0,
        longTaskTime: 0, lastReason: "created"
      };
      this.onScroll = this.onScroll.bind(this);
      this.onResize = this.onResize.bind(this);
      this.onBeforeMatch = this.onBeforeMatch.bind(this);
      this.onFocusIn = this.onFocusIn.bind(this);
      this.onSelectionChange = this.onSelectionChange.bind(this);
    }

    createSegment(node) {
      const rect = node.getBoundingClientRect();
      const height = Math.max(1, rect.height);
      const segment = {
        node, top: rect.top + scrollY, height, bottom: rect.top + scrollY + height,
        state: null, pinnedUntil: 0, transitions: 0, originalStyle: captureStyle(node),
        originalStateAttribute: node.getAttribute("data-longview-state"),
        originalSegmentAttribute: node.getAttribute("data-longview-segment")
      };
      node.dataset.longviewSegment = "true";
      node.style.setProperty("--longview-intrinsic-height", `${Math.ceil(height)}px`);
      return segment;
    }

    start() {
      if (this.started || this.destroyed) return false;
      this.rebuild(this.discovery.nodes, "initial");
      if (this.segments.length < this.settings.minimumSegments) {
        this.destroy("too-few-segments");
        return false;
      }
      document.documentElement.dataset.longviewMode = this.settings.mode;
      addEventListener("scroll", this.onScroll, { passive: true });
      addEventListener("resize", this.onResize, { passive: true });
      document.addEventListener("beforematch", this.onBeforeMatch, true);
      document.addEventListener("focusin", this.onFocusIn, true);
      document.addEventListener("selectionchange", this.onSelectionChange, true);
      this.installObservers();
      this.started = true;
      this.stats.active = true;
      this.updateWorkingSet("start");
      this.metricsTimer = setInterval(() => this.publishStats(), 1500);
      this.publishStats();
      return true;
    }

    installObservers() {
      this.mutationObserver = new MutationObserver((records) => {
        this.stats.mutations += records.reduce((sum, record) => sum + record.addedNodes.length + record.removedNodes.length, 0);
        this.scheduleRediscovery("mutation", 300);
      });
      this.mutationObserver.observe(this.root, { childList: true, subtree: true });
      this.resizeObserver = new ResizeObserver(() => this.scheduleRemeasure("resize-observer", 100));
      if ("PerformanceObserver" in global) {
        try {
          this.longTaskObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              this.stats.longTasks += 1;
              this.stats.longTaskTime += entry.duration;
            }
          });
          this.longTaskObserver.observe({ type: "longtask", buffered: true });
        } catch {}
      }
    }

    rebuild(nodes, reason) {
      const nextNodes = [...new Set(nodes)].filter((node) => eligible(node, this.settings));
      const nextSet = new Set(nextNodes);
      for (const segment of this.segments) if (!nextSet.has(segment.node)) this.restoreSegment(segment);
      const next = [];
      for (const node of nextNodes) {
        let segment = this.segmentByNode.get(node);
        if (!segment) {
          segment = this.createSegment(node);
          this.segmentByNode.set(node, segment);
        }
        next.push(segment);
      }
      this.segments = next;
      this.remeasureAll(false);
      this.previousWarmRange = null;
      this.stats.segments = this.segments.length;
      this.stats.reindexes += 1;
      this.stats.lastReason = reason;
    }

    remeasureAll(requestUpdate = true) {
      const y = scrollY;
      for (const segment of this.segments) {
        if (!segment.node.isConnected) continue;
        const rect = segment.node.getBoundingClientRect();
        segment.top = rect.top + y;
        segment.height = Math.max(1, rect.height || segment.height);
        segment.bottom = segment.top + segment.height;
        segment.node.style.setProperty("--longview-intrinsic-height", `${Math.ceil(segment.height)}px`);
      }
      this.segments.sort((a, b) => a.top - b.top);
      this.segments.forEach((segment, index) => { segment.index = index; });
      this.previousWarmRange = null;
      if (requestUpdate) this.requestUpdate("remeasure");
    }

    applyState(segment, desired, reason) {
      const now = performance.now();
      if (segment.pinnedUntil > now) desired = SegmentState.PINNED;
      if (segment.state === desired) {
        this.syncResizeObservation(segment, desired);
        return;
      }
      segment.state = desired;
      segment.transitions += 1;
      this.stats.transitions += 1;
      this.stats.lastReason = reason;
      segment.node.dataset.longviewState = desired;
      if (desired === SegmentState.HOT || desired === SegmentState.PINNED) {
        segment.node.style.setProperty("content-visibility", "visible", "important");
      } else {
        segment.node.style.setProperty("content-visibility", "auto", "important");
        segment.node.style.setProperty("contain-intrinsic-block-size", `auto ${Math.ceil(segment.height)}px`, "important");
      }
      this.syncResizeObservation(segment, desired);
    }

    syncResizeObservation(segment, state) {
      if (!this.resizeObserver) return;
      const shouldObserve = state !== SegmentState.COLD;
      const observed = this.observedResize.has(segment);
      if (shouldObserve && !observed) {
        this.resizeObserver.observe(segment.node);
        this.observedResize.add(segment);
      } else if (!shouldObserve && observed) {
        this.resizeObserver.unobserve(segment.node);
        this.observedResize.delete(segment);
      }
    }

    onScroll() {
      const now = performance.now();
      this.scrollSamples.push({ position: scrollY, time: now });
      while (this.scrollSamples.length > 8 || (this.scrollSamples[0] && now - this.scrollSamples[0].time > 180)) this.scrollSamples.shift();
      this.velocity = Core.estimateVelocity(this.scrollSamples);
      this.requestUpdate("scroll");
    }

    onResize() { this.scheduleRemeasure("viewport-resize", 140); }
    onBeforeMatch(event) { this.pinNode(event.target, 3500, "beforematch"); }
    onFocusIn(event) { this.pinNode(event.target, 5000, "focus"); }
    onSelectionChange() {
      const selection = getSelection();
      if (!selection || selection.isCollapsed) return;
      this.pinNode(selection.anchorNode, 5000, "selection");
      this.pinNode(selection.focusNode, 5000, "selection");
    }

    pinNode(node, durationMs, reason) {
      const element = node instanceof Element ? node : node?.parentElement;
      const segmentNode = element?.closest?.('[data-longview-segment="true"]');
      const segment = segmentNode ? this.segmentByNode.get(segmentNode) : null;
      if (!segment) return;
      segment.pinnedUntil = Math.max(segment.pinnedUntil, performance.now() + durationMs);
      this.applyState(segment, SegmentState.PINNED, reason);
      this.requestUpdate(reason);
    }

    requestUpdate(reason = "update") {
      if (this.framePending || this.destroyed) return;
      this.framePending = true;
      requestAnimationFrame(() => {
        this.framePending = false;
        this.updateWorkingSet(reason);
      });
    }

    updateWorkingSet(reason) {
      if (!this.segments.length || this.destroyed) return;
      const documentHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
      const workingSet = Core.computeWorkingSet({ scrollY, viewportHeight: Math.max(1, innerHeight), velocity: this.velocity, documentHeight, settings: this.settings });
      const warm = Core.rangeForWindow(this.segments, workingSet.warmTop, workingSet.warmBottom);
      const hot = Core.rangeForWindow(this.segments, workingSet.hotTop, workingSet.hotBottom);
      let limitedWarm = warm;
      const count = warm.end - warm.start;
      if (count > this.settings.maxWarmSegments) {
        const center = workingSet.direction < 0 ? hot.start : hot.end;
        let start = Math.max(0, center - Math.floor(this.settings.maxWarmSegments / 2));
        let end = Math.min(this.segments.length, start + this.settings.maxWarmSegments);
        start = Math.max(0, end - this.settings.maxWarmSegments);
        limitedWarm = { start, end };
      }
      const previous = this.previousWarmRange || limitedWarm;
      const start = Math.max(0, Math.min(previous.start, limitedWarm.start) - 2);
      const end = Math.min(this.segments.length, Math.max(previous.end, limitedWarm.end) + 2);
      const now = performance.now();
      for (let index = start; index < end; index += 1) {
        const segment = this.segments[index];
        let desired = SegmentState.COLD;
        if (segment.pinnedUntil > now) desired = SegmentState.PINNED;
        else if (index >= hot.start && index < hot.end) desired = SegmentState.HOT;
        else if (index >= limitedWarm.start && index < limitedWarm.end) desired = SegmentState.WARM;
        this.applyState(segment, desired, reason);
      }
      this.previousWarmRange = limitedWarm;
      this.stats.lastReason = reason;
      this.publishStats();
    }

    scheduleRemeasure(reason, delay = 180) {
      clearTimeout(this.remeasureTimer);
      this.remeasureTimer = setTimeout(() => {
        if (this.destroyed) return;
        this.stats.lastReason = reason;
        this.remeasureAll();
      }, delay);
    }

    scheduleRediscovery(reason, delay = 350) {
      clearTimeout(this.rediscoveryTimer);
      this.rediscoveryTimer = setTimeout(() => {
        if (this.destroyed) return;
        const next = LV.adapters.discover(this.settings);
        if (!next || next.nodes.length < this.settings.minimumSegments) return;
        if (next.root !== this.root) {
          this.mutationObserver?.disconnect();
          this.root = next.root;
          this.mutationObserver?.observe(this.root, { childList: true, subtree: true });
        }
        this.discovery = next;
        this.stats.adapter = next.adapterId;
        this.rebuild(next.nodes, reason);
        this.updateWorkingSet(reason);
      }, delay);
    }

    setSettings(settings) {
      this.settings = Core.normalizeSettings(settings);
      document.documentElement.dataset.longviewMode = this.settings.mode;
      this.previousWarmRange = null;
      this.scheduleRediscovery("settings", 0);
    }

    snapshot() {
      const counts = { hot: 0, warm: 0, cold: 0, pinned: 0 };
      for (const segment of this.segments) if (segment.state && segment.state in counts) counts[segment.state] += 1;
      return { ...this.stats, ...counts, active: this.started && !this.destroyed, segments: this.segments.length, velocity: Math.round(this.velocity), pageScreens: Number((Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0) / Math.max(1, innerHeight)).toFixed(1)), mode: this.settings.mode };
    }

    publishStats() {
      const stats = this.snapshot();
      LV.state.diagnostics?.render(stats);
      try { chrome.runtime.sendMessage({ type: "longview:stats", stats }).catch(() => {}); } catch {}
    }

    restoreSegment(segment) {
      this.resizeObserver?.unobserve(segment.node);
      this.observedResize.delete(segment);
      restoreStyle(segment.node, segment.originalStyle);
      if (segment.originalStateAttribute === null) segment.node.removeAttribute("data-longview-state");
      else segment.node.setAttribute("data-longview-state", segment.originalStateAttribute);
      if (segment.originalSegmentAttribute === null) segment.node.removeAttribute("data-longview-segment");
      else segment.node.setAttribute("data-longview-segment", segment.originalSegmentAttribute);
      this.segmentByNode.delete(segment.node);
    }

    destroy(reason = "destroy") {
      if (this.destroyed) return;
      this.destroyed = true;
      removeEventListener("scroll", this.onScroll);
      removeEventListener("resize", this.onResize);
      document.removeEventListener("beforematch", this.onBeforeMatch, true);
      document.removeEventListener("focusin", this.onFocusIn, true);
      document.removeEventListener("selectionchange", this.onSelectionChange, true);
      this.mutationObserver?.disconnect();
      this.resizeObserver?.disconnect();
      this.longTaskObserver?.disconnect();
      clearTimeout(this.rediscoveryTimer);
      clearTimeout(this.remeasureTimer);
      clearInterval(this.metricsTimer);
      for (const segment of this.segments) this.restoreSegment(segment);
      this.segments = [];
      this.segmentByNode.clear();
      this.observedResize.clear();
      this.started = false;
      this.stats.active = false;
      this.stats.lastReason = reason;
      delete document.documentElement.dataset.longviewMode;
      LV.state.diagnostics?.render(this.snapshot());
    }
  }

  LV.SegmentController = SegmentController;
})(globalThis);
