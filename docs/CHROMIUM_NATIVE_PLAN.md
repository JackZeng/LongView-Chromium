# Chromium native integration plan

The native implementation must reduce work without silently changing the observable web platform in the default mode.

## Invariants

1. Scroll extent and scroll offsets remain stable across state transitions.
2. HOT content is indistinguishable from ordinary Chromium rendering.
3. Focus, selection, anchor navigation, find-in-page, screenshot, print, and accessibility materialize required content before returning results.
4. Geometry APIs return correct values, even when that requires a synchronous materialization fault.
5. A segment that thrashes between COLD and materialized states is promoted and temporarily pinned.
6. Aggressive behavior remains opt-in until compatibility data supports a safer default.

## Patch sequence

### Patch 1: feature flag and policy kernel

Add `LongViewLongPageOptimization` behind `base::Feature`, copy `//longview`, expose field-trial parameters, and run the native policy unit tests in Chromium CI.

### Patch 2: diagnostics-only segment discovery

Discover candidate block-flow islands in Blink without changing rendering. Record segment count, size distribution, viewport distance, mutation rate, geometry-read rate, focus/selection ownership, and eligibility rejection reasons.

### Patch 3: browser-owned display locking

Use existing display-lock/content-visibility machinery to lock eligible far-off segments. Preserve DOM and JavaScript identity. Add materialization reasons for viewport approach, focus, selection, anchors, find, screenshot, print, and accessibility.

### Patch 4: predictive warming and scheduler integration

Move range prediction into Blink scheduling. Prioritize input, compositor scroll, and upcoming segment lifecycle work. Coalesce lower-priority observer and diagnostic tasks without changing cancelable input semantics.

### Patch 5: cold paint-state release

Discard rebuildable paint chunks, raster tiles, hit-test data, and decoded resources for stable cold segments. Validate no checkerboarding at target scroll velocities.

### Patch 6: Geometry Capsule prototype

Retain block size, inline constraints, anchors, text index, style generation, and invalidation metadata while releasing more layout state. Any web-observable query creates a bounded materialization fault.

### Patch 7: accessibility and find indexes

Provide compact searchable and accessible metadata for cold segments. Materialize the exact segment when a result is focused or navigated.

### Patch 8: site adapters only where necessary

Use adapters for semantically difficult applications after the generic engine path is measured. Adapters may identify segment boundaries but must not become the primary architecture.

## Primary Chromium locations

Expected integration points include:

```text
third_party/blink/renderer/core/display_lock/
third_party/blink/renderer/core/layout/
third_party/blink/renderer/core/paint/
third_party/blink/renderer/core/frame/
third_party/blink/renderer/modules/accessibility/
third_party/blink/renderer/platform/scheduler/
cc/trees/
cc/tiles/
content/browser/
chrome/browser/
```

Exact files must be selected from the pinned source rather than guessed in advance.
