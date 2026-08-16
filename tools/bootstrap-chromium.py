#!/usr/bin/env python3
"""Create a reproducible Chromium checkout at the revision pinned by LongView."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
VERSION_FILE = ROOT / "chromium.version"


def run(command: list[str], cwd: Path | None = None) -> None:
    print("+", " ".join(command))
    subprocess.run(command, cwd=cwd, check=True)


def executable(name: str) -> str:
    candidates = [name, f"{name}.bat"] if os.name == "nt" else [name]
    for candidate in candidates:
        found = shutil.which(candidate)
        if found:
            return found
    raise SystemExit(
        f"Required depot_tools command '{name}' was not found. "
        "Install depot_tools and place it at the front of PATH."
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("workspace", nargs="?", default=str(ROOT / "chromium-src"))
    parser.add_argument("--no-sync", action="store_true", help="Skip gclient sync after checkout")
    args = parser.parse_args()

    version = json.loads(VERSION_FILE.read_text(encoding="utf-8"))
    revision = version["chromium_git_sha"]
    workspace = Path(args.workspace).expanduser().resolve()
    source = workspace / "src"
    workspace.mkdir(parents=True, exist_ok=True)

    fetch = executable("fetch")
    gclient = executable("gclient")

    if not source.exists():
        run([fetch, "--nohooks", "chromium"], cwd=workspace)
    if not (source / ".git").exists():
        raise SystemExit(f"{source} is not a Chromium git checkout")

    run(["git", "fetch", "origin", revision, "--depth=1"], cwd=source)
    run(["git", "checkout", "--detach", revision], cwd=source)
    if not args.no_sync:
        run([gclient, "sync", "--with_branch_heads", "--with_tags", "--no-history"], cwd=workspace)

    print(f"Chromium {version['chromium_version']} is checked out at {revision}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
