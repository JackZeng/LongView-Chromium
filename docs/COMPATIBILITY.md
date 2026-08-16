# Compatibility contract

LongView's default mode may optimize only behavior that remains observationally compatible with the web platform. Aggressive experiments must be opt-in and clearly labeled.

## Required materialization operations

A cold segment is restored before authoritative state is needed for:

- `getBoundingClientRect`, `getClientRects`, `offset*`, and computed geometry;
- `scrollIntoView` and anchor navigation;
- find-in-page and `beforematch`;
- focus, tab order, editable content, and IME;
- selection and clipboard operations;
- accessibility tree traversal;
- screenshots and printing;
- script mutation requiring layout or paint state;
- observer delivery when geometry must be current.

## First native exclusions

A candidate remains fully active when it contains:

- current focus or selection;
- editable content;
- playing audio/video;
- Canvas or WebGL;
- dialogs or popovers;
- fixed descendants;
- cross-boundary sticky behavior;
- invalid or very small geometry;
- repeated recent materializations.

## Invariants

1. Total scroll geometry remains stable across lifecycle transitions.
2. Segment identity remains stable.
3. A script-visible query never returns placeholder geometry as authoritative state.
4. Find, focus, selection, accessibility, screenshot, and print may add latency but not incorrect results.
5. Repeated faults cause pinning rather than materialization thrash.
6. The default Blink feature remains disabled until compatibility coverage is sufficient.

## Current MVP behavior

The extension runtime uses `content-visibility` and `contain-intrinsic-size`. Compatibility mode uses `auto`; aggressive mode may use stronger hiding on controlled documents. The runtime never deletes site-owned DOM.

## Native test matrix

The native phase must include web tests for:

- normal vertical and horizontal writing modes;
- nested scrollers;
- tables and fragmented content;
- cross-segment selection;
- focusable elements and tab order;
- hidden-until-found content;
- platform accessibility services;
- print preview and screenshots;
- active media and dynamic rendering surfaces;
- distant mutations and geometry queries.
