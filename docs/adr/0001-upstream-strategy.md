# ADR 0001: Track Chromium as an external pinned upstream

- Status: Accepted for bootstrap
- Date: 2026-08-16

## Context

Chromium is an extremely large, fast-moving repository. Vendoring its complete source into LongView-Chromium would make the project repository huge, obscure the actual LongView delta, and make review/rebasing unnecessarily difficult.

## Decision

LongView-Chromium will initially:

1. keep Chromium in a separate local checkout managed using Chromium's normal tooling;
2. pin an exact upstream Chromium Git SHA;
3. keep LongView-specific docs, benchmarks, tools, prototypes, and downstream integration metadata in this repository;
4. keep engine modifications as a small auditable patch/integration series until their permanent home becomes clear;
5. compare LongView builds only against the same pinned upstream revision.

## Consequences

Positive:

- small and reviewable repository;
- clearer ownership of LongView code;
- easier rebasing and experimentation;
- no accidental relicensing of Chromium/third-party content;
- simpler performance comparison discipline.

Costs:

- contributors need a separate Chromium checkout;
- bootstrap tooling must apply/sync LongView changes reliably;
- patch management needs discipline.

## Revisit condition

Revisit after the first Blink-native prototype if Chromium's normal patch/rebase workflow becomes a bottleneck or if a dedicated maintained fork becomes operationally superior.
