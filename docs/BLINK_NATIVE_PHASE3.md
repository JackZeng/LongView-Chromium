# Blink-native Phase 3

## Purpose

Phase 3 introduces native observability and policy wiring without yet releasing cold layout or paint state.

The repository now contains two native layers:

1. `src/native/` and `chromium_overlay/longview/common/`: a dependency-free policy/index model;
2. `patches/blink/0001-longview-observability-feature.patch`: a pinned, disabled-by-default Blink feature gate.

This separation lets us prove policy behavior and Chromium integration independently.

## Patch sequence

### 0001 — feature gate and compile probe

Adds `blink::features::kLongViewSegmentLifecycle`, disabled by default, and exposes it through Blink runtime feature plumbing. The `//longview:blink_feature_probe` binary verifies that the feature remains disabled without command-line overrides.

It does not:

- discover segments;
- modify style/layout/paint traversal;
- alter accessibility;
- change script-observable geometry;
- evict any state.

### 0002 — document-scoped observability controller

Planned after 0001 compiles on the exact Chromium pin. It will:

- attach a `LongPageController` to a document/frame;
- record candidate count and segment boundaries;
- expose tracing/UMA only;
- execute no lifecycle transition that changes rendering behavior.

### 0003 — display-lock backed cold state experiment

Only after observability data and compatibility tests pass. It will use existing Blink display-lock/content-visibility plumbing where possible. Any script-observable operation must materialize before returning.

### 0004 — scheduler/compositor coordination

Only if traces prove main-thread policy work or raster readiness remains a bottleneck.

### 0005 — compact geometry state

Only if retained layout state is still a measured limiting factor. This is where a Geometry Capsule could become justified.

## Materialization contract

A cold segment must be materialized for:

```text
viewport approach
getBoundingClientRect / offset* / computed geometry
find-in-page and beforematch
focus or keyboard traversal
selection and clipboard operations
anchor navigation and scrollIntoView
accessibility traversal
taking screenshots
printing
script mutation that requires authoritative state
```

Materialization is not a rare exception; it is part of the web compatibility contract. The controller records reason counts and pins segments that repeatedly fault.

## Candidate eligibility

The first policy is deliberately conservative. A segment is not eligible for cold management when it contains or participates in:

- current focus, active selection, or an editable surface;
- playing media;
- Canvas or WebGL activity;
- dialogs or popovers;
- fixed descendants;
- sticky positioning that crosses the candidate boundary;
- invalid or tiny geometry;
- repeated materialization within a short window.

An ineligible segment remains fully rendered. It is not counted as an optimization failure.

## Telemetry

Required trace/metric fields:

```text
segment_count
eligible_count
ineligible_count by reason
hot/warm/cold/pinned counts
transition counts
materialization counts by reason
policy_update_duration
index_rebuild_duration
cold_duration before fault
checkerboard or blanking signal when available
```

Telemetry must not record page text or URLs beyond existing Chromium privacy rules.

## Correctness coverage before cold state

The benchmark fixture provides executable probes for geometry, focus, selection, and anchors. Native web tests must add:

- nested scroll containers;
- writing modes and fragmented layout;
- fixed/sticky descendants;
- editable content and IME;
- find-in-page across multiple cold segments;
- selection crossing segment boundaries;
- accessibility traversal with platform services enabled;
- print preview and screenshot capture;
- Canvas/WebGL/media/dialog/popover exclusion;
- mutation of a distant cold descendant;
- geometry queries from requestAnimationFrame and ResizeObserver.

## Reviewable patch size

Each Chromium patch should add one capability and its tests. Do not combine segment discovery, state eviction, scheduling, and UI into one downstream patch.

The native policy remains a mirror/specification. Once Blink owns a behavior, parity tests should compare the model and engine transition sequences for the same synthetic inputs.
