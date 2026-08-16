# ADR 0002: Extension-first browser MVP before Blink-native eviction

- Status: accepted
- Date: 2026-08-16

## Context

The final LongView vision requires browser-engine control over off-screen rendering state. Immediately modifying LayoutNG, display locking, scheduler, compositor, accessibility, and browser product code would create a large unverified fork before the dominant bottleneck and compatibility semantics are measured.

Chromium already exposes `content-visibility`, intrinsic-size containment, browser extension loading, performance observers, and ordinary rendering behavior sufficient to validate a large part of the working-set hypothesis on real pages.

## Decision

The first working browser release will:

1. build a pinned Chromium revision;
2. load a repository-owned Manifest V3 LongView runtime;
3. implement segmentation, prediction, lifecycle, compatibility wakeups, diagnostics, and benchmarks there;
4. maintain an equivalent dependency-free C++ lifecycle specification;
5. move mechanisms into Blink only after measurements identify costs the runtime layer cannot remove.

## Consequences

### Positive

- A functional browser can be tested early on target pages.
- Baseline and LongView can use the same Chromium binary.
- Policy changes are fast to iterate and easy to disable.
- Compatibility failures are observable before deep engine work.
- Native patches can be justified by evidence rather than intuition.

### Negative

- The runtime cannot release site DOM, V8 heap, or every retained layout/accessibility structure.
- It depends on discoverable segment boundaries.
- Some geometry/materialization behavior remains controlled by existing Chromium primitives.
- Production packaging initially launches Chromium with a bundled runtime rather than a fully integrated component extension.

## Revisit condition

Begin Blink-native implementation after the evidence campaign shows a repeatable remaining cost that scales with total page complexity and the compatibility matrix defines when authoritative state must be restored.
