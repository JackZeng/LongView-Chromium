#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
EXTENSION = REPO / "product" / "extension"


def fail(message: str) -> None:
    print(f"extension validation failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def referenced_paths(manifest: dict) -> set[str]:
    paths: set[str] = set()
    paths.add(manifest["background"]["service_worker"])
    paths.add(manifest["action"]["default_popup"])
    paths.add(manifest["options_page"])
    paths.update(manifest.get("icons", {}).values())
    for script in manifest.get("content_scripts", []):
        paths.update(script.get("js", []))
        paths.update(script.get("css", []))
    return paths


def main() -> int:
    manifest_path = EXTENSION / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("manifest_version") != 3:
        fail("manifest_version must be 3")
    repo_version = (REPO / "VERSION").read_text(encoding="utf-8").strip()
    if manifest.get("version") != repo_version:
        fail(f"manifest version {manifest.get('version')} does not match VERSION {repo_version}")

    for relative in referenced_paths(manifest):
        path = EXTENSION / relative
        if not path.is_file():
            fail(f"manifest references missing file: {relative}")

    for html in EXTENSION.rglob("*.html"):
        text = html.read_text(encoding="utf-8")
        if re.search(r"<script(?:\s[^>]*)?>\s*[^<\s]", text, flags=re.IGNORECASE):
            fail(f"inline script is not allowed by MV3 CSP: {html.relative_to(EXTENSION)}")
        if re.search(r"\son[a-z]+\s*=", text, flags=re.IGNORECASE):
            fail(f"inline event handler is not allowed: {html.relative_to(EXTENSION)}")

    content_files = [path for block in manifest["content_scripts"] for path in block.get("js", [])]
    if content_files[0] != "shared/core.js" or content_files[-1] != "content/50-bootstrap.js":
        fail("content script load order does not preserve core-first/bootstrap-last invariants")

    print(f"Validated LongView extension {repo_version}: {len(referenced_paths(manifest))} referenced files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
