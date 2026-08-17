#!/usr/bin/env python3
from __future__ import annotations
import argparse
import os
import platform
from pathlib import Path


def locate(workspace: Path, output: str, kind: str) -> Path:
    build = workspace.resolve() / "src" / "out" / output
    system = platform.system().lower()
    if system == "darwin":
        app = build / "Chromium.app"
        binary = app / "Contents" / "MacOS" / "Chromium"
        distribution = app
    elif system == "windows":
        binary = build / "chrome.exe"
        distribution = build
        app = build
    elif system == "linux":
        binary = build / "chrome"
        distribution = build
        app = build
    else:
        raise ValueError(f"unsupported platform: {platform.system()}")
    result = {"binary": binary, "app": app, "distribution": distribution}[kind]
    if not result.exists():
        raise FileNotFoundError(result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Resolve a built LongView Chromium path")
    parser.add_argument("--workspace", type=Path, default=Path(os.environ.get("LONGVIEW_WORKSPACE", ".longview")))
    parser.add_argument("--output", default="LongView")
    parser.add_argument("--kind", choices=["binary", "app", "distribution"], default="binary")
    args = parser.parse_args()
    try:
        print(locate(args.workspace, args.output, args.kind))
        return 0
    except (ValueError, FileNotFoundError) as error:
        print(f"build location error: {error}", file=__import__("sys").stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
