#!/usr/bin/env python3
from __future__ import annotations

import argparse
import difflib
import hashlib
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
EXCLUDED_DIRECTORIES = {
    ".git", ".longview", ".phase2-patch", ".pytest_cache", ".ruff_cache", ".venv",
    "__pycache__", "benchmark-results", "build", "dist", "node_modules",
}
EXCLUDED_FILES = {
    "SOURCE_MANIFEST.sha256",
    ".github/workflows/manifest-refresh.yml",
}


def is_excluded(path: Path, root: Path) -> bool:
    relative = path.relative_to(root)
    if relative.as_posix() in EXCLUDED_FILES:
        return True
    return any(part in EXCLUDED_DIRECTORIES for part in relative.parts)


def iter_source_files(root: Path):
    for path in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix()):
        if is_excluded(path, root) or not path.is_file() or path.is_symlink():
            continue
        yield path


def build_manifest(root: Path) -> str:
    lines: list[str] = []
    for path in iter_source_files(root):
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        lines.append(f"{digest}  {path.relative_to(root).as_posix()}")
    return "\n".join(lines) + "\n"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate or verify SOURCE_MANIFEST.sha256")
    parser.add_argument("--root", type=Path, default=REPO)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    root = args.root.resolve()
    output = (args.output or (root / "SOURCE_MANIFEST.sha256")).resolve()
    generated = build_manifest(root)
    if args.check:
        try:
            existing = output.read_text(encoding="utf-8")
        except FileNotFoundError:
            print(f"missing source manifest: {output}", file=sys.stderr)
            return 1
        if existing != generated:
            diff = difflib.unified_diff(existing.splitlines(), generated.splitlines(), fromfile=str(output), tofile="generated", lineterm="")
            print("\n".join(diff), file=sys.stderr)
            return 1
        print(f"Verified {output.relative_to(root)} ({len(generated.splitlines())} files)")
        return 0
    output.write_text(generated, encoding="utf-8", newline="\n")
    print(f"Wrote {output.relative_to(root)} ({len(generated.splitlines())} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
