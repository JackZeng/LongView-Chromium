# Development Guide

## Current phase

The repository is in bootstrap/measurement phase. Chromium source is not committed here.

## Recommended model

Use a separate local Chromium checkout and apply LongView work as a small downstream layer/patch series until the architecture stabilizes.

Example workspace:

```text
workspace/
├── depot_tools/
├── chromium/
│   └── src/
└── LongView-Chromium/
```

## Upstream pinning

Before implementation work begins, add a machine-readable upstream revision file (planned: `chromium.version`) containing the exact Chromium Git SHA and any required branch/tag metadata.

Never document only a marketing version such as “Chrome 140”; reproducible work requires an exact source revision.

## Build profiles

We expect at least two profiles:

### Baseline

Unmodified upstream Chromium at the pinned revision.

### LongView

The same revision plus LongView changes.

Comparisons between mismatched revisions are invalid for performance claims.

## Branching

Suggested workflow:

```text
main
feature/benchmark-harness
feature/segment-detector
experiment/content-visibility
experiment/blink-display-lock
experiment/geometry-capsule
```

Keep experimental engine changes isolated until they have benchmark evidence.

## Commit discipline

A change affecting performance should include:

- workload/fixture used;
- baseline revision;
- LongView revision;
- hardware/OS metadata;
- before/after metrics;
- compatibility implications;
- trace or reproducible command when practical.

## Coding style

For code placed inside Chromium, follow Chromium's existing style, lint, OWNERS, and testing conventions for the target subtree.

For standalone LongView tools, keep dependencies minimal and deterministic.

## First development tasks

1. Add upstream pin and bootstrap scripts.
2. Build benchmark fixture generator.
3. Add trace capture/summary tooling.
4. Capture untouched Chromium baselines on macOS and Windows.
5. Prototype standards-compliant off-screen rendering reduction.
