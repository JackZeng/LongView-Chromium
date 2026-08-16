# Quick start

## Source validation only

```bash
python3 tools/generate_source_manifest.py
python3 tools/validate_repository.py
npm run check:js
npm test
PYTHONPATH=tools python3 -m unittest discover -s tools/tests -v
cmake -S src/native -B build/native -DCMAKE_BUILD_TYPE=Release
cmake --build build/native --parallel 2
ctest --test-dir build/native --output-on-failure
```

## Full native Chromium setup

```bash
python3 tools/longview.py doctor
python3 tools/longview.py fetch
python3 tools/longview.py build --profile longview-dev
python3 tools/longview.py run https://chatgpt.com/
```

## Native policy and Blink gate

```bash
python3 tools/longview.py native-probe --force
```

This installs the policy overlay, applies the disabled-by-default observability feature patch, builds `//longview:segment_policy_test` and `//longview:blink_feature_probe`, and runs both binaries.

## Evidence campaign

```bash
python3 tools/longview.py evidence \
  --turns 100,500,1000,2000 \
  --runs 5 \
  --duration 9000 \
  --stress --stream --trace \
  --output-dir benchmark-results/local
```

Open `benchmark-results/local/REPORT.md` after completion.
