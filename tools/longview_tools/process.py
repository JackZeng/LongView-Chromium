from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Iterable, Mapping


def display_command(command: Iterable[str | Path]) -> str:
    return " ".join(f'"{item}"' if " " in str(item) else str(item) for item in command)


def run(
    command: list[str | Path],
    *,
    cwd: Path | None = None,
    env: Mapping[str, str] | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    normalized = [str(item) for item in command]
    print(f"+ {display_command(normalized)}", flush=True)
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)

    if sys.platform == "win32" and normalized[0].lower().endswith((".bat", ".cmd")):
        normalized = ["cmd.exe", "/d", "/s", "/c", *normalized]

    return subprocess.run(
        normalized,
        cwd=str(cwd) if cwd else None,
        env=merged_env,
        check=check,
        text=True,
    )
