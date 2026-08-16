# LongView Chromium roadmap

## Phase 0 — foundation — complete

- establish repository and engineering principles;
- pin an exact stable Chromium revision;
- define benchmark and compatibility contracts;
- create build profiles and cross-platform bootstrap tooling.

## Phase 1 — working browser MVP — complete in v0.1

- load LongView into a Chromium build;
- discover site-specific and generic long-page segments;
- implement HOT/WARM/COLD/PINNED lifecycle;
- predict scroll direction and velocity;
- preserve focus, selection, find, geometry, and dynamic-content behavior;
- expose controls and diagnostics;
- provide developer packaging.

## Phase 2 — evidence campaign — next

- run baseline and LongView on representative Apple Silicon Macs and Windows PCs;
- collect 100/500/1000/2000-turn scaling curves;
- separate main-thread, style, layout, paint, raster, GC, memory, and accessibility costs;
- tune segment granularity, intrinsic-size policy, warm distance, and hysteresis;
- publish reproducible result bundles and Perfetto traces.

Exit criterion: demonstrate where v0.1 changes the scaling curve and identify the largest remaining total-document cost.

## Phase 3 — Blink-native lifecycle

- add engine-owned `LongPageSegment` eligibility and lifecycle behind a disabled-by-default feature flag;
- move materialization reasons and anti-thrashing policy into Blink;
- add UMA/tracing diagnostics for transitions and forced materialization;
- integrate style/layout/paint invalidation boundaries conservatively;
- add web tests for all compatibility operations.

Exit criterion: native prototype beats the extension runtime on retained work without breaking the compatibility suite.

## Phase 4 — scheduler and compositor coordination

- give viewport and predicted raster work priority during active scroll;
- bound background observer/task work when semantics allow;
- maintain virtual segment geometry in compositor-visible state;
- quantify and prevent blanking/checkerboarding.

## Phase 5 — geometry capsule experiment

Only after measurement:

- retain block size, offset, anchors, text/search index, and style generation for a cold segment;
- release selected derived layout/paint state;
- materialize on geometry, focus, selection, find, accessibility, screenshot, print, and mutation demand;
- prevent materialization thrash.

## Phase 6 — native history layer for pathological apps

For applications where the framework itself remains the bottleneck:

- browser-managed read-only history representation;
- virtualized text/code/table rendering;
- exact handoff to the live site for edit/regenerate/action operations;
- explicit per-site integration rather than silent DOM deletion.

## Phase 7 — release engineering

- product branding and first-run experience;
- signed/notarized macOS builds;
- signed Windows installer;
- updater and security patch cadence;
- crash reporting and privacy review;
- reproducible release manifest and SBOM.
