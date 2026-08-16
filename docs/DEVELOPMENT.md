# Development guide

## Branch and commit policy

Use small, measurable changes. Recommended branches:

```text
agent/<description>
experiment/<mechanism>
fix/<compatibility-regression>
```

A performance change should not mix unrelated product UI work. Commit messages should state the mechanism, not an unverified outcome.

## Required local checks

```bash
python3 tools/validate_extension.py
npm run check:js
npm test
PYTHONPATH=tools python3 -m unittest discover -s tools/tests -v
cmake -S src/native -B build/native
cmake --build build/native
ctest --test-dir build/native --output-on-failure
```

When a usable Chromium executable is available without blocking enterprise policy:

```bash
xvfb-run -a node tools/smoke_chromium.mjs --executable /path/to/chromium --turns 200
```

On macOS and Windows, run the smoke page in a normal visible browser as well, because compositor behavior, refresh rate, and input differ from virtual/headless environments.

## Extension architecture rules

- `shared/core.js` contains deterministic policy functions and must load first.
- content scripts load in numeric order.
- `50-bootstrap.js` must load last.
- no inline scripts or event handlers; Manifest V3 CSP is validated.
- no remote code.
- no site DOM deletion.
- every injected inline property must be restorable.
- scrolling must not call `getBoundingClientRect()` on every segment every frame.
- new site adapters require a generic fallback and a fixture/test.

## Performance experiment template

Before implementation, write down:

1. suspected bottleneck;
2. mechanism;
3. expected metric change;
4. fixture and scale;
5. compatibility risk;
6. rollback condition.

After implementation, attach raw results and describe negative findings as well as wins.

## Native migration rules

`src/native` is an executable policy specification, not a parallel permanent implementation. When policy enters Blink:

- preserve unit semantics;
- add Chromium unit/web tests;
- put behavior behind a disabled-by-default feature;
- add trace events for eligibility, transition, forced materialization, and rejection;
- keep the patch series small and rebasing-friendly;
- do not serialize/remove DOM until identity and API semantics are explicitly solved.
