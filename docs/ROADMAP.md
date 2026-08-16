# Roadmap

## Phase 0 — reproducible baseline

- [x] pin Chromium;
- [x] document checkout/build workflow;
- [x] deterministic long-conversation fixture;
- [x] source validation across Linux, macOS, and Windows;
- [ ] record full native macOS/Windows baseline evidence on controlled hardware.

## Phase 1 — runnable working-set prototype

- [x] native Chromium launch path;
- [x] Manifest V3 runtime;
- [x] explicit and site-specific adapters;
- [x] HOT/WARM/COLD/PINNED lifecycle;
- [x] focus/selection/find/print materialization hooks;
- [x] diagnostics and controls;
- [x] deterministic benchmark automation.

## Phase 2 — evidence and policy hardening

- [x] dependency-free CDP metrics/trace driver;
- [x] 100/500/1000/2000 scale campaign;
- [x] scaling exponent analysis;
- [x] correctness and regression gates;
- [x] conservative native eligibility policy;
- [x] demotion hysteresis and anti-thrashing;
- [x] installable Chromium policy target;
- [x] disabled-by-default Blink feature candidate;
- [ ] collect controlled macOS/Windows evidence artifacts.

## Phase 3 — native observability

- [ ] compile patch 0001 on the exact pin across macOS and Windows;
- [ ] document-scoped LongPageController;
- [ ] conservative candidate discovery only;
- [ ] trace/UMA for counts, transitions, eligibility, and faults;
- [ ] native web tests for geometry, focus, selection, anchors, accessibility, screenshot, print, and mutation;
- [ ] no rendering behavior change in the first observability patch.

## Phase 4 — display-lock backed cold experiment

- [ ] connect eligible segments to existing Blink display-lock/content-visibility state;
- [ ] materialize before observable operations;
- [ ] preserve scroll geometry and identity;
- [ ] pin thrashing segments;
- [ ] measure style/layout/paint/raster and blanking;
- [ ] default feature remains off.

## Phase 5 — scheduler/compositor coordination

Only if traces prove it is needed:

- [ ] velocity-aware warm range owned jointly with scheduler/compositor;
- [ ] raster priority for predicted viewport;
- [ ] cold observer and background work deprioritization;
- [ ] checkerboard and input-latency guardrails.

## Phase 6 — compact retained state

Only if retained layout state remains a measured limit:

- [ ] geometry capsule prototype;
- [ ] text/anchor/find index;
- [ ] compact accessibility representation;
- [ ] compositor placeholder geometry;
- [ ] memory scaling evidence.

## Phase 7 — product release

- [ ] signed/notarized macOS and Windows packages;
- [ ] update channel following supported Chromium security versions;
- [ ] crash reporting, rollback, privacy, and accessibility review;
- [ ] public benchmark corpus and evidence dashboard.
