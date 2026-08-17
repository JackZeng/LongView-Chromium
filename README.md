# LongView Chromium

**A native Chromium distribution and rendering-lifecycle project for extremely long, dynamic web pages.**

LongView's goal is to make scrolling and interaction cost follow the visible working set rather than total document complexity. Its first workloads are long AI conversations, documentation, logs, notebooks, forums, feeds, and large rendered Markdown pages.

## Status: v0.3.0 Phase 7 release-candidate infrastructure

LongView is built from a pinned Chromium checkout; it is not an Electron shell. The repository now contains three layers:

1. a working Manifest V3 runtime that applies HOT/WARM/COLD/PINNED behavior to real pages using Chromium's existing `content-visibility` machinery;
2. a dependency-free C++20 engine contract covering segment lifecycle, Geometry Capsules, cold-backend behavior, materialization, anti-thrashing, and work priorities;
3. release engineering for deterministic packages, signed update manifests, staged rollout, atomic installation and rollback, SBOM generation, platform-signing entrypoints, security-pin monitoring, and a public status dashboard.

The v0.3 engine contract is deliberately separated from Blink through `ColdBackend`. `BlinkColdBackend` is the integration seam through which a document-scoped Blink owner can release and restore derived layout, paint, raster, and accessibility state. The interface and tests exist; full Blink derived-state release is still guarded by the disabled-by-default feature flag and must be validated in complete pinned Chromium builds before it can be enabled.

## Core model

```text
Viewport and active interaction       HOT / PINNED
Likely near-future viewport            WARM
Far from the active working set        COLD
Observable API or user access          materialize, record reason, prevent thrash
```

The target invariant is:

```text
scrolling cost ≈ O(active working set)
not
scrolling cost ≈ O(total document complexity)
```

## Pinned Chromium

```text
Version  151.0.7922.77
Commit   ff37cfca210138f2a40b843b4a8195ab7e4fc7ff
Channel  stable
```

Every baseline/LongView comparison must use the same executable and exact upstream revision.

## Build and run

A Chromium development checkout normally needs at least 120 GiB of free storage.

```bash
python3 tools/longview.py doctor
python3 tools/longview.py fetch
python3 tools/longview.py build --profile longview-dev
python3 tools/longview.py run https://chatgpt.com/
```

Run an identical baseline without LongView:

```bash
python3 tools/longview.py run --baseline https://chatgpt.com/
```

## Engine and Chromium probes

The engine contract can be tested without a full Chromium checkout:

```bash
cmake -S src/engine -B build/engine -DCMAKE_BUILD_TYPE=Release
cmake --build build/engine --parallel 2
ctest --test-dir build/engine --output-on-failure
```

With the pinned Chromium checkout available, install the overlay and compile the Chromium-native probes:

```bash
python3 tools/longview.py native-probe --force
```

The native probe builds:

```text
//longview:segment_policy_test
//longview:engine_contract_test
//longview:blink_bridge_test
//longview:blink_feature_probe
```

The Blink feature remains disabled by default.

## Evidence campaign

The dependency-free CDP runner records frame-time distributions, long tasks, DOM scale, heap use, style/layout/script/task work, LongView states, correctness probes, and optional Perfetto-compatible Chromium traces.

```bash
python3 tools/longview.py evidence \
  --turns 100,500,1000,2000 \
  --runs 5 \
  --duration 9000 \
  --stress \
  --stream \
  --trace \
  --output-dir benchmark-results/mac-m4
```

GitHub-hosted smoke tests use an inline deterministic fixture. Publishable performance evidence still requires controlled physical Apple Silicon and Windows machines, stable power/display settings, and the same pinned executable for both variants.

## Release engineering

Validate Phase 7 tooling:

```bash
PYTHONPATH=tools/release python3 -m unittest discover -s tools/release -p 'test_*.py' -v
python3 tools/release/generate_sbom.py --version "$(cat VERSION)" --output build/longview.cdx.json
```

The repository provides:

- deterministic portable ZIP packaging;
- canonical release manifests and channel feeds;
- SHA-256 and optional OpenSSL signatures;
- deterministic staged rollouts;
- HTTPS-only updater downloads;
- safe archive extraction;
- atomic install, health check, and rollback;
- macOS codesign/notarization and Windows Authenticode entrypoints;
- Chromium Stable pin monitoring;
- CycloneDX SBOM generation;
- privacy, accessibility, crash-reporting, and security-update contracts;
- a static release/evidence dashboard.

Unsigned developer packages can be produced without credentials. Stable public packages remain blocked until Apple notarization and Windows signing credentials are supplied and controlled native evidence passes.

## Repository map

```text
chromium.version              exact upstream Chromium tag and commit
product/extension/            working long-page runtime and controls
benchmarks/                   deterministic fixtures, CDP evidence, reports, gates
src/native/                   v0.2 lifecycle/policy model
src/engine/                   v0.3 controller, capsule, cold backend, scheduler contract
chromium_overlay/             Chromium GN targets and Blink integration bridge
release/                      platform packaging and update-channel definitions
tools/release/                updater, rollback, manifest, package, SBOM utilities
site/                         public release/evidence status dashboard
docs/                         architecture, privacy, security, accessibility, acceptance
```

## Current release boundary

v0.3.0 is a source and release-engineering milestone, not a claim that every Phase 7 production gate is already satisfied. The remaining hard gates are explicit in `docs/PHASE7_ACCEPTANCE.md`:

- real Blink derived-state release in full Chromium builds;
- native web-platform compatibility tests;
- controlled physical Mac and Windows evidence bundles;
- signed/notarized public artifacts;
- enabled GitHub Pages deployment;
- an opt-in crash upload service after privacy review.

## License

LongView-specific code is BSD 3-Clause. Chromium and third-party components retain their original licenses.
