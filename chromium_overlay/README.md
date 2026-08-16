# Chromium native overlay

This directory contains the first native, dependency-light LongView policy kernel. It is intentionally separate from the application-layer browser so that the HOT/WARM/COLD state semantics can be tested before they are wired into Blink lifecycle, paint, raster, accessibility, and compositor code.

Install it into a pinned Chromium checkout:

```bash
python3 tools/bootstrap-chromium.py /path/to/workspace
python3 tools/install-overlay.py /path/to/workspace/src
cd /path/to/workspace/src
gn gen out/LongView
autoninja -C out/LongView longview_policy_tests
out/LongView/longview_policy_tests
```

The overlay does **not** yet modify Blink behavior by itself. The integration sequence is documented in `docs/CHROMIUM_NATIVE_PLAN.md`.
