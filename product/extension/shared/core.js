(function installLongViewCore(global) {
  "use strict";

  const SegmentState = Object.freeze({
    HOT: "hot",
    WARM: "warm",
    COLD: "cold",
    PINNED: "pinned"
  });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = clamp(Math.ceil((p / 100) * sorted.length) - 1, 0, sorted.length - 1);
    return sorted[index];
  }

  function normalizeSettings(input = {}) {
    const defaults = {
      enabled: true,
      mode: "conservative",
      minimumPageScreens: 24,
      minimumDomNodes: 3500,
      minimumSegments: 12,
      minimumSegmentHeight: 160,
      hotScreens: 1.25,
      warmAheadScreens: 6,
      warmBehindScreens: 2.5,
      maxWarmSegments: 80,
      showDiagnostics: false,
      excludedHosts: []
    };

    const settings = { ...defaults, ...input };
    settings.enabled = Boolean(settings.enabled);
    settings.mode = settings.mode === "aggressive" ? "aggressive" : "conservative";
    settings.minimumPageScreens = clamp(Number(settings.minimumPageScreens) || defaults.minimumPageScreens, 4, 1000);
    settings.minimumDomNodes = clamp(Number(settings.minimumDomNodes) || defaults.minimumDomNodes, 500, 2_000_000);
    settings.minimumSegments = clamp(Number(settings.minimumSegments) || defaults.minimumSegments, 4, 10_000);
    settings.minimumSegmentHeight = clamp(Number(settings.minimumSegmentHeight) || defaults.minimumSegmentHeight, 40, 4000);
    settings.hotScreens = clamp(Number(settings.hotScreens) || defaults.hotScreens, 0.5, 6);
    settings.warmAheadScreens = clamp(Number(settings.warmAheadScreens) || defaults.warmAheadScreens, 1, 30);
    settings.warmBehindScreens = clamp(Number(settings.warmBehindScreens) || defaults.warmBehindScreens, 1, 20);
    settings.maxWarmSegments = clamp(Number(settings.maxWarmSegments) || defaults.maxWarmSegments, 4, 1000);
    settings.showDiagnostics = Boolean(settings.showDiagnostics);
    settings.excludedHosts = Array.isArray(settings.excludedHosts)
      ? settings.excludedHosts.map(String).map((value) => value.trim().toLowerCase()).filter(Boolean)
      : [];
    return settings;
  }

  function estimateVelocity(samples) {
    if (!Array.isArray(samples) || samples.length < 2) return 0;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const elapsed = Math.max(1, last.time - first.time);
    return ((last.position - first.position) / elapsed) * 1000;
  }

  function computeWorkingSet({
    scrollY,
    viewportHeight,
    velocity,
    documentHeight,
    settings
  }) {
    const config = normalizeSettings(settings);
    const speedScreensPerSecond = Math.abs(velocity) / Math.max(1, viewportHeight);
    const predictionBoost = clamp(speedScreensPerSecond * 0.35, 0, 5);
    const direction = velocity === 0 ? 0 : Math.sign(velocity);

    let ahead = config.warmAheadScreens;
    let behind = config.warmBehindScreens;
    if (direction > 0) ahead += predictionBoost;
    if (direction < 0) behind += predictionBoost;

    const hotPadding = config.hotScreens * viewportHeight;
    const warmTop = clamp(scrollY - behind * viewportHeight, 0, documentHeight);
    const warmBottom = clamp(scrollY + viewportHeight + ahead * viewportHeight, 0, documentHeight);
    const hotTop = clamp(scrollY - hotPadding, 0, documentHeight);
    const hotBottom = clamp(scrollY + viewportHeight + hotPadding, 0, documentHeight);

    return { warmTop, warmBottom, hotTop, hotBottom, direction, predictionBoost };
  }

  function classifySegment(segment, workingSet) {
    const top = segment.top;
    const bottom = segment.bottom ?? segment.top + segment.height;
    if (bottom >= workingSet.hotTop && top <= workingSet.hotBottom) return SegmentState.HOT;
    if (bottom >= workingSet.warmTop && top <= workingSet.warmBottom) return SegmentState.WARM;
    return SegmentState.COLD;
  }

  function lowerBoundByBottom(segments, value) {
    let low = 0;
    let high = segments.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (segments[middle].bottom < value) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  function upperBoundByTop(segments, value) {
    let low = 0;
    let high = segments.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (segments[middle].top <= value) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  function rangeForWindow(segments, top, bottom) {
    if (!segments.length) return { start: 0, end: 0 };
    return {
      start: lowerBoundByBottom(segments, top),
      end: upperBoundByTop(segments, bottom)
    };
  }

  function scoreCandidateContainer({ childCount, totalHeight, viewportHeight, dominantRatio, medianHeight }) {
    if (childCount < 4 || viewportHeight <= 0 || totalHeight <= 0) return 0;
    const spanScreens = totalHeight / viewportHeight;
    const countScore = Math.log2(childCount + 1);
    const spanScore = Math.log2(spanScreens + 1);
    const repetitionScore = 0.5 + clamp(dominantRatio, 0, 1);
    const usefulHeight = clamp(medianHeight / 240, 0.25, 3);
    return countScore * spanScore * repetitionScore * usefulHeight;
  }

  function hostMatches(hostname, pattern) {
    const host = String(hostname || "").toLowerCase();
    const normalized = String(pattern || "").trim().toLowerCase();
    if (!normalized) return false;
    if (normalized.startsWith("*.")) {
      const suffix = normalized.slice(1);
      return host.endsWith(suffix) || host === normalized.slice(2);
    }
    return host === normalized || host.endsWith(`.${normalized}`);
  }

  global.LongViewCore = Object.freeze({
    SegmentState,
    clamp,
    median,
    percentile,
    normalizeSettings,
    estimateVelocity,
    computeWorkingSet,
    classifySegment,
    rangeForWindow,
    scoreCandidateContainer,
    hostMatches
  });
})(globalThis);
