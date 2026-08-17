# Roadmap

## Phase 0 — reproducible baseline

- [x] pin Chromium to an exact stable revision;
- [x] document checkout/build workflow;
- [x] deterministic long-conversation fixtures;
- [x] source validation across Linux, macOS, and Windows;
- [ ] publish controlled physical macOS/Windows baseline bundles.

## Phase 1 — runnable working-set prototype

- [x] native Chromium launch path;
- [x] Manifest V3 runtime;
- [x] explicit and site-specific adapters;
- [x] HOT/WARM/COLD/PINNED lifecycle;
- [x] focus, selection, find, print, streaming, resize, and mutation handling;
- [x] controls, diagnostics, and deterministic benchmark automation.

## Phase 2 — evidence and policy hardening

- [x] dependency-free CDP metrics and trace driver;
- [x] 100/500/1000/2000-turn campaign;
- [x] scaling-exponent analysis;
- [x] correctness and regression gates;
- [x] conservative native eligibility, hysteresis, indexing, and anti-thrashing;
- [x] pinned Chrome-for-Testing smoke matrix with artifact output;
- [ ] publish controlled physical macOS/Windows result bundles.

## Phase 3 — native lifecycle controller

- [x] disabled-by-default Blink feature gate;
- [x] dependency-free document-controller contract;
- [x] explicit materialization reasons;
- [x] transition and released-byte statistics;
- [x] Chromium GN targets for engine and bridge probes;
- [ ] connect a real document-scoped owner in Blink;
- [ ] add native web tests and Perfetto/UMA events in the pinned source tree.

## Phase 4 — display-lock-backed cold state

- [x] cold-backend interface and Blink adapter contract;
- [x] freeze/thaw accounting and failure behavior;
- [x] correctness pins for focus, selection, accessibility, editability, media, and overlays;
- [ ] implement the Blink delegate using display lock and rendering lifecycle primitives;
- [ ] prove geometry/identity preservation and no blanking in full builds.

## Phase 5 — scheduler and compositor coordination

- [x] velocity-aware predicted viewport contract;
- [x] bounded WARM set and work-priority contract;
- [x] HOT/PINNED input-critical and WARM raster-soon priorities;
- [ ] connect priorities to Blink scheduler, raster, and compositor ownership;
- [ ] establish checkerboard and input-latency guardrails from traces.

## Phase 6 — compact retained state

- [x] Geometry Capsule data model;
- [x] block geometry, style/content generations, anchors, and text digest;
- [x] mutation invalidation and demand materialization contract;
- [ ] replace estimated released bytes with real retained-state measurement;
- [ ] implement compact accessibility and compositor placeholder representations;
- [ ] prove sublinear memory scaling at 1000/2000/5000 turns.

## Phase 7 — product release

- [x] deterministic portable packaging;
- [x] release manifest, signed feed, staged rollout, updater, health check, and rollback tooling;
- [x] CycloneDX SBOM generation;
- [x] macOS signing/notarization and Windows signing entrypoints;
- [x] security-pin watcher and documented Chromium update cadence;
- [x] privacy, accessibility, rollback, and crash-reporting contracts;
- [x] static public status/evidence dashboard and Pages workflow;
- [x] self-hosted physical evidence and release-candidate workflows;
- [ ] install external Apple and Windows signing credentials;
- [ ] publish signed/notarized stable artifacts;
- [ ] enable GitHub Pages in repository settings;
- [ ] configure an opt-in crash service after privacy review;
- [ ] promote to stable only after every acceptance gate passes.
