#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"

persistent="${LONGVIEW_PERSISTENT_WORKSPACE:-$HOME/LongViewChromiumBuild}"
mkdir -p "$persistent/tmp"
free_kb="$(df -Pk "$persistent" | awk 'NR==2{print $4}')"
if [ "$free_kb" -lt $((150*1024*1024)) ]; then
  echo "The persistent Apple Silicon builder needs at least 150 GiB free; found $((free_kb/1024/1024)) GiB." >&2
  exit 78
fi

# Derive the self-hosted builder from the audited v4 build path while removing
# only the hosted-image cleanup/preflight block. No user SDKs or caches are
# deleted. A persistent RUNNER_TEMP lets subsequent runs reuse Chromium source
# and the output directory for incremental compilation.
source_script="$GITHUB_WORKSPACE/tools/ci/build_macos_blink_native_alpha_v4.sh"
derived="$persistent/tmp/longview-native-self-hosted-builder.sh"
SOURCE="$source_script" OUTPUT="$derived" python3 - <<'PY'
from pathlib import Path
import os
lines=Path(os.environ['SOURCE']).read_text(encoding='utf-8').splitlines()
out=[]
skipping=False
found_start=False
found_end=False
for line in lines:
    if line == 'section "Reclaim hosted Apple Silicon capacity"':
        skipping=True
        found_start=True
        continue
    if skipping and line == 'section "Shallow-fetch the exact pinned Chromium source"':
        skipping=False
        found_end=True
        out.append(line)
        continue
    if skipping:
        continue
    if line == 'workspace="$RUNNER_TEMP/longview-native-v4"':
        out.append('workspace="${LONGVIEW_PERSISTENT_WORKSPACE}/native-v4"')
        continue
    if line == 'git clone --depth 1 https://chromium.googlesource.com/chromium/tools/depot_tools.git "$depot"':
        out.append('if [ ! -d "$depot/.git" ]; then git clone --depth 1 https://chromium.googlesource.com/chromium/tools/depot_tools.git "$depot"; fi')
        continue
    if line == 'mkdir -p "$checkout"':
        out.append(line)
        continue
    if line == 'fetch --no-history --nohooks chromium':
        out.extend([
            'if [ ! -d "$source/.git" ]; then',
            '  fetch --no-history --nohooks chromium',
            'fi',
        ])
        continue
    if line == 'autoninja -C "$out" chrome -j 1':
        out.append('autoninja -C "$out" chrome -j "${LONGVIEW_JOBS:-6}"')
        continue
    out.append(line)
if not (found_start and found_end):
    raise SystemExit('hosted cleanup block markers changed')
Path(os.environ['OUTPUT']).write_text('\n'.join(out)+'\n',encoding='utf-8',newline='\n')
PY

export LONGVIEW_PERSISTENT_WORKSPACE="$persistent"
export RUNNER_TEMP="$persistent/tmp"
bash -n "$derived"
exec bash "$derived"
