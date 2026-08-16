# Product definition

## Promise

LongView Chromium is the browser for pages that keep growing.

A user should be able to keep a long AI conversation, technical document, log stream, notebook, or feed open without the browser becoming progressively less responsive merely because old content still exists above the viewport.

## Primary user experience

LongView is automatic and quiet:

1. A normal page behaves exactly like Chromium.
2. Once a page becomes pathologically long, LongView discovers safe segment boundaries.
3. The current viewport stays HOT.
4. Content in the likely scroll direction becomes WARM.
5. Distant content becomes COLD and lets Chromium skip off-screen rendering work.
6. Search, selection, focus, or direct navigation immediately pins relevant content.

The toolbar answers three questions:

- Is LongView active here?
- How much of the page is HOT/WARM/COLD?
- Is the page using a known site adapter or generic segmentation?

## Initial target scenarios

- very long ChatGPT conversations;
- long Claude and Gemini conversations;
- generated reports and Markdown documents;
- documentation portals;
- logs and event streams;
- forums and issue threads;
- feed-style applications;
- notebooks with many rendered cells.

## Product principles

- Web compatibility before benchmark theater.
- Same pinned Chromium binary for baseline and variant.
- General engine policy before brittle site hacks.
- Site adapters only to identify better boundaries, not to rewrite application state.
- Every claimed improvement includes reproducible evidence.
- Native complexity is added only after a measured bottleneck justifies it.
