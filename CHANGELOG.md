# Changelog

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
- Added `native-probe` and a self-hosted macOS/Windows workflow to compile and execute the policy and feature probes against the exact Chromium pin.

### Repository integrity

- Added a generated SHA-256 source manifest.
- Release-tree validation now rejects bootstrap fragments and source-promotion workflows.
- Added documentation for evidence, Blink integration, and repository integrity.

## 0.1.0 — 2026-08-16

- Pinned Chromium 151.0.7922.77.
- Added native Chromium bootstrap, build, run, and package tooling.
- Added the LongView Manifest V3 runtime with site adapters and HOT/WARM/COLD/PINNED lifecycle.
- Added deterministic long-conversation fixtures and one-run benchmark comparison.
- Added the initial dependency-free C++ lifecycle model.
