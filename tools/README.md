# LongView developer tools

`longview.py` is the cross-platform entry point for the v0.1 Chromium distribution.

```text
doctor      check tools, platform, workspace and disk capacity
fetch       install depot_tools, fetch Chromium and pin the exact revision
sync        reset the checkout and dependencies to the pinned revision
build       generate GN output and run autoninja
run         launch Chromium with an isolated profile and LongView runtime
package     create a developer bundle or an unsigned macOS app bundle
benchmark   run the deterministic conversation benchmark
```

The workspace defaults to `.longview/` and can be changed with `--workspace` or `LONGVIEW_WORKSPACE`.

Examples:

```bash
python3 tools/longview.py doctor
python3 tools/longview.py fetch
python3 tools/longview.py build --profile longview-dev
python3 tools/longview.py run https://chatgpt.com/
python3 tools/longview.py package --mac-app
```

Additional tools:

- `validate_repository.py`: validates versions, JSON, local links, HTML assets and required project layout.
- `validate_extension.py`: validates the MV3 manifest, CSP invariants and content-script order.
- `smoke_chromium.mjs`: starts a real browser through CDP and asserts that both HOT and COLD segments exist.

The Python package under `longview_tools/` intentionally uses only the standard library.
