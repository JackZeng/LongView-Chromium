# Development workflow

## Branches

Use short-lived branches from `main`:

```text
agent/<description>
```

Keep benchmark/tooling changes separate from deep Chromium patches when possible.

## Required validation

Before opening a PR:

```bash
python3 tools/generate_source_manifest.py
python3 tools/validate_repository.py
npm run check:js
npm test
PYTHONPATH=tools python3 -m unittest discover -s tools/tests -v
python3 -m compileall -q tools
cmake -S src/native -B build/native -DCMAKE_BUILD_TYPE=Release
cmake --build build/native --parallel 2
ctest --test-dir build/native --output-on-failure
```

C++ development builds should also pass strict warnings:

```bash
cmake -S src/native -B build/native-strict -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_CXX_FLAGS="-Wall -Wextra -Werror"
cmake --build build/native-strict --parallel 2
ctest --test-dir build/native-strict --output-on-failure
```

## Performance changes

A performance PR must identify:

- exact Chromium revision;
- LongView commit;
- fixture and scale matrix;
- run count and warm-up policy;
- OS, CPU, RAM, GPU, display refresh, and power mode;
- before/after evidence;
- trace paths or uploaded artifacts;
- compatibility checks.

One attractive trace is not evidence. Prefer repeated runs and report both medians and tail percentiles.

## Chromium patches

Upstream-file modifications live under `patches/`. The install tool applies them to the pinned checkout. Each patch must include:

- a narrow purpose;
- exact expected pin;
- tests or a compile probe;
- explicit non-goals;
- rollback notes.

Do not silently edit the user's Chromium checkout outside the installer. The installer records metadata in the checkout.

## Source integrity

`SOURCE_MANIFEST.sha256` covers normal source files. `.git`, generated outputs, manifest itself, and benchmark results are excluded. The release branch must not contain encoded source carriers or source-promotion workflows.
