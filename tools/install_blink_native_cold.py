#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from longview_tools.config import ChromiumPin
from longview_tools.native_cold_patch import (
    install_native_cold,
    remove_native_cold,
    write_metadata,
)

REPO = Path(__file__).resolve().parents[1]


def git_output(source: Path, *arguments: str) -> str:
    completed = subprocess.run(
        ["git", *arguments],
        cwd=source,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode:
        raise RuntimeError(completed.stderr.strip() or "git command failed")
    return completed.stdout.strip()


def verify_pin(source: Path, skip: bool) -> None:
    if skip:
        return
    pin = ChromiumPin.load(REPO / "chromium.version")
    actual = git_output(source, "rev-parse", "HEAD")
    if actual != pin.commit:
        raise ValueError(
            f"Chromium checkout is {actual}; expected pinned commit {pin.commit}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Install or remove the experimental Blink native COLD layout detach hooks"
    )
    parser.add_argument("--source", type=Path, required=True, help="Chromium src directory")
    parser.add_argument("--remove", action="store_true")
    parser.add_argument("--skip-pin-check", action="store_true")
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--patch-output", type=Path)
    args = parser.parse_args()

    source = args.source.resolve()
    try:
        verify_pin(source, args.skip_pin_check)
        result = remove_native_cold(source) if args.remove else install_native_cold(source)
        if args.metadata:
            write_metadata(result, args.metadata.resolve())
        if args.patch_output and not args.remove:
            patch = git_output(
                source,
                "diff",
                "--binary",
                "--",
                "third_party/blink/renderer/platform/runtime_enabled_features.json5",
                "third_party/blink/renderer/core/dom/node.h",
                "third_party/blink/renderer/core/dom/node.cc",
                "third_party/blink/renderer/core/dom/element.h",
                "third_party/blink/renderer/core/dom/element.cc",
                "third_party/blink/renderer/core/dom/element.idl",
            )
            args.patch_output.parent.mkdir(parents=True, exist_ok=True)
            args.patch_output.write_text(patch + "\n", encoding="utf-8")
        print(json.dumps({
            "changed": result.changed,
            "installed": result.installed,
            "metadata": result.metadata,
        }, indent=2))
        return 0
    except (FileNotFoundError, RuntimeError, ValueError) as error:
        print(f"native cold patch error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
