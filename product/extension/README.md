# LongView browser runtime

This directory contains the working v0.1 LongView optimization module. The LongView launcher loads it into the Chromium executable as an unpacked Manifest V3 extension so the browser can iterate against real sites without an invasive, unmeasured Blink fork.

## Runtime pipeline

```text
bootstrap
  → activation threshold / exclusion / risk gate
  → site-specific or generic segment discovery
  → sorted segment geometry index
  → HOT / WARM / COLD / PINNED state policy
  → content-visibility and intrinsic-size application
  → mutation, resize, focus, selection and find wakeups
  → diagnostics and benchmark telemetry
```

The scroll handler only samples position and schedules one animation-frame update. The update uses binary searches over the sorted geometry index and touches the union of the old and new working-set ranges. It does not traverse all page DOM nodes on every scroll event.

Resize observation is restricted to HOT, WARM and PINNED segments. Content mutations inside an existing segment update that segment incrementally; appended conversation turns can be indexed without rebuilding the entire list. Full rediscovery and full geometry reconciliation are debounced fallbacks.

## States

- `HOT`: forced visible for immediate interaction.
- `WARM`: prepared with `content-visibility:auto` near the predicted viewport.
- `COLD`: far from the current working set; Chromium may skip rendering work beneath it.
- `PINNED`: temporarily forced visible by focus, selection, find-in-page or another correctness-sensitive operation.

Conservative mode preserves DOM and normal web semantics. Aggressive mode additionally pauses animations and removes transitions inside COLD segments; it remains opt-in.

## Permissions

- `storage`: saves LongView settings locally.
- `tabs`: reads the current tab and sends control messages.
- HTTP/HTTPS host access: discovers and manages long-page segments in normal web pages.

No page text, browsing history or benchmark data is sent to a server by this project.

## Manual loading

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this directory. The repository launcher performs the equivalent operation automatically:

```bash
python3 tools/longview.py run https://chatgpt.com/
```

## Validation

```bash
python3 tools/validate_extension.py
npm run check:js
npm test
```

The real-browser smoke test is in `tools/smoke_chromium.mjs`.
