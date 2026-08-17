# Implementation status

## Delivered in v0.3.0

### Working browser and evidence

- pinned native Chromium build/run/package workflow;
- ChatGPT, Claude, Gemini, explicit-root, and generic adapters;
- HOT/WARM/COLD/PINNED runtime using Chromium `content-visibility`;
- focus, selection, find, print, streaming, resize, and mutation handling;
- deterministic 10–5000-turn fixtures;
- dependency-free CDP driver, metrics, traces, scaling analysis, and gates;
- stable pinned-browser inline smoke matrix on GitHub-hosted CI.

### Engine lifecycle contract

- C++20 `LongPageController`;
- Geometry Capsules with block geometry, generations, anchors, and text digest;
- pluggable `ColdBackend` freeze/thaw interface;
- `BlinkColdBackend` adapter through an explicit derived-state delegate;
- HOT/WARM/COLD/PINNED transitions;
- velocity prediction, WARM bounds, hysteresis, and anti-thrashing;
- correctness-driven pinning and explicit materialization reasons;
- work-priority contract for input, raster-soon, normal, background, and suspended tasks;
- standalone CMake/CTest validation on Linux, macOS, and Windows;
- Chromium GN targets for policy, engine, bridge, and Blink feature probes.

### Phase 7 release engineering

- deterministic portable ZIP creation;
- canonical update manifests and channel feeds;
- SHA-256 and optional OpenSSL signatures;
- HTTPS-only artifact staging and deterministic rollout buckets;
- safe extraction, atomic installation, health checks, and rollback;
- CycloneDX 1.5 SBOM generation;
- platform packaging scripts with optional macOS codesign/notarization and Windows Authenticode;
- daily Chromium Stable pin watcher;
- self-hosted controlled-evidence and release-candidate workflows;
- privacy, accessibility, crash-reporting, security-update, and release contracts;
- static public status/evidence dashboard and GitHub Pages workflow.

## Explicitly not yet claimed

- real Blink LayoutObject or paint-property eviction;
- a production Blink delegate that releases derived state;
- compact native accessibility state;
- compositor placeholder layers;
- native compatibility coverage for every geometry/focus/find/selection/print/screenshot edge case;
- controlled physical-machine performance evidence already published;
- signed/notarized stable macOS and Windows artifacts;
- an enabled public update channel;
- an operating crash-upload service;
- automatic stable promotion.

## Architectural boundary

`src/engine` is the reviewable lifecycle and retained-state contract. `BlinkColdBackend` deliberately delegates the actual release/restore operation to a Blink-owned implementation. This prevents the policy layer from depending on Blink object lifetimes and makes it possible to test invariants without a multi-hour Chromium build.

The production feature remains disabled by default. Stable promotion requires the full checklist in `docs/PHASE7_ACCEPTANCE.md`; a passing engine contract alone is not sufficient.

## External verification still required

1. Run the complete native probes on the exact pin on physical Apple Silicon and Windows hosts.
2. Implement and validate the Blink derived-state delegate.
3. Run native compatibility tests for geometry, focus, selection, anchors, accessibility, screenshot, print, and mutation.
4. Publish controlled 100/500/1000/2000-turn evidence and 2000-turn traces.
5. Supply Apple notarization and Windows signing credentials.
6. Publish signed artifacts, SBOM, release manifest, and rollback-tested updater feed.
