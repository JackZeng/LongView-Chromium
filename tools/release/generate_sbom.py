#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


def component_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_sbom(root: Path, version: str) -> dict:
    chromium = json.loads((root / "chromium.version").read_text(encoding="utf-8"))
    components = [
        {
            "type": "application",
            "name": "LongView Chromium",
            "version": version,
            "licenses": [{"license": {"id": "BSD-3-Clause"}}],
            "properties": [
                {"name": "longview:source-manifest-sha256", "value": component_hash(root / "SOURCE_MANIFEST.sha256")}
            ],
        },
        {
            "type": "framework",
            "name": "Chromium",
            "version": chromium["version"],
            "purl": f"pkg:generic/chromium@{chromium['version']}?commit={chromium['commit']}",
            "properties": [
                {"name": "longview:upstream-commit", "value": chromium["commit"]},
                {"name": "longview:channel", "value": chromium.get("channel", "stable")},
            ],
        },
    ]
    serial_seed = json.dumps(components, sort_keys=True).encode()
    return {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "serialNumber": "urn:uuid:" + hashlib.sha256(serial_seed).hexdigest()[:32],
        "version": 1,
        "metadata": {
            "timestamp": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "component": components[0],
        },
        "components": components,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--version", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    payload = build_sbom(args.root.resolve(), args.version)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
