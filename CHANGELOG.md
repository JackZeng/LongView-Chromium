# Changelog

## 0.3.0 — 2026-08-17

### Engine contract

- Added a dependency-free C++20 `LongPageController` with HOT/WARM/COLD/PINNED lifecycle.
- Added Geometry Capsules with block geometry, generation tracking, anchors, and text digest.
- Added pluggable cold-backend freeze/thaw behavior and released-byte accounting.
- Added correctness pins, explicit materialization reasons, hysteresis, and anti-thrashing.
- Added velocity-aware working-set and scheduler-priority contracts.
- Added a Blink cold-backend bridge and Chromium GN probe targets.

### Release and operations

- Added deterministic portable packaging and CycloneDX SBOM generation.
- Added release-manifest, update-feed, signature, rollout, staging, installation, health-check, and rollback tools.
- Added macOS codesign/notarization and Windows Authenticode packaging entrypoints.
- Added Chromium pin monitoring and documented security-update cadence.
- Added controlled physical evidence and release-candidate workflows.
- Added privacy, accessibility, crash-reporting, and Phase 7 acceptance documents.
- Added a static public release/evidence dashboard and Pages workflow.

### Evidence reliability

- Stabilized the pinned Chrome-for-Testing smoke matrix.
- Added compatibility for both `hot` and legacy `active` runtime state metrics.
- Wait for Chromium process exit before deleting benchmark profiles.

### Release boundary

- v0.3.0 does not claim real Blink derived-state eviction or signed stable artifacts. Those remain explicit stable-release gates.

## 0.2.0 — 2026-08-16

### Evidence campaign

- Added repeated baseline/LongView scale matrices at configurable conversation sizes.
- Added CDP performance metrics, DOM counters, and optional Chromium trace capture.
- Added JSON, CSV, and Markdown campaign outputs.
- Added log-log scaling exponents and explicit correctness/regression gates.
- Added a two-scale browser smoke workflow that uploads evidence artifacts.

### Native policy foundation

- Added conservative segment eligibility decisions.
- Added HOT/WARM demotion hysteresis.
- Added ordered segment indexing and binary intersection queries.
- Added materialization reasons, anti-thrashing pinning, and policy telemetry.
- Added an installable Chromium `//longview:segment_policy_test` target.
- Added candidate Blink patch `0001`, a disabled-by-default observability feature gate with no render-state eviction.
- Added `native-probe` and a self-hosted macOS/Windows workflow.

### Repository integrity

- Added a generated SHA-256 source manifest.
- Release-tree validation rejects bootstrap fragments and source-promotion workflows.

## 0.1.0 — 2026-08-16

- Pinned Chromium 151.0.7922.77.
- Added native Chromium bootstrap, build, run, and package tooling.
- Added the LongView Manifest V3 runtime with site adapters and HOT/WARM/COLD/PINNED lifecycle.
- Added deterministic long-conversation fixtures and one-run benchmark comparison.
- Added the initial dependency-free C++ lifecycle model.
