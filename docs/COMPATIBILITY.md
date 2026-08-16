# Compatibility contract

LongView optimizes only when it can preserve ordinary web behavior. Conservative mode is the default.

## Core invariants

1. Site-owned DOM nodes are not deleted or replaced.
2. Node identity, event listeners, and framework state remain intact.
3. Scroll height is preserved with measured intrinsic block size.
4. Focused, selected, searched, or actively accessed content is materialized.
5. Active audio/video and open dialog/popover regions are not enrolled as cold segments.
6. The optimization can be removed from a page and original inline properties are restored.
7. Aggressive behavior is opt-in.

## Observable operations

| Operation | v0.1 behavior |
|---|---|
| Normal scroll into a cold segment | Chromium materializes `content-visibility:auto` content before display; LongView predicts and promotes nearby segments |
| `find` / find-in-page | `beforematch` pins the containing segment when Chromium exposes the match event |
| Focus or tab navigation | `focusin` pins the containing segment |
| Text selection | Anchor and focus segments are pinned while the selection is active |
| `scrollIntoView()` | Browser geometry remains available; the target enters the predicted/hot range after scroll |
| `getBoundingClientRect()` | DOM remains present; Chromium may perform the required layout work |
| Dynamic append / stream | Mutation observer re-discovers candidates after a debounce |
| Segment height change | Resize observer covers HOT/WARM/PINNED segments and rebuilds geometry |
| Open dialog/popover | Segment is ineligible while the active surface is present |
| Playing media | Segment is ineligible while media is active at discovery |
| Screenshot / print | Browser remains authoritative; no DOM serialization or snapshot substitution is used |
| Accessibility | DOM remains present. Full screen-reader regression testing is required before native accessibility-state eviction |

## Risky-page policy

Conservative mode avoids automatic activation on document-scale editors such as Monaco, CodeMirror, Slate roots, body-level contenteditable applications, fullscreen content, or canvas-heavy applications. A normal chat composer does not by itself classify the whole page as an editor.

Users may exclude hostnames in settings. Patterns can be exact (`example.com`) or wildcard subdomains (`*.example.com`).

## Aggressive mode

Aggressive mode keeps the same DOM and geometry behavior but pauses CSS animation and removes transition work inside COLD segments. This may visibly change background animations when the user jumps directly to a distant location; it therefore remains opt-in.

## Known v0.1 limitations

- Pages with no stable repeated or section-like block boundaries may not activate.
- A site that continuously reads geometry for thousands of off-screen nodes can still force work.
- Framework reconciliation, JavaScript heaps, and accessibility structures remain allocated.
- Deep sticky/fixed descendants are handled conservatively only at candidate-root level in v0.1.
- Browser-managed find behavior varies by Chromium version; the benchmark includes explicit probes.
