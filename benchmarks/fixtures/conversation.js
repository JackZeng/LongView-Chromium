'use strict';

const conversation = document.querySelector('#conversation');
const status = document.querySelector('#status');
const turnSelect = document.querySelector('#turns');
const resultPanel = document.querySelector('#result');
const resultPre = resultPanel.querySelector('pre');
const params = new URLSearchParams(location.search);
let currentTurns = Math.max(10, Math.min(5000, Number(params.get('turns')) || 1000));
let streamingTimer = null;
turnSelect.value = String(currentTurns);

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function paragraph(index, paragraphIndex, random) {
  const topics = ['rendering pipeline', 'long conversations', 'layout containment', 'scroll prediction', 'memory pressure', 'accessibility tree', 'raster tiles', 'JavaScript scheduling'];
  const topic = topics[Math.floor(random() * topics.length)];
  return `Turn ${index + 1}, paragraph ${paragraphIndex + 1}: this deterministic synthetic text discusses ${topic}. ` +
    'The content deliberately contains enough inline nodes, emphasis, links, and punctuation to resemble a substantial Markdown response while remaining fully local and reproducible.';
}

function makeToolbar() {
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  for (const label of ['Copy', 'Like', 'Read']) {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = label;
    button.textContent = label[0];
    toolbar.append(button);
  }
  return toolbar;
}

function makeTurn(index, random) {
  const role = index % 2 ? 'assistant' : 'user';
  const article = document.createElement('article');
  article.className = `turn ${role}`;
  article.dataset.longviewSegment = '';
  article.dataset.messageAuthorRole = role;
  article.id = `turn-${index + 1}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'assistant' ? 'AI' : 'U';

  const body = document.createElement('div');
  const head = document.createElement('div');
  head.className = 'turn-head';
  const name = document.createElement('strong');
  name.textContent = role === 'assistant' ? 'LongView Assistant' : 'Benchmark User';
  const meta = document.createElement('span');
  meta.textContent = `#${index + 1}`;
  head.append(name, meta);
  body.append(head);

  const count = role === 'assistant' ? 3 + Math.floor(random() * 4) : 1 + Math.floor(random() * 2);
  for (let p = 0; p < count; p += 1) {
    const node = document.createElement('p');
    node.textContent = paragraph(index, p, random);
    body.append(node);
  }

  if (role === 'assistant' && index % 18 === 1) {
    const code = document.createElement('pre');
    code.textContent = `function classifySegment(top, bottom, viewport) {\n  return bottom < viewport.start ? 'cold' : top > viewport.end ? 'warm' : 'hot';\n}\n// deterministic fixture ${index + 1}`;
    body.append(code);
  }

  if (role === 'assistant' && index % 30 === 3) {
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>State</th><th>Work</th><th>Distance</th></tr></thead><tbody><tr><td>HOT</td><td>Full</td><td>Near</td></tr><tr><td>WARM</td><td>Reduced</td><td>Predicted</td></tr><tr><td>COLD</td><td>Skipped</td><td>Far</td></tr></tbody>';
    body.append(table);
  }

  if (role === 'assistant' && index % 80 === 5) {
    const image = document.createElement('div');
    image.className = 'fake-image';
    image.setAttribute('role', 'img');
    image.setAttribute('aria-label', 'Synthetic gradient image');
    body.append(image);
  }

  body.append(makeToolbar());
  article.append(avatar, body);
  return article;
}

async function generate(turns = currentTurns) {
  stopStreaming();
  currentTurns = turns;
  status.textContent = `Generating ${turns.toLocaleString()} turns…`;
  conversation.replaceChildren();
  const random = seededRandom(Number(params.get('seed')) || 42);
  const batchSize = 100;

  for (let start = 0; start < turns; start += batchSize) {
    const fragment = document.createDocumentFragment();
    for (let index = start; index < Math.min(turns, start + batchSize); index += 1) {
      fragment.append(makeTurn(index, random));
    }
    conversation.append(fragment);
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  status.textContent = `${turns.toLocaleString()} turns · ${document.getElementsByTagName('*').length.toLocaleString()} DOM nodes`;
  window.scrollTo(0, 0);
  window.__LONGVIEW_BENCHMARK_READY__ = true;
}

function startStreaming() {
  stopStreaming();
  let target = [...conversation.querySelectorAll('.assistant')].at(-1)?.querySelector('p:last-of-type');
  if (!target) return;
  let token = 0;
  streamingTimer = setInterval(() => {
    const span = document.createElement('span');
    span.textContent = ` stream-${token++}`;
    target.append(span);
    if (token >= 240) stopStreaming();
  }, 24);
}

function stopStreaming() {
  if (streamingTimer) clearInterval(streamingTimer);
  streamingTimer = null;
}

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1)];
}

async function run(options = {}) {
  const durationMs = Number(options.durationMs) || 12000;
  const scrollStep = Number(options.scrollStep) || 760;
  const pauseMs = Number(options.pauseMs) || 16;
  const frameIntervals = [];
  let lastFrame = performance.now();
  let frameHandle;
  let monitoring = true;
  const monitor = (now) => {
    if (!monitoring) return;
    const interval = now - lastFrame;
    lastFrame = now;
    if (interval > 0 && interval < 1000) frameIntervals.push(interval);
    frameHandle = requestAnimationFrame(monitor);
  };
  frameHandle = requestAnimationFrame(monitor);

  if (options.streaming) startStreaming();
  const started = performance.now();
  let direction = 1;
  let steps = 0;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);

  while (performance.now() - started < durationMs) {
    let next = scrollY + direction * scrollStep;
    if (next >= maxScroll) { next = maxScroll; direction = -1; }
    if (next <= 0) { next = 0; direction = 1; }
    scrollTo(0, next);
    steps += 1;
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }

  monitoring = false;
  cancelAnimationFrame(frameHandle);
  stopStreaming();

  const geometryProbe = document.querySelector(`#turn-${Math.max(1, Math.floor(currentTurns * .82))}`)?.getBoundingClientRect();
  const expectedFrame = 1000 / 60;
  const longFrames = frameIntervals.filter((value) => value > expectedFrame * 1.5);
  const elapsed = performance.now() - started;
  const averageInterval = frameIntervals.length ? frameIntervals.reduce((sum, value) => sum + value, 0) / frameIntervals.length : 0;
  const output = {
    turns: currentTurns,
    steps,
    frames: frameIntervals.length,
    frameP50Ms: Number(percentile(frameIntervals, 50).toFixed(3)),
    frameP95Ms: Number(percentile(frameIntervals, 95).toFixed(3)),
    frameP99Ms: Number(percentile(frameIntervals, 99).toFixed(3)),
    longFrameRatio: Number((frameIntervals.length ? longFrames.length / frameIntervals.length : 0).toFixed(5)),
    averageFps: Number((averageInterval ? Math.min(240, 1000 / averageInterval) : 0).toFixed(2)),
    scrollDurationMs: Number(elapsed.toFixed(2)),
    domNodes: document.getElementsByTagName('*').length,
    documentHeight: document.documentElement.scrollHeight,
    jsHeapUsed: performance.memory?.usedJSHeapSize || null,
    geometryProbe: geometryProbe ? { top: geometryProbe.top, height: geometryProbe.height } : null
  };
  return output;
}

document.querySelector('#regenerate').addEventListener('click', () => generate(Number(turnSelect.value)));
document.querySelector('#run').addEventListener('click', async () => {
  status.textContent = 'Running scroll test…';
  const output = await run({ durationMs: 10000, streaming: true });
  resultPre.textContent = JSON.stringify(output, null, 2);
  resultPanel.hidden = false;
  status.textContent = `${currentTurns.toLocaleString()} turns · test complete`;
});

window.__LONGVIEW_BENCHMARK__ = Object.freeze({ generate, run, startStreaming, stopStreaming });
generate(currentTurns);
