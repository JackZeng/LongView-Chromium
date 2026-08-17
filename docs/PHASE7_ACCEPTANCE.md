# Phase 7 acceptance checklist

## Engine

- [x] Tested controller contract for HOT/WARM/COLD/PINNED.
- [x] Geometry capsule and cold-backend abstraction.
- [x] Materialization reasons and anti-thrashing.
- [x] Scheduler priority contract.
- [ ] Real Blink derived-state release validated on full Chromium builds.
- [ ] Native compatibility WPT suite passes on macOS and Windows.

## Evidence

- [x] Deterministic benchmark and CDP evidence pipeline.
- [ ] Controlled physical Mac and Windows evidence bundles published.

## Distribution

- [x] Deterministic portable packaging.
- [x] Release manifest, update feed, rollout and verification tools.
- [x] SBOM generator.
- [x] macOS signing/notarization and Windows signing entrypoints.
- [ ] External Apple and Windows credentials installed.
- [ ] Signed stable artifacts published.

## Operations

- [x] Chromium pin watcher and security-update policy.
- [x] Privacy, accessibility, rollback and crash-reporting contracts.
- [x] Public dashboard source and Pages workflow.
- [ ] GitHub Pages enabled in repository settings.
- [ ] Crash upload service configured after privacy review.
