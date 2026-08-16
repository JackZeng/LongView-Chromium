#!/usr/bin/env python3
"""Copy the LongView native policy overlay into a Chromium checkout."""

from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
OVERLAY = ROOT / "chromium_overlay" / "longview"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("chromium_src", help="Path to Chromium's src directory")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    chromium_src = Path(args.chromium_src).expanduser().resolve()
    if not (chromium_src / "chrome" / "VERSION").exists():
        raise SystemExit(f"{chromium_src} does not look like Chromium src")

    destination = chromium_src / "longview"
    if destination.exists():
        if not args.force:
            raise SystemExit(f"{destination} already exists; pass --force to replace it")
        shutil.rmtree(destination)
    shutil.copytree(OVERLAY, destination)
    shutil.copy2(ROOT / "chromium_overlay" / "BUILD.gn", destination / "BUILD.gn")

    print(f"Installed native LongView overlay at {destination}")
    print("GN target: //longview:longview_policy_tests")
    print("Build with: autoninja -C out/LongView longview_policy_tests")
    return 0


if __name__ == "__main__":
    sys.exit(main())
