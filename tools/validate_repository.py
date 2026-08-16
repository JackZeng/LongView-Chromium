#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
import tomllib
from pathlib import Path

from generate_source_manifest import build_manifest
from validate_extension import main as validate_extension

REPO = Path(__file__).resolve().parents[1]
FORBIDDEN_RELEASE_PATHS = [
    ".longview-bootstrap", ".phase2-patch",
    ".github/workflows/promote-native-source.yml",
    ".github/workflows/promote-phase2.yml",
]


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


def ignored(path: Path) -> bool:
    return any(part in {"node_modules", "build", ".longview", "benchmark-results", "__pycache__"} for part in path.parts)


def validate_json_files() -> None:
    for path in sorted(REPO.rglob("*.json")):
        if not ignored(path):
            load_json(path)


def validate_html_assets() -> None:
    for html in sorted(REPO.rglob("*.html")):
        if ignored(html):
            continue
        for reference in re.findall(r'(?:src|href)="([^"#?]+)"', html.read_text(encoding="utf-8")):
            if reference.startswith(("http://", "https://", "data:", "chrome-extension://")):
                continue
            if not (html.parent / reference).resolve().is_file():
                fail(f"{html.relative_to(REPO)} references missing asset {reference}")


def validate_markdown_links() -> None:
    pattern = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
    for markdown in sorted(REPO.rglob("*.md")):
        if ignored(markdown):
            continue
        for reference in pattern.findall(markdown.read_text(encoding="utf-8")):
            reference = reference.strip().split("#", 1)[0]
            if not reference or reference.startswith(("http://", "https://", "mailto:")):
                continue
            if not (markdown.parent / reference).resolve().exists():
                fail(f"{markdown.relative_to(REPO)} links to missing path {reference}")


def validate_required_layout() -> None:
    required = [
        "README.md", "chromium.version", "chromium_overlay/BUILD.gn",
        "chromium_overlay/blink_feature_probe.cc", "configs/gn/baseline.gn",
        "configs/gn/longview-dev.gn", "configs/gn/longview-release.gn",
        "product/extension/manifest.json", "benchmarks/fixtures/conversation/index.html",
        "benchmarks/runner/runner.mjs", "benchmarks/runner/campaign.mjs",
        "benchmarks/runner/cdp.mjs", "src/native/CMakeLists.txt",
        "src/native/include/longview/policy_engine.h", "tools/generate_source_manifest.py",
        "tools/longview_tools/blink_patch.py", "tools/longview_tools/overlay.py",
        "docs/EVIDENCE_CAMPAIGN.md", "docs/BLINK_NATIVE_PHASE3.md",
        ".github/workflows/ci.yml",
    ]
    missing = [relative for relative in required if not (REPO / relative).is_file()]
    if missing:
        fail(f"required files are missing: {', '.join(missing)}")
    forbidden = [relative for relative in FORBIDDEN_RELEASE_PATHS if (REPO / relative).exists()]
    if forbidden:
        fail(f"transport/bootstrap artifacts remain: {', '.join(forbidden)}")


def validate_manifest() -> None:
    path = REPO / "SOURCE_MANIFEST.sha256"
    if not path.is_file():
        fail("SOURCE_MANIFEST.sha256 is missing")
    if path.read_text(encoding="utf-8") != build_manifest(REPO):
        fail("SOURCE_MANIFEST.sha256 is stale; run tools/generate_source_manifest.py")


def main() -> int:
    validate_required_layout()
    version = validate_versions()
    validate_chromium_pin()
    validate_json_files()
    validate_html_assets()
    validate_markdown_links()
    validate_extension()
    validate_manifest()
    print(f"Validated LongView Chromium repository {version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
