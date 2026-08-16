# LongView browser runtime

This Manifest V3 extension is loaded by the native Chromium build. It is the v0.2 product/runtime prototype, not the final Blink implementation.

Capabilities:

- ChatGPT, Claude, Gemini, explicit-root, and conservative generic adapters;
- HOT/WARM/COLD/PINNED states;
- velocity-aware asymmetric warming;
- focus and selection pinning;
- materialization for find, copy, beforematch, and print;
- mutation and resize rescanning;
- popup, options, welcome page, and diagnostics overlay.

The runtime uses `content-visibility` and intrinsic-size containment. It never deletes site-owned DOM.

Load manually into a Chromium/Chrome development profile through `chrome://extensions`, or use:

```bash
python3 tools/longview.py run https://chatgpt.com/
```
