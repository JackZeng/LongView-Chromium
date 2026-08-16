# LongView Chromium

**A Chromium-based browser distribution for extremely long, dynamic web pages.**

LongView keeps the visible part of a page fully interactive while progressively reducing rendering work for content far outside the viewport. The first working release targets long AI conversations, documentation, logs, forums, feeds, notebooks, and rendered Markdown.

> Project status: **v0.1.0 developer MVP**. It is buildable from a pinned Chromium revision and includes a working LongView runtime, diagnostics, benchmarks, packaging tools, and an executable native lifecycle specification. Deep Blink layout-state eviction is the next engine phase, not a claim of this release.

## What works now

- Pinned Chromium stable baseline: **151.0.7922.77**, commit `ff37cfca210138f2a40b843b4a8195ab7e4fc7ff`.
- One-command checkout, sync, GN generation, build, launch, package, and benchmark CLI.
- Manifest V3 LongView runtime loaded into the Chromium distribution.
- ChatGPT, Claude, Gemini, and generic repeated-content discovery.
- HOT / WARM / COLD / PINNED segment lifecycle.
- Scroll-velocity prediction with asymmetric forward/backward warming.
- Binary range lookup, bounded warm-segment count, and no full-DOM scan on every scroll frame.
- Compatibility wakeups for focus, selection, find-in-page (`beforematch`), resize, streaming append, and DOM mutation.
- Conservative and opt-in aggressive modes.
- Live popup, settings, per-page controls, and diagnostics overlay.
- Deterministic 10–5000-turn conversation benchmark with code, tables, images, streaming, observers, remote mutations, and controlled long tasks.
- Baseline-vs-LongView Playwright runner and JSON result format.
- Dependency-free C++ lifecycle model with anti-thrashing tests, ready to be transplanted into Blink.

## First-principles model

```text
Viewport / immediate neighborhood    HOT      full rendering and interaction
Likely near-future viewport           WARM     prepared, reduced off-screen work
Far from viewport                     COLD     content-visibility skips rendering work
Focus/search/selection/API demand     PINNED   forced materialization for correctness
```

The target is not merely “lower memory” or “more GPU.” The target is:

```text
scrolling cost ≈ O(visible working set)
not
scrolling cost ≈ O(total document complexity)
```

## Quick start

Chromium is a large source tree. Use a machine with at least 16 GB RAM and roughly 120 GB of available storage; more is preferable.

```bash
# Check tools, platform, disk, and the pinned Chromium revision.
python3 tools/longview.py doctor

# Fetch depot_tools + Chromium and reset to the pinned stable commit.
python3 tools/longview.py fetch

# Build a fast incremental developer configuration.
python3 tools/longview.py build --profile longview-dev

# Launch the built browser with an isolated profile and LongView enabled.
python3 tools/longview.py run https://chatgpt.com/
```

Run the same binary without LongView for a controlled baseline:

```bash
python3 tools/longview.py run --baseline 'http://127.0.0.1:8000/'
```

See [docs/BUILDING.md](docs/BUILDING.md) for macOS, Windows, and Linux prerequisites and [docs/QUICKSTART.md](docs/QUICKSTART.md) for the shortest developer workflow.

## Benchmark

Install only the benchmark runner dependency:

```bash
cd benchmarks/runner
npm install
cd ../..
```

Then capture comparable runs from the same Chromium binary:

```bash
python3 tools/longview.py benchmark --baseline --turns 1000 --runs 5 --stress
python3 tools/longview.py benchmark            --turns 1000 --runs 5 --stress
node benchmarks/runner/compare.mjs benchmark-results/baseline.json benchmark-results/longview.json
```

Every result records the executable, fixture scale, platform, frame-time distribution, dropped-frame ratio, long tasks, DOM scale, layout shift, memory when available, and LongView state counts.

## Repository map

```text
chromium.version              Exact upstream Chromium tag and commit
configs/gn/                   Reproducible baseline/dev/release GN profiles
product/extension/            Working LongView browser runtime and UI
benchmarks/fixtures/          Deterministic pathological long-page workloads
benchmarks/runner/            Automated baseline-vs-LongView measurement
src/native/                   C++ working-set/lifecycle executable specification
tools/                        Checkout, build, run, package, validation, smoke test
docs/                         Architecture, compatibility, build, roadmap, ADRs
patches/                      Future small auditable Chromium-native patch series
```

## Validate this repository

```bash
python3 tools/validate_extension.py
npm run check:js
npm test
PYTHONPATH=tools python3 -m unittest discover -s tools/tests -v
cmake -S src/native -B build/native
cmake --build build/native
ctest --test-dir build/native --output-on-failure
```

A real-browser smoke check is also included:

```bash
xvfb-run -a node tools/smoke_chromium.mjs --executable /path/to/chromium --turns 200
```

## Architectural boundary of v0.1

This release deliberately uses Chromium's existing `content-visibility` machinery rather than pretending that a full LayoutNG cold-tree eviction system already exists. It materially reduces style/layout/paint/raster work for suitable off-screen segments, but it does **not** yet remove site-owned DOM, JavaScript objects, or every retained layout/accessibility structure.

The next native milestone moves the tested lifecycle policy into Blink, adds engine-owned eligibility and diagnostics, and measures which retained structures still scale with total page length. See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## License

LongView-specific code is BSD 3-Clause. Chromium and all third-party components keep their original licenses.
