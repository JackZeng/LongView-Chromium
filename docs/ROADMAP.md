# LongView Chromium Roadmap

The roadmap is evidence-driven. A phase advances only after the previous phase has reproducible measurements.

## Phase 0 — Foundation

Goal: make the project reproducible before touching Chromium internals.

- Pin an upstream Chromium revision.
- Document macOS and Windows checkout/build procedures.
- Establish benchmark conventions and trace storage format.
- Add synthetic long-page fixtures.
- Add a ChatGPT-like dynamic conversation fixture that does not depend on a live third-party service.
- Define baseline metrics and acceptance criteria.

Exit criteria:

- A contributor can reproduce the same baseline on a supported machine.
- Benchmark outputs contain enough metadata to compare builds honestly.

## Phase 1 — Browser-level prototype

Goal: estimate the upper bound of gains from reducing off-screen rendering work before deep engine changes.

Experiments:

- segment discovery heuristics;
- `content-visibility: auto`;
- containment and intrinsic-size strategies;
- observer/media/animation handling where standards-compliant;
- viewport-distance based HOT/WARM/COLD policy in a prototype layer.

Exit criteria:

- Clear evidence identifying which rendering stages dominate each workload.
- A decision on whether Blink-native segment lifecycle work is justified.

## Phase 2 — Blink segment lifecycle

Goal: implement conservative engine-owned lifecycle management.

- Introduce internal segment metadata.
- Add HOT/WARM/COLD transitions.
- Coordinate style/layout/paint invalidation with segment state.
- Materialize for geometry queries, focus, selection, search, accessibility, screenshot, print, and mutation as required.
- Add anti-thrashing promotion policy.

Exit criteria:

- Significant improvement on long-page benchmarks.
- No known correctness regressions in the compatibility matrix.

## Phase 3 — Scheduler and compositor coordination

Goal: make viewport responsiveness robust under main-thread pressure.

- Predictive warm range based on scroll velocity/direction.
- Prioritize near-future raster/layout work.
- Reduce unnecessary background work during active scrolling where semantics allow.
- Instrument compositor/main-thread contention.

Exit criteria:

- Stable fast scrolling without persistent checkerboarding/blank regions.
- Improved p95/p99 interaction frame times under JavaScript load.

## Phase 4 — Compact cold-state experiments

Goal: reduce the retained memory cost of very large documents.

- Measure retained layout/paint/accessibility state by segment.
- Prototype geometry capsules.
- Selectively discard derived rendering state.
- Add precise materialization causes and telemetry.

Exit criteria:

- Material memory reduction on 1,000+ segment pages.
- Acceptable cold-to-visible materialization latency.

## Phase 5 — AI conversation optimization

Goal: handle very long AI chat applications as a flagship workload without hard-coding the engine around a single website.

- Build generic conversation-turn segmentation heuristics.
- Add a site-adapter layer only where necessary.
- Explore native historical reading surfaces for dormant conversation history.
- Test live streaming responses while the user scrolls history.

Exit criteria:

- Long conversations remain responsive as history grows.
- Active composer/streaming behavior stays correct.

## Phase 6 — Productization

- macOS/Windows distributable builds.
- Long-page diagnostics UI.
- Conservative default policy and experimental flags.
- Crash/compatibility testing.
- Upstreamability review of individual changes.
- Release process and signed artifacts.

## Explicitly deferred

- Android/iOS browser productization.
- General-purpose memory compression unrelated to long-page rendering.
- UI/branding work before the rendering architecture proves value.
