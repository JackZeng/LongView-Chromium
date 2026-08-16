# Implementation status

## Complete in v0.1.0

### Product shell

The project has a native desktop window, trusted browser chrome, isolated tab WebContents, navigation controls, multiple tabs, persistent sessions, history, bookmarks, downloads, permissions, find-in-page, internal pages, keyboard menus, and packaging workflows.

### LongView renderer prototype

The renderer preload discovers stable segment candidates, measures them outside the scroll hot path, sorts them by document position, and uses binary search to identify only the WARM range for each update. Previous active segments are demoted without touching every distant segment.

The policy includes velocity smoothing, look-ahead prediction, asymmetric ahead/behind margins, three operating modes, materialization commands, focus/selection pinning, before-match/copy/print safeguards, non-starving mutation rescans, resize handling, and live performance reporting.

### Measurement

The built-in benchmark produces deterministic conversation pages up to 5,000 turns. It includes code blocks, tables, image-like paint areas, per-message toolbars, distant geometry reads, continuous scrolling, and streaming DOM append. CLI runs emit machine-readable JSON and a comparison report.

### Native preparation

Electron and Chromium are pinned. Bootstrap tooling creates the exact Chromium checkout. The first C++ policy kernel and unit tests are ready to copy into `//longview` in Chromium.

## Not yet native-complete

The following require verified patches against the pinned Chromium source and are not claimed as finished:

- Blink-owned automatic segment boundaries
- Native Display Lock lifecycle controlled by the browser rather than page CSS
- Releasing cold LayoutObject and paint property trees
- Geometry Capsules that preserve scroll extent without a live layout subtree
- On-demand materialization for arbitrary script geometry reads
- Compact cold accessibility representation
- Compositor-owned virtual segment placeholders
- Browser diagnostics in `chrome://tracing` and UMA
- Upstream-quality Web Platform Tests and accessibility coverage

## Why this boundary is intentional

A browser can easily appear faster by breaking page semantics. LongView first establishes deterministic workloads, observable behavior, policy semantics, and a usable product shell. Native work will proceed only when each optimization has a correctness probe and a baseline trace.
