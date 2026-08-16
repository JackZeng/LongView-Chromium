# Chromium patch series

LongView keeps Chromium itself in a separate checkout pinned by `chromium.version`. Native Chromium changes belong here as a small ordered patch series rather than as a vendored multi-gigabyte source tree.

`series.json` is the machine-readable manifest. v0.1 intentionally contains no invasive Chromium patch: its optimization mechanism is the measured browser runtime in `product/extension/`, while `src/native/` specifies the policy that will migrate into Blink.

Future patches must:

1. name the exact Chromium pin they apply to;
2. include a SHA-256 digest in `series.json`;
3. remain small enough to review independently;
4. include benchmark evidence and compatibility tests;
5. avoid mixing browser branding, performance changes and unrelated refactors.

A patch is not accepted merely because a synthetic page looks smoother. It must preserve geometry reads, focus, selection, find-in-page, anchors, accessibility, screenshot and print behavior relevant to its scope.
