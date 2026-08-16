const params = new URLSearchParams(location.search);
const turns = Math.min(5000, Math.max(10, Number(params.get("turns") || 500)));
const stream = params.get("stream") === "1";
const stress = params.get("stress") === "1";
const runDuration = Math.max(1000, Number(params.get("duration") || 7000));
const seed = Number(params.get("seed") || 42);

const conversation = document.getElementById("conversation");
const stats = document.getElementById("stats");
const runButton = document.getElementById("run");
const targetSelect = document.getElementById("target");

function mulberry32(value) {
  return () => {
    value |= 0;
    value = value + 0x6D2B79F5 | 0;
    let result = Math.imul(value ^ value >>> 15, 1 | value);
    result = result + Math.imul(result ^ result >>> 7, 61 | result) ^ result;
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

function paragraph(index, extra = "") {
  const words = [
    "layout", "paint", "raster", "compositor", "segment", "memory", "selection",
    "accessibility", "observer", "streaming", "geometry", "scheduler", "viewport",
    "interaction", "compatibility", "materialization", "anchor", "mutation"
  ];
  const length = 26 + Math.floor(random() * 30);
  const generated = Array.from({ length }, (_, offset) => words[(index * 7 + offset * 3) % words.length]).join(" ");
  return `Turn ${index}: ${generated}. ${extra}`;
}

function table(index) {
  const rows = Array.from({ length: 5 }, (_, row) =>
    `<tr><td>${index}.${row}</td><td>${(index + row) * 17}</td><td>${paragraph(row).slice(0, 55)}</td></tr>`
  ).join("");
  return `<table><thead><tr><th>Step</th><th>Value</th><th>Observation</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function code(index) {
  return `<pre><code>function segment${index}(viewport) {
  const hot = viewport.start - ${index % 13};
  const warm = viewport.end + ${(index % 7) + 2};
  return { hot, warm, cold: hot &gt; warm };
}</code></pre>`;
}

function fakeImage(index) {
  return `<div class="fake-image" role="img" aria-label="Synthetic benchmark image ${index}">
    <span>${index}</span><i></i><b></b>
  </div>`;
}

function turnMarkup(index) {
  const role = index % 2 === 0 ? "assistant" : "user";
  const extras = [];
  if (index % 11 === 0) extras.push(code(index));
  if (index % 17 === 0) extras.push(table(index));
  if (index % 23 === 0) extras.push(fakeImage(index));
  return `<article class="turn ${role}" id="turn-${index}" data-longview-segment-root="true" data-turn="${index}" tabindex="-1">
    <div class="avatar" aria-hidden="true">${role === "assistant" ? "L" : "U"}</div>
    <div class="content">
      <header><strong>${role === "assistant" ? "LongView Assistant" : "Benchmark User"}</strong><a href="#turn-${index}">#${index}</a></header>
      <p>${paragraph(index, "This deterministic fixture intentionally retains a large live document.")}</p>
      <p>${paragraph(index + 1)}</p>
      ${extras.join("")}
      <div class="toolbar"><button type="button">Copy</button><button type="button">Retry</button><button type="button">More</button></div>
    </div>
  </article>`;
}

function render() {
  const fragments = [];
  for (let index = 0; index < turns; index += 1) fragments.push(turnMarkup(index));
  conversation.innerHTML = fragments.join("");
  targetSelect.innerHTML = [0, Math.floor(turns / 4), Math.floor(turns / 2), turns - 1]
    .map((value) => `<option value="turn-${value}">Turn ${value}</option>`)
    .join("");
  stats.textContent = `${turns} turns · ${document.getElementsByTagName("*").length.toLocaleString()} DOM nodes`;
}

const longTasks = [];
const frames = [];
const observerCounts = { intersection: 0, resize: 0 };
let frameLoopActive = true;
let lastFrame = performance.now();
function frameLoop(now) {
  if (frameLoopActive) frames.push(now - lastFrame);
  lastFrame = now;
  requestAnimationFrame(frameLoop);
}
requestAnimationFrame(frameLoop);

if ("PerformanceObserver" in window) {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) longTasks.push({ start: entry.startTime, duration: entry.duration });
  });
  try { observer.observe({ entryTypes: ["longtask"] }); } catch {}
}

const intersectionObserver = new IntersectionObserver((entries) => {
  observerCounts.intersection += entries.length;
}, { rootMargin: "600px 0px" });

const resizeObserver = new ResizeObserver((entries) => {
  observerCounts.resize += entries.length;
});

function attachObservers() {
  const nodes = [...document.querySelectorAll(".turn")];
  for (let index = 0; index < nodes.length; index += Math.max(1, Math.floor(nodes.length / 100))) {
    intersectionObserver.observe(nodes[index]);
    resizeObserver.observe(nodes[index]);
  }
}

function startStress() {
  if (!stress) return;
  setInterval(() => {
    const target = document.querySelector(`.turn[data-turn="${Math.floor(random() * turns)}"] p`);
    if (target) target.dataset.tick = String(performance.now());
  }, 240);
  setInterval(() => {
    const start = performance.now();
    while (performance.now() - start < 7) Math.sqrt(random() * 100000);
  }, 700);
}

function startStream() {
  if (!stream) return;
  const last = document.querySelector(".turn:last-child .content");
  if (!last) return;
  const output = document.createElement("p");
  output.className = "streaming-output";
  last.append(output);
  const tokens = paragraph(turns + 10).split(" ");
  let index = 0;
  const timer = setInterval(() => {
    output.append(`${tokens[index++ % tokens.length]} `);
    if (index > 320) clearInterval(timer);
  }, 25);
}

function quantile(values, value) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * value) - 1))];
}

function collectLongView() {
  const states = {};
  let active = 0;
  for (const node of document.querySelectorAll('[data-longview-segment="true"]')) {
    const state = node.dataset.longviewState || "unknown";
    states[state] = (states[state] || 0) + 1;
    active += 1;
  }
  return { active, ...states };
}

async function correctnessProbe() {
  const targetIndex = Math.min(turns - 1, Math.max(1, Math.floor(turns * 0.72)));
  const target = document.getElementById(`turn-${targetIndex}`);
  const geometry = target?.getBoundingClientRect();
  const anchor = target?.querySelector("a");
  anchor?.focus();
  const focusWorks = document.activeElement === anchor;
  const paragraphNode = target?.querySelector("p")?.firstChild;
  let selectionWorks = false;
  if (paragraphNode) {
    const range = document.createRange();
    range.setStart(paragraphNode, 0);
    range.setEnd(paragraphNode, Math.min(10, paragraphNode.length));
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    selectionWorks = selection.toString().length > 0;
    selection.removeAllRanges();
  }
  target?.scrollIntoView({ block: "center" });
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const afterScroll = target?.getBoundingClientRect();
  return {
    ok: Boolean(target && geometry && Number.isFinite(geometry.top)),
    geometryFinite: Boolean(geometry && Number.isFinite(geometry.height)),
    focusWorks,
    selectionWorks,
    anchorWorks: Boolean(afterScroll && Math.abs(afterScroll.top - innerHeight / 2) < innerHeight),
    targetIndex
  };
}

async function runScroll({ durationMs = runDuration, passes = 1 } = {}) {
  frameLoopActive = false;
  await new Promise((resolve) => requestAnimationFrame(resolve));
  frames.length = 0;
  longTasks.length = 0;
  observerCounts.intersection = 0;
  observerCounts.resize = 0;
  const initialHeap = performance.memory?.usedJSHeapSize || null;
  frameLoopActive = true;
  lastFrame = performance.now();
  const start = performance.now();
  const maximum = Math.max(0, document.documentElement.scrollHeight - innerHeight);
  let direction = 1;
  let completedPasses = 0;

  await new Promise((resolve) => {
    function step(now) {
      const elapsed = now - start;
      const phase = Math.min(1, (elapsed % durationMs) / durationMs);
      const eased = 0.5 - Math.cos(phase * Math.PI) / 2;
      scrollTo(0, direction > 0 ? maximum * eased : maximum * (1 - eased));
      if (elapsed >= durationMs * (completedPasses + 1)) {
        completedPasses += 1;
        direction *= -1;
      }
      if (completedPasses >= passes) {
        resolve();
      } else {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  });

  frameLoopActive = false;
  const filteredFrames = frames.filter((value) => value > 0 && value < 1000);
  const frameBudget = quantile(filteredFrames, 0.1) * 1.5 || 16.67;
  const longTaskTotal = longTasks.reduce((sum, entry) => sum + entry.duration, 0);
  return {
    turns,
    domNodes: document.getElementsByTagName("*").length,
    documentHeight: document.documentElement.scrollHeight,
    frames: filteredFrames.length,
    frameTime: {
      p50: quantile(filteredFrames, 0.5),
      p95: quantile(filteredFrames, 0.95),
      p99: quantile(filteredFrames, 0.99),
      max: Math.max(0, ...filteredFrames)
    },
    frameBudget,
    estimatedRefreshHz: frameBudget ? Math.round(1000 / (frameBudget / 1.5)) : null,
    droppedFrameRatio: filteredFrames.length
      ? filteredFrames.filter((value) => value > frameBudget).length / filteredFrames.length
      : 0,
    longTasks: { count: longTasks.length, totalMs: longTaskTotal, maxMs: Math.max(0, ...longTasks.map((entry) => entry.duration)) },
    observers: { ...observerCounts },
    memory: performance.memory ? {
      initialUsedJSHeapSize: initialHeap,
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize
    } : null,
    longView: collectLongView(),
    url: location.href
  };
}

render();
attachObservers();
startStress();
startStream();
targetSelect.addEventListener("change", () => document.getElementById(targetSelect.value)?.scrollIntoView({ block: "center" }));
runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  const result = await runScroll({ durationMs: 6000 });
  stats.textContent = JSON.stringify(result.frameTime);
  runButton.disabled = false;
});

window.__LONGVIEW_BENCHMARK__ = {
  ready: Promise.resolve({ turns }),
  runScroll,
  collectLongView,
  correctnessProbe,
  config: { turns, stream, stress, runDuration, seed }
};
