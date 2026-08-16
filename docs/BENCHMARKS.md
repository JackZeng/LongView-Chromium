# Benchmark specification

## Purpose

Long-page optimization can trade one problem for another: lower paint cost but more blanking, smoother animation but broken focus, lower main-thread time but higher memory, or a synthetic win that disappears on streaming pages. The benchmark therefore measures performance and correctness together.

## Fixture

`benchmarks/fixtures/conversation` generates a deterministic AI-conversation-like page from URL parameters.

### Scale

```text
turns=100
turns=500
turns=1000
turns=2000
turns=5000 (capacity/stress only)
```

### Content mix

- user and assistant articles;
- multiple paragraphs;
- syntax-like code blocks;
- tables;
- image placeholders;
- tool buttons;
- stable test IDs and message roles.

### Dynamic modes

- `stream=1`: append a new turn on a fixed interval;
- `stress=1`: install observers, perform bounded long tasks, and mutate distant content;
- configurable seed and scroll duration.

## In-page measurements

The fixture records:

- requestAnimationFrame intervals;
- p50, p95, p99, and maximum frame interval;
- ratio of frames exceeding 1.5 × the nominal 60 Hz budget;
- long-task count and total duration;
- cumulative layout shift excluding recent input;
- DOM node count;
- document scroll height;
- JS heap values when Chromium exposes `performance.memory`;
- LongView state counts.

## Correctness probe

Before a measured run, the runner selects a middle turn and checks:

- text is present;
- geometry values are finite;
- `scrollIntoView()` can navigate to the target;
- target identity remains stable.

The full compatibility campaign must additionally cover native find-in-page, keyboard focus order, cross-segment copy, anchors, accessibility traversal, screenshots, and print.

## Automated runner

Install:

```bash
cd benchmarks/runner
npm install
```

Baseline:

```bash
node runner.mjs \
  --executable /path/to/chromium \
  --turns 1000 \
  --runs 5 \
  --duration 9000 \
  --stress \
  --output ../../benchmark-results/baseline-1000.json
```

LongView:

```bash
node runner.mjs \
  --executable /path/to/the-same/chromium \
  --turns 1000 \
  --runs 5 \
  --duration 9000 \
  --stress \
  --longview \
  --output ../../benchmark-results/longview-1000.json
```

Compare:

```bash
node compare.mjs ../../benchmark-results/baseline-1000.json ../../benchmark-results/longview-1000.json
```

The `tools/longview.py benchmark` command wraps the same runner and selects the locally built executable.

## Measurement discipline

Record for every publishable run:

- exact Chromium and LongView commits;
- GN args and browser flags;
- OS and patch level;
- CPU, RAM, GPU;
- display refresh rate and scaling;
- AC/battery and power mode;
- thermal state where relevant;
- fixture URL parameters;
- viewport dimensions;
- warmup count and measured run count;
- whether DevTools was open;
- whether the browser profile was fresh.

Use the same binary and hardware for baseline and LongView. Randomize or alternate run order to reduce thermal and cache bias.

## Primary success criterion

The key graph plots page scale on the x-axis and p95/p99 frame time, dropped-frame ratio, active main-thread time, and memory on the y-axis.

LongView succeeds when the performance curves grow substantially more slowly from 100 to 2000 turns while correctness remains intact. A one-point win at a single page size is insufficient.

## Expected initial interpretation

- If paint/raster/layout improve but memory remains linear, `content-visibility` is working and retained DOM/JS/layout structures become the next target.
- If little changes, site JavaScript or observers may dominate.
- If fast jumps blank, the warm window or raster scheduling is insufficient.
- If geometry/layout shift regresses, intrinsic-size tracking is insufficient.
- If repeated script geometry reads cause spikes, native materialization/thrash policy becomes justified.
