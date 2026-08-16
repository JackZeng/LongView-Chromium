# LongView Chromium architecture

## 1. Problem

A browser displays only a small viewport, but a long dynamic page can retain a large amount of live state:

```text
JavaScript objects and framework state
DOM and event listeners
style data and invalidation dependencies
layout objects and geometry
paint records and display items
raster tiles and decoded images
compositor hit-test/event regions
accessibility, find, focus, and selection structures
```

The engineering objective is:

> Make active scrolling work scale primarily with the visible and predicted working set, rather than with total document complexity.

## 2. Release architecture

```text
Pinned Chromium 151.0.7922.77
│
├── normal Chromium browser process model and UI
│
├── LongView MV3 runtime
│   ├── activation detector
│   ├── site/generic segment discovery
│   ├── geometry index
│   ├── working-set controller
│   ├── compatibility wakeups
│   ├── diagnostics and settings
│   └── browser toolbar/background service worker
│
├── deterministic benchmark fixture and runner
│
└── native C++ lifecycle specification
    └── future Blink migration target
```

The extension-first delivery is an implementation strategy, not the final engine boundary. It exercises real Chromium rendering primitives and makes policy measurable before invasive source changes.

## 3. Activation

LongView remains inactive on ordinary pages. It evaluates:

- document height measured in viewports;
- DOM node count;
- excluded hostname patterns;
- risky document-editor/canvas/fullscreen conditions;
- whether a safe repeated/section-like segment root can be found.

The default activation threshold is either 24 viewport heights or 3,500 DOM nodes, followed by a minimum of 12 eligible segments.

A temporary mutation observer watches a page that starts small but grows into a long conversation. It disconnects after activation or after a bounded observation period.

## 4. Segment discovery

### Known-site adapters

Adapters for ChatGPT, Claude, and Gemini use multiple selector candidates rather than one assumed DOM shape. A selector is accepted only when it yields enough unique top-level items.

Adapters identify boundaries; they do not delete or replace application nodes.

### Generic discovery

The generic detector considers a bounded set of likely content containers and scores each by:

- number of eligible direct children;
- total vertical span in screens;
- median child height;
- dominant tag/role/class signature ratio.

A container must exceed a confidence score. This avoids activating on arbitrary collections of tiny controls.

### Eligibility

A candidate is rejected when it is too small, hidden, fixed/sticky at its root, an active dialog/popover, or contains currently playing media. Page-scale editors and canvas-heavy applications are skipped in conservative mode.

## 5. Geometry index

Every accepted segment records:

```text
top
height
bottom
original inline rendering properties
current lifecycle state
pin expiration
transition count
```

Segments are sorted by absolute block position. Viewport-window lookup uses two binary searches:

```text
first segment whose bottom intersects window top
first segment whose top is after window bottom
```

Therefore, locating a HOT or WARM range is `O(log N)`. State changes are applied only across the union of the previous and current warm ranges, not across the entire page on every scroll event.

The initial discovery and occasional remeasure are `O(N)` by design; steady-state scrolling is not.

## 6. Working-set prediction

Inputs:

```text
scroll position
viewport height
document height
recent scroll samples
configured hot/warm distances
maximum warm-segment count
```

Scroll velocity is estimated over a short recent sample window. The WARM range expands in the current direction according to speed, capped at a configured prediction boost. The behind range remains smaller during forward scrolling and larger during reverse scrolling.

A hard segment-count bound prevents thousands of tiny items from becoming WARM merely because a screen-distance range is large.

## 7. Lifecycle

### HOT

The viewport and immediate neighborhood. `content-visibility` is forced visible so interaction and rendering are authoritative.

### WARM

Likely near-future content. `content-visibility:auto` and a measured intrinsic block size let Chromium skip work when possible while keeping the region close to materialization.

### COLD

Far content. It remains in the DOM, but Chromium can skip rendering work beneath the subtree. Aggressive mode additionally pauses CSS animation and removes transition work inside cold regions.

### PINNED

A correctness state that behaves like HOT for a bounded time. Triggers include focus, selection, find-in-page, and repeated native materialization in the future C++ policy.

## 8. Geometry preservation

Before a segment enters automatic content visibility, LongView measures its height and sets:

```css
content-visibility: auto;
contain-intrinsic-block-size: auto <measured-height>px;
```

The intrinsic size preserves scroll geometry while Chromium skips rendering work. The `auto` form allows the browser to remember the last rendered size where supported.

Original inline values and priorities are captured and restored when LongView is disabled or the segment leaves the managed set.

## 9. Dynamic pages

### Mutation

A subtree mutation observer debounces rediscovery. When a conversation streams new turns, new candidates are enrolled without rebuilding on every token.

### Resize

Only HOT, WARM, and PINNED nodes are observed by `ResizeObserver`. A height change schedules a geometry remeasure. COLD nodes are not all continuously observed, avoiding an observer set proportional to the entire document during steady-state scroll.

### Root changes

If rediscovery identifies a different segment root, the mutation observer is disconnected and reattached to the new root.

## 10. Compatibility materialization

The v0.1 runtime leaves DOM identity intact and uses browser-native materialization. It explicitly pins the containing segment for:

- `beforematch` find/search exposure;
- focus entry;
- selection anchor/focus;
- user-requested reindex or page state changes.

The future native design adds exact materialization reasons:

```cpp
kViewportApproach
kGeometryQuery
kFindInPage
kFocus
kSelection
kAnchorNavigation
kAccessibility
kScreenshot
kPrint
kScriptMutation
```

Repeated materialization in a short window promotes/pins a segment to avoid freeze/wake thrashing. This behavior is implemented and tested in `src/native`.

## 11. Diagnostics

The content runtime reports:

- active adapter and confidence;
- total/HOT/WARM/COLD/PINNED counts;
- velocity;
- page length;
- transitions and reindexes;
- content-visibility skip events when available;
- long-task count and duration;
- last lifecycle reason and last error.

Stats are shown in the page overlay, toolbar popup, action badge, and background tab state.

## 12. Current boundary and native migration

The v0.1 runtime can reduce off-screen rendering cost, but it cannot release all site DOM, V8 heap, framework state, accessibility state, or retained layout objects.

The migration sequence is evidence-driven:

1. Measure the pinned baseline and v0.1 runtime.
2. Identify retained costs that still scale with total segments.
3. Add a disabled-by-default Blink feature implementing engine-owned eligibility and lifecycle.
4. Add tracing and web tests before releasing any derived state.
5. Introduce scheduler/compositor coordination.
6. Test geometry capsules only if layout retention remains a dominant bottleneck.

Likely Chromium investigation areas:

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

No patch is added to these areas until it can be tested against the compatibility contract.
