# LongView benchmarks

The benchmark suite produces deterministic long-page workloads without depending on a live AI product or network service.

## Conversation fixture

`fixtures/conversation` generates 10–5000 synthetic user/assistant turns. A turn can include paragraphs, code blocks, tables, image placeholders and toolbars. Optional stress modes add:

- continuous append/streaming;
- IntersectionObserver and ResizeObserver load;
- bounded JavaScript long tasks;
- distant DOM mutations;
- focus, selection, anchor, `scrollIntoView` and geometry correctness probes.

Open it manually with any static HTTP server:

```bash
python3 -m http.server 8000 --directory benchmarks/fixtures/conversation
```

Then visit:

```text
http://127.0.0.1:8000/?turns=1000&stream=1&stress=1
```

## Automated runner

Install the single runner dependency:

```bash
cd benchmarks/runner
npm install
```

Run baseline and LongView using the same executable, viewport, fixture seed and duration:

```bash
node benchmarks/runner/runner.mjs \
  --executable /path/to/chromium \
  --turns 1000 --runs 5 --duration 9000 --stress \
  --output benchmark-results/baseline.json

xvfb-run -a node benchmarks/runner/runner.mjs \
  --executable /path/to/chromium \
  --turns 1000 --runs 5 --duration 9000 --stress --longview \
  --output benchmark-results/longview.json

node benchmarks/runner/compare.mjs \
  benchmark-results/baseline.json \
  benchmark-results/longview.json
```

LongView mode deliberately uses a headed browser because extension behavior and compositor timing should match a normal desktop session. On Linux without a display, wrap the command in `xvfb-run`.

## Measurement contract

Each run captures frame p50/p95/p99/max, estimated refresh interval, dropped-frame ratio, long-task count/time, layout shift, DOM scale, JS heap when available, LongView state counts and correctness results. Initialization work is excluded from the measured scroll interval.

See `docs/BENCHMARKS.md` for experimental controls and reporting requirements.
