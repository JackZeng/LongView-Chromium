#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
import tomllib
from pathlib import Path

from validate_extension import main as validate_extension


REPO = Path(__file__).resolve().parents[1]


def fail(message: str) -> None:
    print(f"repository validation failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def load_json(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"invalid JSON {path.relative_to(REPO)}: {error}")


def validate_versions() -> str:
    version = (REPO / "VERSION").read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        fail(f"VERSION is not semantic x.y.z: {version!r}")

    package = load_json(REPO / "package.json")
    manifest = load_json(REPO / "product/extension/manifest.json")
    pyproject = tomllib.loads((REPO / "pyproject.toml").read_text(encoding="utf-8"))
    versions = {
        "package.json": package.get("version"),
        "manifest.json": manifest.get("version"),
        "pyproject.toml": pyproject.get("project", {}).get("version"),
    }
    for source, value in versions.items():
        if value != version:
            fail(f"{source} version {value!r} does not match VERSION {version!r}")

    namespace = (REPO / "product/extension/content/00-namespace.js").read_text(encoding="utf-8")
    if f'version: "{version}"' not in namespace:
        fail("content-script namespace version does not match VERSION")
    return version


def validate_chromium_pin() -> None:
    pin = load_json(REPO / "chromium.version")
    version = str(pin.get("version", ""))
    commit = str(pin.get("commit", ""))
    tag = str(pin.get("tag", ""))
    if tag != f"refs/tags/{version}":
        fail("chromium.version tag must exactly match its version")
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        fail("chromium.version commit must be a 40-character lowercase SHA")
    if not str(pin.get("source", "")).endswith(f"/refs/tags/{version}"):
        fail("chromium.version source must point to the pinned tag")


def validate_json_files() -> None:
    for path in sorted(REPO.rglob("*.json")):
        if any(part in {"node_modules", "build", ".longview"} for part in path.parts):
            continue
        load_json(path)


def validate_html_assets() -> None:
    for html in sorted(REPO.rglob("*.html")):
        if any(part in {"node_modules", "build", ".longview"} for part in html.parts):
            continue
        text = html.read_text(encoding="utf-8")
        for match in re.finditer(r'(?:src|href)="([^"#?]+)"', text):
            reference = match.group(1)
            if reference.startswith(("http://", "https://", "data:", "chrome-extension://")):
                continue
            target = (html.parent / reference).resolve()
            if not target.is_file():
                fail(f"{html.relative_to(REPO)} references missing asset {reference}")


def validate_markdown_links() -> None:
    pattern = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
    for markdown in sorted(REPO.rglob("*.md")):
        if any(part in {"node_modules", "build", ".longview"} for part in markdown.parts):
            continue
        text = markdown.read_text(encoding="utf-8")
        for reference in pattern.findall(text):
            reference = reference.strip().split("#", 1)[0]
            if not reference or reference.startswith(("http://", "https://", "mailto:")):
                continue
            target = (markdown.parent / reference).resolve()
            if not target.exists():
                fail(f"{markdown.relative_to(REPO)} links to missing path {reference}")


def validate_required_layout() -> None:
    required = [
        "README.md",
        "chromium.version",
        "configs/gn/baseline.gn",
        "configs/gn/longview-dev.gn",
        "configs/gn/longview-release.gn",
        "product/extension/manifest.json",
        "benchmarks/fixtures/conversation/index.html",
        "benchmarks/runner/runner.mjs",
        "src/native/CMakeLists.txt",
        "docs/IMPLEMENTATION_STATUS.md",
        ".github/workflows/ci.yml",
    ]
    missing = [relative for relative in required if not (REPO / relative).is_file()]
    if missing:
        fail(f"required files are missing: {', '.join(missing)}")


def main() -> int:
    validate_required_layout()
    version = validate_versions()
    validate_chromium_pin()
    validate_json_files()
    validate_html_assets()
    validate_markdown_links()
    validate_extension()
    print(f"Validated LongView Chromium repository {version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
