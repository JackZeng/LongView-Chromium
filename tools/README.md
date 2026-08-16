# LongView developer tools

`tools/longview.py` is the standard-library-only entry point for the native Chromium distribution.

```text
doctor                       inspect tools, pin, workspace, disk, and overlay state
fetch / sync                 create and reset the pinned Chromium checkout
build / run / package        build and operate the native Chromium distribution
benchmark                    capture one baseline or LongView benchmark
evidence                     run the multi-scale evidence campaign
install-overlay              install the //longview GN policy/probe targets
install-blink-observability  add the disabled LongView Blink runtime feature
native-probe                 install, build, and execute both native probes
remove-*                     restore the checkout to the unmodified state
```

The workspace defaults to `.longview/` and can be changed with `--workspace` or `LONGVIEW_WORKSPACE`.

Examples:

```bash
python3 tools/longview.py doctor
python3 tools/longview.py fetch
python3 tools/longview.py build --profile longview-dev
python3 tools/longview.py run https://chatgpt.com/
python3 tools/longview.py evidence --turns 100,500,1000,2000 --runs 5 --stress --stream
python3 tools/longview.py native-probe --force
```

Additional tools:

- `generate_source_manifest.py`: creates and verifies the clean-source SHA-256 manifest.
- `validate_repository.py`: validates versions, source layout, local links, JSON, MV3 invariants, and the source manifest.
- `validate_extension.py`: validates MV3 permissions, CSP invariants, and content-script ordering.
- `smoke_chromium.mjs`: starts a real Chromium binary through CDP and asserts that LongView reaches HOT and COLD states.

The Python package under `longview_tools/` intentionally uses only the standard library.
