# LongView Chromium Architecture

## 1. Problem statement

Extremely long dynamic pages can accumulate large amounts of live DOM, style, layout, paint, accessibility, JavaScript, decoded-image, and compositor state. The browser may only display a small viewport, yet total document complexity can still increase work on the renderer main thread and memory subsystem.

LongView's central objective is:

> Make interactive scrolling cost depend primarily on the visible and near-visible working set, rather than on the total complexity of the document.

## 2. First-principles model

A rendered page consumes resources in several layers:

```text
JavaScript / DOM state
        ↓
Style resolution
        ↓
Layout tree / geometry
        ↓
Paint records
        ↓
Raster tiles
        ↓
Compositor state
        ↓
Display
```

There are parallel structures including accessibility, selection/focus, find-in-page, observers, image decode caches, hit testing, and event regions.

A long-page optimization is successful only if it reduces work in these layers while preserving observable web behavior.

## 3. Segment model

LongView introduces the conceptual unit `LongPageSegment`.

A segment is a conservatively chosen contiguous region of the primary scrolling content that can be managed as a working-set unit.

Candidate boundaries include:

- repeated feed/list items;
- article sections;
- AI conversation turns;
- log chunks;
- large block formatting contexts with safe containment characteristics.

Segments are not assumed to be independent unless the engine can prove or conservatively approximate that state.

## 4. Segment lifecycle

### HOT

The viewport and immediate interactive neighborhood.

Retains full interactive/rendering state. Normal browser semantics apply.

### WARM

Likely to enter the viewport soon.

May retain DOM and layout geometry while reducing paint/raster/decode activity and deprioritizing non-essential work.

### COLD

Far from the active viewport.

The long-term design aims to retain only the state required to preserve page geometry, identity, searchability, anchors, and correct on-demand behavior, while discarding expensive derived rendering state where safe.

## 5. Geometry capsule

A future COLD segment may be represented by a compact internal structure similar to:

```cpp
struct SegmentGeometryCapsule {
  float block_size;
  float start_offset;
  TextIndexHandle text_index;
  AnchorMapHandle anchors;
  StyleGeneration style_generation;
  SnapshotHandle optional_snapshot;
};
```

This is a design concept, not yet an implementation API.

The capsule exists so the compositor and scroll model can preserve total document geometry without keeping a full live rendering representation for every off-screen region.

## 6. Materialization

Any operation requiring authoritative state may materialize a cold segment.

Representative reasons:

```cpp
enum class MaterializationReason {
  kViewportApproach,
  kGeometryQuery,
  kFindInPage,
  kFocus,
  kSelection,
  kAnchorNavigation,
  kAccessibility,
  kScreenshot,
  kPrint,
  kScriptMutation,
};
```

If a segment is repeatedly materialized, policy should promote it to WARM/HOT rather than thrash.

## 7. Predictive warming

The compositor/scheduler can estimate near-future viewport position from scroll direction, velocity, acceleration, input modality, and historical timing.

The design goal is to warm just enough future content to avoid blanking while minimizing unnecessary work.

## 8. Compatibility modes

### Conservative mode

Default. Preserve web semantics and use only optimizations that should be observationally equivalent.

### Experimental aggressive mode

Optional developer/user setting for experiments that may defer non-critical work more aggressively. It must never silently become the compatibility default.

## 9. Initial implementation layers

We intentionally do not begin by rewriting LayoutNG.

1. Benchmark and trace current Chromium behavior.
2. Prototype segmentation and `content-visibility`/display-lock behavior.
3. Move safe lifecycle policy into Blink.
4. Add scheduler/compositor coordination.
5. Explore geometry capsules only after measurement proves retained layout state remains a bottleneck.
6. Add site adapters for pathological apps such as very long AI conversations only when generic behavior is insufficient.

## 10. Likely Chromium integration areas

Expected investigation areas include:

```text
third_party/blink/renderer/core/display_lock/
third_party/blink/renderer/core/frame/
third_party/blink/renderer/core/layout/
third_party/blink/renderer/core/paint/
third_party/blink/renderer/platform/scheduler/
third_party/blink/renderer/modules/accessibility/
cc/trees/
cc/tiles/
cc/scheduler/
content/browser/
chrome/browser/
```

These are investigation targets, not a commitment to modify every subsystem.

## 11. Non-goals for the first milestone

- redesigning Chrome's browser UI;
- replacing Skia;
- replacing V8;
- arbitrary removal of site-owned DOM nodes;
- breaking event semantics to make synthetic benchmarks look fast;
- maintaining a permanently huge Chromium fork with opaque changes.

## 12. Success condition

For a benchmark that grows from hundreds to thousands of repeated content segments, p95/p99 scroll frame time and active scrolling main-thread cost should grow much more slowly than total page complexity, while correctness tests for focus, selection, find-in-page, anchors, script geometry reads, accessibility, screenshot, and print continue to pass.
