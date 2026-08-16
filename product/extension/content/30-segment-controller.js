(function installSegmentController(global) {
  "use strict";

  const LV = global.LongView;
  const Core = global.LongViewCore;
  const { SegmentState } = Core;

  const STYLE_PROPERTIES = ["content-visibility", "contain-intrinsic-block-size", "overflow-anchor"];

  function captureInlineStyle(node) {
    const snapshot = {};
    for (const property of STYLE_PROPERTIES) {
      snapshot[property] = {
        value: node.style.getPropertyValue(property),
        priority: node.style.getPropertyPriority(property)
      };
    }
    return snapshot;
  }

  function restoreInlineStyle(node, snapshot) {
    for (const property of STYLE_PROPERTIES) {
      const original = snapshot[property];
      if (!original || (!original.value && !original.priority)) node.style.removeProperty(property);
      else node.style.setProperty(property, original.value, original.priority);
    }
  }

  function isMediaActive(node) {
    for (const media of node.querySelectorAll("video, audio")) {
      if (!media.paused && !media.ended) return true;
    }
    return false;
  }

  function isEligible(node, settings) {
    if (!(node instanceof HTMLElement) || !node.isConnected) return false;
    if (node === document.body || node === document.documentElement) return false;
    const rect = node.getBoundingClientRect();
    if (rect.height < settings.minimumSegmentHeight || rect.width < innerWidth * 0.3) return false;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (style.position === "fixed" || style.position === "sticky") return false;
    if (node.matches("dialog[open], [popover]:popover-open")) return false;
    if (node.querySelector("dialog[open], [popover]:popover-open")) return false;
    if (isMediaActive(node)) return false;
    return true;
  }

  class SegmentController {
    constructor(discovery, settings) {
      this.discovery = discovery;
      this.settings = Core.normalizeSettings(settings);
      this.root = discovery.root;
      this.segments = [];
      this.segmentByNode = new Map();
      this.pinnedSegments = new Set();
      this.observedSegments = new Set();
      this.dirtyGeometrySegments = new Set();
      this.previousWarmRange = null;
      this.scrollSamples = [];
      this.frameRequested = false;
      this.geometryFrameRequested = false;
      this.remeasureTimer = 0;
      this.rediscoveryTimer = 0;
      this.started = false;
      this.destroyed = false;
      this.lastVelocity = 0;
      this.lastWorkingSet = null;
      this.styleElement = null;
      this.mutationObserver = null;
      this.resizeObserver = null;
      this.longTaskObserver = null;
      this.metricsTimer = 0;
      this.stats = {
        active: false,
        adapter: discovery.adapterId,
        confidence: discovery.confidence,
        segments: 0,
        transitions: 0,
        reindexes: 0,
        geometryUpdates: 0,
        incrementalAdds: 0,
        mutations: 0,
        autoSkipped: 0,
        longTasks: 0,
        longTaskTime: 0,
        lastReason: "created",
        startedAt: Date.now()
      };

      this.onScroll = this.onScroll.bind(this);
      this.onResize = this.onResize.bind(this);
      this.onBeforeMatch = this.onBeforeMatch.bind(this);
      this.onFocusIn = this.onFocusIn.bind(this);
      this.onSelectionChange = this.onSelectionChange.bind(this);
      this.onAutoStateChange = this.onAutoStateChange.bind(this);
    }

    start() {
      if (this.started || this.destroyed) return false;
      this.injectStyle();
      this.rebuildSegments(this.discovery.nodes, "initial");
      if (this.segments.length < this.settings.minimumSegments) {
        this.destroy("too-few-eligible-segments");
        return false;
      }

      addEventListener("scroll", this.onScroll, { passive: true });
      addEventListener("resize", this.onResize, { passive: true });
      document.addEventListener("beforematch", this.onBeforeMatch, true);
      document.addEventListener("focusin", this.onFocusIn, true);
      document.addEventListener("selectionchange", this.onSelectionChange, true);
      document.addEventListener("contentvisibilityautostatechange", this.onAutoStateChange, true);

      this.installObservers();
      this.started = true;
      this.stats.active = true;
      this.updateWorkingSet("start");
      this.metricsTimer = setInterval(() => this.publishStats(), 1500);
      this.publishStats();
      return true;
    }

    injectStyle() {
      const style = document.createElement("style");
      style.id = "longview-runtime-style";
      style.textContent = `
        [data-longview-segment="true"][data-longview-state="warm"],
        [data-longview-segment="true"][data-longview-state="cold"] {
          content-visibility: auto !important;
          contain-intrinsic-block-size: auto var(--longview-intrinsic-height, 600px) !important;
        }
        [data-longview-segment="true"][data-longview-state="hot"],
        [data-longview-segment="true"][data-longview-state="pinned"] {
          content-visibility: visible !important;
        }
        html[data-longview-mode="aggressive"] [data-longview-state="cold"] *,
        html[data-longview-mode="aggressive"] [data-longview-state="cold"]::before,
        html[data-longview-mode="aggressive"] [data-longview-state="cold"]::after {
          animation-play-state: paused !important;
          transition-property: none !important;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
      document.documentElement.dataset.longviewMode = this.settings.mode;
      this.styleElement = style;
    }

    installObservers() {
      this.mutationObserver = new MutationObserver((records) => this.handleMutations(records));
      this.mutationObserver.observe(this.root, { childList: true, subtree: true });

      this.resizeObserver = new ResizeObserver((entries) => {
        const dirty = new Set();
        for (const entry of entries) {
          const segment = this.segmentByNode.get(entry.target);
          if (segment) dirty.add(segment);
        }
        if (dirty.size) this.queueGeometryRefresh(dirty, "resize-observer");
      });

      if ("PerformanceObserver" in global) {
        try {
          this.longTaskObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              this.stats.longTasks += 1;
              this.stats.longTaskTime += entry.duration;
            }
          });
          this.longTaskObserver.observe({ type: "longtask", buffered: true });
        } catch {
          this.longTaskObserver = null;
        }
      }
    }

    handleMutations(records) {
      let requiresRediscovery = false;
      const dirty = new Set();
      const addedNodes = [];

      for (const record of records) {
        const mutationCount = record.addedNodes.length + record.removedNodes.length;
        if (!mutationCount) continue;
        this.stats.mutations += mutationCount;

        const targetElement = record.target instanceof Element
          ? record.target
          : record.target?.parentElement;
        const segmentElement = targetElement?.closest?.('[data-longview-segment="true"]');
        const segment = segmentElement ? this.segmentByNode.get(segmentElement) : null;

        if (segment && record.target !== this.root) {
          dirty.add(segment);
          continue;
        }

        if (record.removedNodes.length) requiresRediscovery = true;
        addedNodes.push(...record.addedNodes);
      }

      if (dirty.size) this.queueGeometryRefresh(dirty, "content-mutation");
      if (addedNodes.length && !requiresRediscovery) {
        const appended = this.appendAddedNodes(addedNodes, "incremental-append");
        if (!appended && addedNodes.some((node) => node instanceof Element)) {
          requiresRediscovery = true;
        }
      }
      if (requiresRediscovery) this.scheduleRediscovery("mutation", 350);
    }

    collectMatchingNodes(addedNodes) {
      const candidates = [];
      const selector = this.discovery.selector;

      for (const added of addedNodes) {
        if (!(added instanceof HTMLElement) || !added.isConnected) continue;
        if (!selector) {
          if (added.parentElement === this.root) candidates.push(added);
          continue;
        }

        if (added.matches(selector)) candidates.push(added);
        for (const descendant of added.querySelectorAll("*")) {
          if (descendant instanceof HTMLElement && descendant.matches(selector)) {
            candidates.push(descendant);
          }
        }
      }
      return [...new Set(candidates)];
    }

    appendAddedNodes(addedNodes, reason) {
      const candidates = this.collectMatchingNodes(addedNodes)
        .filter((node) => !this.segmentByNode.has(node) && isEligible(node, this.settings));
      if (!candidates.length) return false;

      const y = scrollY;
      for (const node of candidates) {
        const segment = this.createSegment(node, y);
        this.segments.push(segment);
        this.segmentByNode.set(node, segment);
        this.applyState(segment, SegmentState.COLD, reason);
      }
      this.sortAndIndexSegments();
      this.previousWarmRange = null;
      this.stats.segments = this.segments.length;
      this.stats.incrementalAdds += candidates.length;
      this.stats.lastReason = reason;
      this.requestUpdate(reason);
      return true;
    }

    createSegment(node, documentScrollY = scrollY) {
      const rect = node.getBoundingClientRect();
      const height = Math.max(1, rect.height);
      const originalStyle = captureInlineStyle(node);
      const originalStateAttribute = node.getAttribute("data-longview-state");
      const originalSegmentAttribute = node.getAttribute("data-longview-segment");
      node.dataset.longviewSegment = "true";
      node.style.setProperty("--longview-intrinsic-height", `${Math.ceil(height)}px`);
      return {
        node,
        originalStyle,
        originalStateAttribute,
        originalSegmentAttribute,
        state: null,
        pinnedUntil: 0,
        transitions: 0,
        index: -1,
        top: rect.top + documentScrollY,
        bottom: rect.top + documentScrollY + height,
        height
      };
    }

    rebuildSegments(nodes, reason) {
      const nextNodes = [...new Set(nodes)].filter((node) => isEligible(node, this.settings));
      const nextNodeSet = new Set(nextNodes);

      for (const segment of this.segments) {
        if (!nextNodeSet.has(segment.node)) this.restoreSegment(segment);
      }

      const nextSegments = [];
      const y = scrollY;
      for (const node of nextNodes) {
        let segment = this.segmentByNode.get(node);
        if (!segment) {
          segment = this.createSegment(node, y);
          this.segmentByNode.set(node, segment);
          this.applyState(segment, SegmentState.COLD, "new-segment");
        } else {
          const rect = node.getBoundingClientRect();
          segment.top = rect.top + y;
          segment.height = Math.max(1, rect.height || segment.height);
          segment.bottom = segment.top + segment.height;
          node.style.setProperty("--longview-intrinsic-height", `${Math.ceil(segment.height)}px`);
        }
        nextSegments.push(segment);
      }

      this.segments = nextSegments;
      this.segmentByNode = new Map(nextSegments.map((segment) => [segment.node, segment]));
      this.sortAndIndexSegments();
      this.previousWarmRange = null;
      this.stats.segments = this.segments.length;
      this.stats.reindexes += 1;
      this.stats.lastReason = reason;
      if (this.started) this.requestUpdate(reason);
    }

    sortAndIndexSegments() {
      this.segments.sort((a, b) => a.top - b.top);
      for (let index = 0; index < this.segments.length; index += 1) {
        this.segments[index].index = index;
      }
    }

    restoreSegment(segment) {
      this.pinnedSegments.delete(segment);
      if (this.resizeObserver && this.observedSegments.has(segment)) {
        this.resizeObserver.unobserve(segment.node);
        this.observedSegments.delete(segment);
      }
      restoreInlineStyle(segment.node, segment.originalStyle);
      segment.node.style.removeProperty("--longview-intrinsic-height");
      if (segment.originalStateAttribute === null) segment.node.removeAttribute("data-longview-state");
      else segment.node.setAttribute("data-longview-state", segment.originalStateAttribute);
      if (segment.originalSegmentAttribute === null) segment.node.removeAttribute("data-longview-segment");
      else segment.node.setAttribute("data-longview-segment", segment.originalSegmentAttribute);
      this.segmentByNode.delete(segment.node);
    }

    syncResizeObservation(segment, state) {
      if (!this.resizeObserver) return;
      const shouldObserve = state !== SegmentState.COLD;
      const observed = this.observedSegments.has(segment);
      if (shouldObserve && !observed) {
        this.resizeObserver.observe(segment.node);
        this.observedSegments.add(segment);
      } else if (!shouldObserve && observed) {
        this.resizeObserver.unobserve(segment.node);
        this.observedSegments.delete(segment);
      }
    }

    applyState(segment, nextState, reason) {
      const now = performance.now();
      if (segment.pinnedUntil > now) nextState = SegmentState.PINNED;
      else if (segment.state === SegmentState.PINNED) this.pinnedSegments.delete(segment);
      if (segment.state === nextState && segment.node.dataset.longviewState === nextState) {
        this.syncResizeObservation(segment, nextState);
        return;
      }

      segment.state = nextState;
      segment.transitions += 1;
      this.stats.transitions += 1;
      this.stats.lastReason = reason;
      segment.node.dataset.longviewState = nextState;

      if (nextState === SegmentState.HOT || nextState === SegmentState.PINNED) {
        segment.node.style.setProperty("content-visibility", "visible", "important");
      } else {
        segment.node.style.setProperty("content-visibility", "auto", "important");
        segment.node.style.setProperty(
          "contain-intrinsic-block-size",
          `auto ${Math.ceil(segment.height)}px`,
          "important"
        );
      }
      this.syncResizeObservation(segment, nextState);
    }

    onScroll() {
      const now = performance.now();
      this.scrollSamples.push({ position: scrollY, time: now });
      while (this.scrollSamples.length > 8 || (this.scrollSamples[0] && now - this.scrollSamples[0].time > 180)) {
        this.scrollSamples.shift();
      }
      this.lastVelocity = Core.estimateVelocity(this.scrollSamples);
      this.requestUpdate("scroll");
    }

    onResize() {
      this.scheduleRemeasure("viewport-resize", 150);
    }

    onBeforeMatch(event) {
      this.pinNode(event.target, 3000, "beforematch");
    }

    onFocusIn(event) {
      this.pinNode(event.target, 5000, "focus");
    }

    onSelectionChange() {
      const selection = getSelection();
      if (!selection || selection.isCollapsed) return;
      this.pinNode(selection.anchorNode, 5000, "selection");
      this.pinNode(selection.focusNode, 5000, "selection");
    }

    onAutoStateChange(event) {
      if (event.skipped) this.stats.autoSkipped += 1;
    }

    pinNode(node, durationMs, reason) {
      const element = node instanceof Element ? node : node?.parentElement;
      const segmentElement = element?.closest?.('[data-longview-segment="true"]');
      if (!segmentElement) return;
      const segment = this.segmentByNode.get(segmentElement);
      if (!segment) return;
      segment.pinnedUntil = Math.max(segment.pinnedUntil, performance.now() + durationMs);
      this.pinnedSegments.add(segment);
      this.applyState(segment, SegmentState.PINNED, reason);
      setTimeout(() => this.requestUpdate("pin-expired"), durationMs + 20);
    }

    requestUpdate(reason) {
      this.stats.lastReason = reason;
      if (this.frameRequested || this.destroyed) return;
      this.frameRequested = true;
      requestAnimationFrame(() => {
        this.frameRequested = false;
        this.updateWorkingSet(reason);
      });
    }

    updateWorkingSet(reason) {
      if (!this.segments.length || this.destroyed) return;
      const workingSet = Core.computeWorkingSet({
        scrollY,
        viewportHeight: innerHeight,
        velocity: this.lastVelocity,
        documentHeight: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
        settings: this.settings
      });
      this.lastWorkingSet = workingSet;

      const hotRange = Core.rangeForWindow(this.segments, workingSet.hotTop, workingSet.hotBottom);
      let warmRange = Core.rangeForWindow(this.segments, workingSet.warmTop, workingSet.warmBottom);
      warmRange = this.limitWarmRange(warmRange, hotRange, workingSet.direction);

      let affectedStart = warmRange.start;
      let affectedEnd = warmRange.end;
      if (this.previousWarmRange) {
        affectedStart = Math.min(affectedStart, this.previousWarmRange.start);
        affectedEnd = Math.max(affectedEnd, this.previousWarmRange.end);
      }

      for (let index = affectedStart; index < affectedEnd; index += 1) {
        const segment = this.segments[index];
        let state = SegmentState.COLD;
        if (index >= hotRange.start && index < hotRange.end) state = SegmentState.HOT;
        else if (index >= warmRange.start && index < warmRange.end) state = SegmentState.WARM;
        this.applyState(segment, state, reason);
      }

      const now = performance.now();
      for (const segment of [...this.pinnedSegments]) {
        if (segment.pinnedUntil > now) {
          this.applyState(segment, SegmentState.PINNED, reason);
          continue;
        }
        this.pinnedSegments.delete(segment);
        const index = segment.index;
        let state = SegmentState.COLD;
        if (index >= hotRange.start && index < hotRange.end) state = SegmentState.HOT;
        else if (index >= warmRange.start && index < warmRange.end) state = SegmentState.WARM;
        this.applyState(segment, state, "pin-expired");
      }

      this.previousWarmRange = warmRange;
      this.publishStats(false);
    }

    limitWarmRange(warmRange, hotRange, direction) {
      const max = this.settings.maxWarmSegments;
      if (warmRange.end - warmRange.start <= max) return warmRange;
      const hotCount = Math.max(1, hotRange.end - hotRange.start);
      const remaining = Math.max(0, max - hotCount);
      const behindRatio = direction < 0 ? 0.75 : direction > 0 ? 0.25 : 0.5;
      const behind = Math.floor(remaining * behindRatio);
      const ahead = remaining - behind;
      let start = Math.max(warmRange.start, hotRange.start - behind);
      let end = Math.min(warmRange.end, hotRange.end + ahead);
      if (end - start < max) {
        const missing = max - (end - start);
        start = Math.max(warmRange.start, start - missing);
        end = Math.min(warmRange.end, start + max);
      }
      return { start, end };
    }

    queueGeometryRefresh(segments, reason) {
      for (const segment of segments) {
        if (segment?.node?.isConnected) this.dirtyGeometrySegments.add(segment);
      }
      if (this.geometryFrameRequested || this.destroyed) return;
      this.geometryFrameRequested = true;
      requestAnimationFrame(() => {
        this.geometryFrameRequested = false;
        const dirty = [...this.dirtyGeometrySegments];
        this.dirtyGeometrySegments.clear();
        if (!dirty.length || this.destroyed) return;

        const y = scrollY;
        let changed = false;
        for (const segment of dirty) {
          if (!segment.node.isConnected || !this.segmentByNode.has(segment.node)) continue;
          const rect = segment.node.getBoundingClientRect();
          const top = rect.top + y;
          const height = Math.max(1, rect.height || segment.height);
          if (Math.abs(top - segment.top) > 0.5 || Math.abs(height - segment.height) > 0.5) {
            segment.top = top;
            segment.height = height;
            segment.bottom = top + height;
            segment.node.style.setProperty("--longview-intrinsic-height", `${Math.ceil(height)}px`);
            changed = true;
          }
        }

        if (changed) {
          this.sortAndIndexSegments();
          this.previousWarmRange = null;
          this.stats.geometryUpdates += dirty.length;
          this.requestUpdate(reason);
          // Position-only shifts do not notify ResizeObserver. Reconcile the
          // complete geometry after the page has been quiet, not on each token.
          this.scheduleRemeasure(`${reason}-settled`, 2500);
        }
      });
    }

    scheduleRemeasure(reason, delay) {
      clearTimeout(this.remeasureTimer);
      this.remeasureTimer = setTimeout(() => this.remeasure(reason), delay);
    }

    remeasure(reason) {
      if (this.destroyed) return;
      const y = scrollY;
      let disconnected = false;
      for (const segment of this.segments) {
        if (!segment.node.isConnected) {
          disconnected = true;
          continue;
        }
        const rect = segment.node.getBoundingClientRect();
        segment.top = rect.top + y;
        segment.height = Math.max(1, rect.height || segment.height);
        segment.bottom = segment.top + segment.height;
        segment.node.style.setProperty("--longview-intrinsic-height", `${Math.ceil(segment.height)}px`);
      }
      if (disconnected) {
        this.scheduleRediscovery(`${reason}-disconnected`, 0);
        return;
      }
      this.sortAndIndexSegments();
      this.previousWarmRange = null;
      this.stats.reindexes += 1;
      this.requestUpdate(reason);
    }

    scheduleRediscovery(reason, delay) {
      clearTimeout(this.rediscoveryTimer);
      this.rediscoveryTimer = setTimeout(() => {
        if (this.destroyed) return;
        const discovery = LV.adapters.discover(this.settings);
        if (discovery && discovery.nodes.length >= this.settings.minimumSegments) {
          this.discovery = discovery;
          const rootChanged = this.root !== discovery.root;
          this.root = discovery.root;
          this.stats.adapter = discovery.adapterId;
          this.stats.confidence = discovery.confidence;
          if (rootChanged && this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver.observe(this.root, { childList: true, subtree: true });
          }
          this.rebuildSegments(discovery.nodes, reason);
        } else {
          this.remeasure(reason);
        }
      }, delay);
    }

    setSettings(settings) {
      this.settings = Core.normalizeSettings(settings);
      document.documentElement.dataset.longviewMode = this.settings.mode;
      this.scheduleRediscovery("settings", 0);
      this.requestUpdate("settings");
    }

    snapshot() {
      const counts = { hot: 0, warm: 0, cold: 0, pinned: 0 };
      for (const segment of this.segments) {
        if (segment.state in counts) counts[segment.state] += 1;
      }
      return {
        ...this.stats,
        ...counts,
        velocity: Math.round(this.lastVelocity),
        pageScreens: Number((document.documentElement.scrollHeight / Math.max(1, innerHeight)).toFixed(1)),
        mode: this.settings.mode,
        version: LV.version,
        url: location.href,
        error: LV.state.lastError
      };
    }

    publishStats(send = true) {
      const snapshot = this.snapshot();
      LV.state.diagnostics?.render(snapshot);
      if (send) {
        chrome.runtime.sendMessage({ type: "longview:stats", stats: snapshot }).catch(() => {});
      }
      return snapshot;
    }

    destroy(reason = "manual") {
      if (this.destroyed) return;
      this.destroyed = true;
      this.started = false;
      this.stats.active = false;
      this.stats.lastReason = reason;
      removeEventListener("scroll", this.onScroll);
      removeEventListener("resize", this.onResize);
      document.removeEventListener("beforematch", this.onBeforeMatch, true);
      document.removeEventListener("focusin", this.onFocusIn, true);
      document.removeEventListener("selectionchange", this.onSelectionChange, true);
      document.removeEventListener("contentvisibilityautostatechange", this.onAutoStateChange, true);
      clearTimeout(this.remeasureTimer);
      clearTimeout(this.rediscoveryTimer);
      clearInterval(this.metricsTimer);
      this.mutationObserver?.disconnect();
      this.resizeObserver?.disconnect();
      this.longTaskObserver?.disconnect();
      this.observedSegments.clear();
      this.dirtyGeometrySegments.clear();
      for (const segment of this.segments) this.restoreSegment(segment);
      this.segments = [];
      this.styleElement?.remove();
      delete document.documentElement.dataset.longviewMode;
      this.publishStats();
    }
  }

  LV.SegmentController = SegmentController;
})(globalThis);
