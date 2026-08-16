# Chromium overlay

`python3 tools/longview.py install-overlay` installs this directory at `//longview` in the pinned Chromium checkout.

Targets:

```bash
autotest=unused
python3 tools/longview.py build --target //longview:segment_policy_test
python3 tools/longview.py build --target //longview:blink_feature_probe
```

The policy target is dependency-free and can be compiled with Chromium's Clang toolchain before any Blink lifecycle code is connected. The feature probe is available after `patches/blink/0001-longview-observability-feature.patch` is installed.

The overlay is intentionally kept outside upstream directories. Upstream modifications are represented as reviewed patches under `patches/blink/`.
