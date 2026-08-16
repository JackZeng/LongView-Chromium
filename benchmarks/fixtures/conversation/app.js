(function benchmarkFixture() {
  "use strict";

  const params = new URLSearchParams(location.search);
  const config = Object.freeze({
    turns: Math.min(5000, Math.max(10, Number(params.get("turns")) || 500)),
    seed: Number(params.get("seed")) || 42,
    code: params.get("code") !== "0",
    tables: params.get("tables") !== "0",
    images: params.get("images") !== "0",
    stream: params.get("stream") === "1",
    stress: params.get("stress") === "1",
    autoRun: params.get("autorun") === "1",
    durationMs: Math.max(1000, Number(params.get("duration")) || 9000)
  });

  const feed = document.getElementById("feed");
  const result = document.getElementById("result");
  const summary = document.getElementById("summary");
  const frameDeltas = [];
  const longTasks = [];
  const layoutShifts = [];
  let lastFrame = performance.now();
  let running = false;
  let streamTimer = 0;
  let stressTimer = 0;

  function mulberry32(seed) {
    return function random() {
      let value = seed += 0x6D2B79F5;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  const random = mulberry32(config.seed);
  const words = "browser rendering viewport segment memory layout paint raster compositor scrolling message model system performance dynamic content observer geometry interaction latency response context reasoning token benchmark deterministic".split(" ");

  function sentence(wordCount = 22) {
    const output = [];
    for (let index = 0; index < wordCount; index += 1) output.push(words[Math.floor(random() * words.length)]);
    const text = output.join(" ");
    return text[0].toUpperCase() + text.slice(1) + ".";
  }

  function codeBlock(index) {
    return `<pre><code>function segment_${index}(viewport, items) {\n  const margin = viewport.height * ${1 + index % 5};\n  return items.filter((item) =&gt; item.bottom &gt; viewport.top - margin);\n}\n\nconsole.log("turn", ${index});</code></pre>`;
  }

  function table(index) {
    return `<table><thead><tr><th>Metric</th><th>Baseline</th><th>Variant</th></tr></thead><tbody>
      <tr><td>Frame p95</td><td>${18 + index % 9}.2 ms</td><td>${9 + index % 4}.4 ms</td></tr>
      <tr><td>DOM nodes</td><td>${1000 + index * 17}</td><td>${850 + index * 9}</td></tr>
      <tr><td>Working set</td><td>All</td><td>${12 + index % 20} segments</td></tr></tbody></table>`;
  }

  function createTurn(index) {
    const role = index % 2 === 0 ? "user" : "assistant";
    const article = document.createElement("article");
    article.className = "turn";
    article.id = `turn-${index}`;
    article.dataset.testid = `conversation-turn-${index}`;
    article.dataset.messageAuthorRole = role;
    article.innerHTML = `<div class="turn-header"><div class="role"><span class="avatar">${role === "user" ? "U" : "AI"}</span>${role}</div><span class="turn-index">#${index}</span></div>
      <h2>${role === "user" ? "Question" : "Response"} ${index}</h2>
      <p>${sentence(18 + index % 18)}</p><p>${sentence(24 + index % 25)}</p>
      ${config.code && index % 5 === 1 ? codeBlock(index) : ""}
      ${config.tables && index % 7 === 3 ? table(index) : ""}
      ${config.images && index % 11 === 5 ? `<div class="placeholder" role="img" aria-label="Synthetic image ${index}">Synthetic visual ${index}</div>` : ""}
      <p>${sentence(16 + index % 20)}</p>
      <div class="tool-row"><button>Copy</button><button>Useful</button><button>Retry</button></div>`;
    return article;
  }

  function generate() {
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < config.turns; index += 1) fragment.appendChild(createTurn(index));
    feed.appendChild(fragment);
    summary.textContent = `${config.turns} turns · ${document.getElementsByTagName("*").length.toLocaleString()} DOM nodes`;
  }

  function monitorFrames(now) {
    frameDeltas.push(now - lastFrame);
    if (frameDeltas.length > 20_000) frameDeltas.shift();
    lastFrame = now;
    requestAnimationFrame(monitorFrames);
  }

  function installObservers() {
    try {
      new PerformanceObserver((list) => longTasks.push(...list.getEntries().map((entry) => entry.duration))).observe({ type: "longtask", buffered: true });
    } catch {}
    try {
      new PerformanceObserver((list) => layoutShifts.push(...list.getEntries().filter((entry) => !entry.hadRecentInput).map((entry) => entry.value))).observe({ type: "layout-shift", buffered: true });
    } catch {}

    if (config.stress) {
      const intersection = new IntersectionObserver(() => {}, { rootMargin: "100% 0px" });
      const resize = new ResizeObserver(() => {});
      for (const node of [...feed.children].filter((_, index) => index % 5 === 0)) {
        intersection.observe(node);
        resize.observe(node);
      }
      stressTimer = setInterval(() => {
        const start = performance.now();
        while (performance.now() - start < 8 + Math.floor(random() * 12)) Math.sqrt(random() * 100_000);
        const distantIndex = Math.floor(random() * feed.children.length);
        const target = feed.children[distantIndex]?.querySelector(".turn-index");
        if (target) target.dataset.tick = String(Date.now());
      }, 850);
    }
  }

  function startStreaming() {
    if (!config.stream) return;
    let index = config.turns;
    streamTimer = setInterval(() => {
      const nearBottom = scrollY + innerHeight > document.documentElement.scrollHeight - innerHeight * 2;
      feed.appendChild(createTurn(index++));
      if (nearBottom) scrollTo(0, document.documentElement.scrollHeight);
      summary.textContent = `${feed.children.length} turns · streaming`;
    }, 1800);
  }

  function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p / 100) - 1))];
  }

  function snapshot(samples = frameDeltas, taskSamples = longTasks, shiftSamples = layoutShifts) {
    const recent = samples.filter((value) => value > 0 && value < 1000);
    const stableFrames = recent.filter((value) => value >= 4 && value <= 50);
    const expected = Math.min(33.33, Math.max(4, percentile(stableFrames, 10) || 1000 / 60));
    const memory = performance.memory ? {
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
    } : null;
    return {
      config,
      timestamp: new Date().toISOString(),
      domNodes: document.getElementsByTagName("*").length,
      scrollHeight: document.documentElement.scrollHeight,
      frameCount: recent.length,
      expectedFrameInterval: Number(expected.toFixed(2)),
      estimatedRefreshHz: Math.round(1000 / expected),
      frameTime: {
        p50: Number(percentile(recent, 50).toFixed(2)),
        p95: Number(percentile(recent, 95).toFixed(2)),
        p99: Number(percentile(recent, 99).toFixed(2)),
        max: Number(Math.max(0, ...recent).toFixed(2))
      },
      droppedFrameRatio: Number((recent.filter((value) => value > expected * 1.5).length / Math.max(1, recent.length)).toFixed(4)),
      longTasks: { count: taskSamples.length, totalMs: Number(taskSamples.reduce((sum, value) => sum + value, 0).toFixed(2)) },
      cumulativeLayoutShift: Number(shiftSamples.reduce((sum, value) => sum + value, 0).toFixed(4)),
      memory,
      longView: [...document.querySelectorAll('[data-longview-state]')].reduce((counts, node) => {
        const state = node.dataset.longviewState;
        counts[state] = (counts[state] || 0) + 1;
        return counts;
      }, {})
    };
  }

  async function runScroll({ durationMs = config.durationMs, passes = 1 } = {}) {
    if (running) throw new Error("A benchmark pass is already running");
    running = true;
    const sampleStart = frameDeltas.length;
    const taskStart = longTasks.length;
    const shiftStart = layoutShifts.length;

    try {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      const passDuration = durationMs / Math.max(1, passes * 2);

      for (let pass = 0; pass < passes; pass += 1) {
        for (const target of [maxScroll, 0]) {
          const from = scrollY;
          const startedAt = performance.now();
          await new Promise((resolve) => {
            function step(now) {
              const progress = Math.min(1, (now - startedAt) / passDuration);
              const eased = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;
              scrollTo(0, from + (target - from) * eased);
              if (progress < 1) requestAnimationFrame(step);
              else resolve();
            }
            requestAnimationFrame(step);
          });
        }
      }

      const metrics = snapshot(
        frameDeltas.slice(sampleStart),
        longTasks.slice(taskStart),
        layoutShifts.slice(shiftStart)
      );
      result.textContent = JSON.stringify(metrics, null, 2);
      return metrics;
    } finally {
      running = false;
    }
  }

  async function correctnessProbe() {
    const middle = feed.children[Math.floor(feed.children.length / 2)];
    if (!middle) return { ok: false, reason: "no-middle-turn" };

    const before = middle.getBoundingClientRect();
    const text = middle.textContent || "";
    middle.scrollIntoView({ block: "center" });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = middle.getBoundingClientRect();

    const button = middle.querySelector("button");
    button?.focus({ preventScroll: true });
    const focusWorks = Boolean(button && document.activeElement === button);

    const paragraph = middle.querySelector("p");
    const selection = getSelection();
    let selectedText = "";
    if (paragraph && selection) {
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      selection.removeAllRanges();
      selection.addRange(range);
      selectedText = selection.toString();
      selection.removeAllRanges();
    }

    const anchor = document.getElementById(middle.id);
    return {
      ok: text.includes("Response") || text.includes("Question"),
      geometryFinite: [before.top, before.height, after.top, middle.offsetTop].every(Number.isFinite),
      focusWorks,
      selectionWorks: selectedText.length > 8,
      anchorWorks: anchor === middle,
      targetIndex: middle.dataset.testid,
      textLength: text.length
    };
  }

  generate();
  installObservers();
  startStreaming();
  requestAnimationFrame(monitorFrames);

  const ready = new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__LONGVIEW_BENCHMARK__ = Object.freeze({ config, ready, runScroll, snapshot, correctnessProbe });
  document.getElementById("run").addEventListener("click", () => runScroll().catch((error) => result.textContent = error.stack));
  document.getElementById("top").addEventListener("click", () => scrollTo(0, 0));
  document.getElementById("bottom").addEventListener("click", () => scrollTo(0, document.documentElement.scrollHeight));
  ready.then(() => {
    result.textContent = JSON.stringify(snapshot([]), null, 2);
    if (config.autoRun) runScroll().catch((error) => result.textContent = error.stack);
  });
  addEventListener("beforeunload", () => { clearInterval(streamTimer); clearInterval(stressTimer); });
})();
