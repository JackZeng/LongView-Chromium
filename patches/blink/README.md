# Blink candidate patches

## 0001 — observability feature gate

Purpose:

- introduce `blink::features::kLongViewSegmentLifecycle`;
- expose a Blink runtime-enabled feature entry;
- keep it disabled by default;
- provide a stable gate for follow-up observability code.

Non-goals:

- no automatic segment discovery;
- no style/layout/paint change;
- no display locking;
- no DOM removal;
- no geometry placeholder;
- no accessibility change.

Installation:

```bash
python3 tools/longview.py install-blink-observability
python3 tools/longview.py build --target //longview:blink_feature_probe
```

The installer validates the exact Chromium commit in `chromium.version`. Because Chromium's generated runtime-feature plumbing evolves, the installer performs structural insertion rather than trusting the illustrative patch hunk offsets blindly; the patch remains the auditable statement of intended upstream changes.

## 0002 — planned

A document-scoped observability controller and trace events only. Rendering behavior remains unchanged.
