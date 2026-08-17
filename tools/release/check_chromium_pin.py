#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path

DEFAULT_ENDPOINT = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json"


def newer_version(a: str, b: str) -> bool:
    return tuple(int(part) for part in a.split(".")) > tuple(int(part) for part in b.split("."))


def evaluate(pin: dict, latest_payload: dict) -> dict:
    latest = latest_payload["channels"]["Stable"]["version"]
    current = pin["version"]
    return {
        "current": current,
        "latestStable": latest,
        "updateAvailable": newer_version(latest, current),
        "currentCommit": pin["commit"],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pin", type=Path, default=Path("chromium.version"))
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--fixture", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    pin = json.loads(args.pin.read_text(encoding="utf-8"))
    if args.fixture:
        latest = json.loads(args.fixture.read_text(encoding="utf-8"))
    else:
        with urllib.request.urlopen(args.endpoint, timeout=30) as response:
            latest = json.load(response)
    result = evaluate(pin, latest)
    encoded = json.dumps(result, indent=2) + "\n"
    if args.output:
        args.output.write_text(encoded, encoding="utf-8")
    print(encoded, end="")
    return 10 if result["updateAvailable"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
