# Chromium patch layer

LongView does not vendor the Chromium source tree. Native upstream-file changes are stored as reviewable patches pinned to `chromium.version`.

```text
patches/
├── series.json
└── blink/
    ├── README.md
    └── 0001-longview-observability-feature.patch
```

Apply the first candidate:

```bash
python3 tools/longview.py install-blink-observability
```

The installer verifies the exact Chromium commit, checks patch applicability, records metadata, and refuses an unexpected dirty checkout unless `--force` is supplied.

Patch `0001` is intentionally small: it adds a disabled-by-default Blink feature gate. It does not change rendering behavior.
