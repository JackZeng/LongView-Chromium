# LongView Chromium

**A Chromium-based browser focused on making extremely long, dynamic web pages stay fast.**

LongView Chromium explores a browser-engine approach to long-page performance: keep the visible region fully interactive, progressively reduce work for off-screen regions, and materialize cold regions only when they are needed.

The initial target is pathological long-page workloads such as very long AI conversations, documentation, logs, feeds, forums, notebooks, and large rendered Markdown documents.

## Core idea

Treat an extremely long page more like virtual memory than one permanently-live render tree.

```text
Viewport               HOT   — fully interactive
Near viewport          WARM  — prepared / reduced work
Far from viewport      COLD  — compact retained state
On-demand access              — materialize and restore
```

The long-term goal is for scrolling cost to scale primarily with **visible complexity**, not total document complexity.

## Project status

**Phase 0 — repository bootstrap and measurement.**

We intentionally start with reproducible benchmarks, instrumentation, and conservative Chromium primitives before attempting invasive Blink/LayoutNG changes.

## Initial technical direction

1. Build reproducible pathological long-page benchmarks.
2. Measure frame time, main-thread work, style/layout/paint/raster cost, memory, and long tasks.
3. Prototype page segmentation and off-screen freezing using existing Chromium/Blink mechanisms.
4. Introduce HOT / WARM / COLD segment lifecycle management inside Blink.
5. Add predictive warming based on scroll velocity and direction.
6. Explore compact geometry capsules for cold segments.
7. Add site adapters only where generic engine-level optimization is insufficient.

## Repository layout

```text
docs/          Architecture, roadmap, development notes, ADRs
benchmarks/    Long-page benchmark fixtures and measurement tooling
tools/         Developer and performance-analysis tools
patches/       Chromium patch-series notes / downstream integration helpers
src/           LongView-specific prototypes before final Chromium placement
```

## Engineering principles

- Preserve web compatibility by default.
- Prefer general engine-level solutions over site-specific hacks.
- Never claim an optimization without a reproducible benchmark.
- Keep scrolling responsive even when page JavaScript is busy whenever web semantics allow it.
- Make aggressive behavior opt-in until compatibility is proven.
- Keep the delta from upstream Chromium small, reviewable, and maintainable.

## Target platforms

Initial development targets:

- macOS
- Windows

Linux may be used for CI, benchmark infrastructure, and development tooling where appropriate.

## Upstream strategy

Chromium source is **not vendored into this repository at bootstrap**. LongView will track an explicit Chromium upstream revision and maintain a small, auditable integration/patch layer. See `docs/adr/0001-upstream-strategy.md`.

## Current milestone

The first milestone is not “build a new browser UI.” It is to prove, with measurements, that long-page scrolling cost can be made substantially less dependent on total page length without breaking web behavior.

See `docs/ROADMAP.md` and `docs/BENCHMARKS.md`.

## License

LongView-specific code is released under the BSD 3-Clause License unless a file states otherwise. Chromium and third-party components retain their original licenses.
