#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"

cd "$GITHUB_WORKSPACE"

printf '\n===== Aggressive hosted-runner cleanup =====\n'
test "$(uname -m)" = arm64
# Keep Xcode and system command-line tools; the Chromium build does not need
# the other preinstalled language ecosystems after checkout has completed.
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

# Reuse the self-contained v4 builder, but remove the conservative preflight
# and post-cleanup Node syntax probes. Repository CI already validates those
# scripts; retaining Node's hosted toolcache would cost several GiB.
temporary="$RUNNER_TEMP/longview-native-v5-builder.sh"
SOURCE="$GITHUB_WORKSPACE/tools/ci/build_macos_blink_native_alpha_v4.sh" OUTPUT="$temporary" python3 - <<'PY'
from pathlib import Path
import os,re
source=Path(os.environ['SOURCE']).read_text(encoding='utf-8')
source=re.sub(
    r'free_kb="\$\(df -Pk / \| awk \'NR==2\{print \$4\}\'\)"\nif \[ "\$free_kb" -lt \$\(\(42\*1024\*1024\)\) \]; then\n  echo "Need at least 42 GiB free after cleanup; found \$\(free_gib\) GiB\." >&2\n  exit 78\nfi\n',
    'echo "Proceeding with actual checkout/build capacity test at $(free_gib) GiB free."\n',
    source,
    count=1,
)
source=source.replace('node --check "$extension/content/35-native-cold.js"\n','')
source=source.replace('node --check "$extension/content/36-native-cold-proof.js"\n','')
source=source.replace('autoninja -C "$out" chrome -j 1','autoninja -C "$out" chrome -j "${LONGVIEW_JOBS:-1}"')
Path(os.environ['OUTPUT']).write_text(source,encoding='utf-8',newline='\n')
PY
bash -n "$temporary"
exec bash "$temporary"
