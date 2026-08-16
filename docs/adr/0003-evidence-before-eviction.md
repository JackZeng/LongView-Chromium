# ADR 0003: Require evidence and compatibility coverage before native eviction

## Status

Accepted.

## Context

Deleting or detaching cold render state may improve scrolling but can silently break geometry queries, focus, selection, find-in-page, accessibility, screenshots, printing, observers, and dynamic content.

## Decision

The first Blink patch is a disabled-by-default feature gate and compile probe. The next patch may add candidate discovery and telemetry only. Cold layout/paint state may not be released until:

1. the evidence campaign identifies retained state as a real bottleneck;
2. native web tests cover the compatibility contract;
3. materialization and anti-thrashing semantics are explicit;
4. traces show no unacceptable checkerboarding or input regression.

## Consequences

Development is slower than a benchmark-only hack, but results are reviewable and falsifiable. A failed experiment can be removed without leaving a permanent opaque fork.
