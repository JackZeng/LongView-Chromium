# LongView Chromium

**A native Chromium distribution and rendering-policy research project for extremely long, dynamic web pages.**

LongView aims to make scrolling cost depend primarily on the visible working set instead of the total size of a document. The initial workloads are long AI conversations, documentation, logs, notebooks, forums, feeds, and large rendered Markdown pages.

## Status: v0.2.0 evidence and native-policy milestone

LongView is built from a pinned Chromium checkout; it is not an Electron shell. The browser currently loads a Manifest V3 runtime into the native Chromium executable to validate the HOT/WARM/COLD/PINNED policy on real pages. The same policy now has a dependency-free C++20 implementation, an installable `//longview` Chromium target, and a disabled-by-default Blink observability feature candidate.

v0.2 adds the evidence campaign needed before invasive Blink changes:

- baseline and LongView runs at 100/500/1000/2000 turns;
- CDP performance metrics and DOM counters;
- optional Chromium JSON traces suitable for Perfetto;
- JSON, CSV, and Markdown campaign reports;
- log-log scaling exponents, not just one-point speedup ratios;
- explicit correctness and regression gates;
- native policy eligibility, hysteresis, segment indexing, materialization telemetry, and anti-thrashing;
- a clean-source manifest that rejects bootstrap transport artifacts.

## Core model

```text
Viewport and active interaction       HOT / PINNED
Likely near-future viewport            WARM
Far from the active working set        COLD
Observable API or user access          materialize, record reason, prevent thrash
```

The browser runtime uses Chromium's existing `content-visibility` machinery. It does not remove framework-owned DOM nodes or claim that cold LayoutObjects, paint state, or accessibility state have already been evicted.

## Pinned Chromium

```text
Version  151.0.7922.77
Commit   ff37cfca210138f2a40b843b4a8195ab7e4fc7ff
Channel  stable
```

All baseline and LongView comparisons must use the same executable and pinned revision.

## Build and run

Prepare at least 120 GiB of free disk space for a practical Chromium development workspace.

```bash
python3 tools/longview.py doctor
python3 tools/longview.py fetch
python3 tools/longview.py build --profile longview-dev
python3 tools/longview.py run https://chatgpt.com/
```

Run the same browser without LongView:

```bash
python3 tools/longview.py run --baseline https://chatgpt.com/
```

## Native policy and Blink feature probes

After the pinned checkout exists, one command installs the tested policy, applies the disabled Blink feature gate, builds both probes with Chromium's toolchain, and executes them:

```bash
python3 tools/longview.py native-probe --force
```

Equivalent manual steps are:

```bash
python3 tools/longview.py install-overlay --force
python3 tools/longview.py install-blink-observability
python3 tools/longview.py build --target //longview:segment_policy_test
python3 tools/longview.py build --target //longview:blink_feature_probe
```

The feature is `blink::features::kLongViewSegmentLifecycle` and remains disabled by default. Patch `0001` adds only the gate and a compile/runtime probe; it does not discover segments or discard rendering state. Full pinned macOS and Windows probe runs remain required before patch `0002`.

## Evidence campaign

The runner is dependency-free and drives the exact Chromium executable through CDP. Node.js 22 or newer is required. Run the standard matrix:

```bash
python3 tools/longview.py evidence \
  --turns 100,500,1000,2000 \
  --runs 5 \
  --duration 9000 \
  --stress \
  --stream \
  --trace \
  --output-dir benchmark-results/mac-m4-2026-08-16
```

The result directory contains:

```text
campaign.json       machine-readable campaign and scaling analysis
campaign.csv        compact comparison table
REPORT.md           human-readable findings and gate status
<turns>/baseline.json
<turns>/longview.json
<largest-turns>/traces-*/  optional Chromium trace files (`--trace-all` captures every scale)
```

A lower scaling exponent means the metric grows more slowly as the conversation becomes longer. This is the primary LongView success criterion.

## Repository map

```text
chromium.version              exact upstream tag and commit
configs/gn/                   baseline/dev/release GN profiles
product/extension/            working browser runtime and controls
benchmarks/fixtures/          deterministic pathological long pages
benchmarks/runner/            CDP runner, campaign, reports, and gates
src/native/                   C++ policy, index, telemetry, and tests
chromium_overlay/             installable policy and Blink feature probes
patches/                      audited, pinned Chromium candidate patches
tools/                        checkout, build, overlay, package, validation
docs/                         architecture, evidence, compatibility, roadmap
```

## Validate the source tree

```bash
python3 tools/generate_source_manifest.py
python3 tools/validate_repository.py
npm run check:js
npm test
PYTHONPATH=tools python3 -m unittest discover -s tools/tests -v
cmake -S src/native -B build/native -DCMAKE_BUILD_TYPE=Release
cmake --build build/native --parallel 2
ctest --test-dir build/native --output-on-failure
```

Validation fails if `.longview-bootstrap` or a source-promotion workflow appears in a release tree. GitHub should contain normal source files, not encoded transport fragments.

## What remains

Patch `0001` now provides the disabled-by-default Blink feature gate. The next measured patch (`0002`) will introduce a document-scoped `LongPageSegment` observability controller and tracing only. It will not release cold layout/paint state until web tests cover geometry reads, focus, selection, find-in-page, anchors, accessibility, screenshot, print, and mutation behavior.

See `docs/EVIDENCE_CAMPAIGN.md`, `docs/BLINK_NATIVE_PHASE3.md`, and `docs/IMPLEMENTATION_STATUS.md`.

## License

LongView-specific code is BSD 3-Clause. Chromium and third-party components retain their original licenses.
