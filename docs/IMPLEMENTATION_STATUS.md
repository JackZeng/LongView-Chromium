# Implementation status

## Delivered in v0.2

### Native Chromium workflow

- exact Chromium 151.0.7922.77 pin and commit;
- depot_tools checkout/synchronization;
- baseline, dev, and release GN profiles;
- native Chromium build/run/package commands;
- overlay and pinned Blink patch installers;
- one-command native policy + Blink feature probe build/run;
- persistent self-hosted macOS/Windows probe workflow.

### Browser runtime

- ChatGPT, Claude, Gemini, explicit-root, and generic adapters;
- HOT/WARM/COLD/PINNED lifecycle;
- scroll-velocity prediction;
- asymmetric warming;
- ordered segment range lookup;
- focus/selection pinning;
- find, copy, print, and beforematch materialization;
- mutation/resize rescanning;
- popup, settings, diagnostics overlay.

### Evidence

- deterministic 10–5000 turn fixture;
- streaming, observers, code, tables, images, and distant mutation;
- dependency-free CDP driver;
- performance metrics, DOM counters, and trace capture;
- baseline/LongView campaign matrices;
- scaling exponent analysis;
- JSON/CSV/Markdown output;
- correctness and regression gates;
- GitHub browser smoke workflow.

### Native policy model

- conservative eligibility decisions;
- exclusion reasons;
- direction/speed working set calculation;
- HOT/WARM demotion hysteresis;
- materialization reason telemetry;
- anti-thrashing pinning;
- ordered segment index;
- Chromium-installable `//longview:segment_policy_test` target;
- candidate `blink::features::kLongViewSegmentLifecycle` gate, disabled by default.

## Not delivered

The following are not claimed:

- a compiled full Chromium application artifact in this repository;
- signed/notarized macOS or Windows packages;
- cold LayoutObject destruction;
- paint property or display-item eviction;
- compositor placeholder layers;
- compact accessibility representation;
- Geometry Capsules;
- native segment discovery in Blink;
- correct handling of all web-platform edge cases;
- automatic Chromium security updates.

## Current boundary

The extension/runtime is a useful product prototype and experiment driver. The native model and overlay are a policy specification plus an integration probe. Patch 0001 is observability scaffolding only.

The next Chromium patch is allowed to add document-scoped candidate discovery and trace events. It is not allowed to alter rendering behavior until native web tests cover the compatibility matrix.

## Required external verification

Before declaring a native milestone complete:

1. Run `python3 tools/longview.py native-probe --force` on macOS and Windows against the exact pin.
2. Run the evidence campaign on representative 60 Hz and 120 Hz systems.
3. Capture traces at 2000 turns.
4. Record GPU, display refresh, power mode, Chromium commit, and LongView commit.
5. Run native web tests for geometry, focus, selection, anchors, accessibility, print, screenshot, and distant mutation.
