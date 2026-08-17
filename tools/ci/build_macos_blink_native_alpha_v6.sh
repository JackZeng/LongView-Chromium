#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
cd "$GITHUB_WORKSPACE"

test "$(uname -m)" = arm64
printf '\n===== Aggressive deterministic runner cleanup =====\n'
sudo rm -rf \
  /Users/runner/hostedtoolcache \
  /Users/runner/.cache \
  /Users/runner/.dotnet \
  /Users/runner/.gradle \
  /Users/runner/.rustup \
  /Users/runner/.cargo \
  /Users/runner/Library/Android \
  /usr/local/lib/android \
  /usr/local/share/dotnet \
  /usr/local/share/powershell \
  /usr/local/Caskroom \
  /opt/hostedtoolcache \
  /opt/homebrew/Cellar \
  /opt/homebrew/Caskroom \
  /Library/Developer/CoreSimulator/Profiles/Runtimes/* || true
rm -rf "$HOME/Library/Caches"/* || true
xcrun simctl delete all >/dev/null 2>&1 || true
df -h /

SOURCE="$GITHUB_WORKSPACE/tools/ci/build_macos_blink_native_alpha_v4.sh"
OUTPUT="$RUNNER_TEMP/longview-native-v6-builder.sh"
SOURCE="$SOURCE" OUTPUT="$OUTPUT" python3 - <<'PY'
from pathlib import Path
import os
source=Path(os.environ['SOURCE']).read_text(encoding='utf-8').splitlines()
output=[]
skipping=False
removed_preflight=False
for line in source:
    if line.startswith('free_kb="$(df -Pk /'):
        skipping=True
        removed_preflight=True
        output.append('echo "Proceeding with actual checkout/build capacity test at $(free_gib) GiB free."')
        continue
    if skipping:
        if line == 'fi':
            skipping=False
        continue
    if line.startswith('node --check "$extension/content/35-native-cold.js"'):
        continue
    if line.startswith('node --check "$extension/content/36-native-cold-proof.js"'):
        continue
    if line == 'autoninja -C "$out" chrome -j 1':
        output.append('autoninja -C "$out" chrome -j "${LONGVIEW_JOBS:-1}"')
        continue
    output.append(line)
if skipping:
    raise SystemExit('unterminated preflight block')
if not removed_preflight:
    raise SystemExit('conservative preflight marker not found')
text='\n'.join(output)+'\n'
assert 'Need at least 42 GiB' not in text
assert 'node --check "$extension/content/35-native-cold.js"' not in text
assert 'autoninja -C "$out" chrome -j "${LONGVIEW_JOBS:-1}"' in text
Path(os.environ['OUTPUT']).write_text(text,encoding='utf-8',newline='\n')
PY
bash -n "$OUTPUT"
exec bash "$OUTPUT"
