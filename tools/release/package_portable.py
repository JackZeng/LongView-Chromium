#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import stat
import sys
import tempfile
import zipfile
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_arcname(root: Path, path: Path) -> str:
    relative = path.resolve().relative_to(root.resolve())
    if any(part in {"..", ""} for part in relative.parts):
        raise ValueError(f"unsafe archive path: {path}")
    return relative.as_posix()


def package(source: Path, output: Path, metadata: dict) -> dict:
    if not source.is_dir():
        raise FileNotFoundError(source)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=output.parent, suffix=".zip", delete=False) as temporary:
        temp_path = Path(temporary.name)
    try:
        with zipfile.ZipFile(temp_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for path in sorted(source.rglob("*")):
                if path.is_symlink():
                    raise ValueError(f"symlinks are not allowed in portable packages: {path}")
                if not path.is_file():
                    continue
                info = zipfile.ZipInfo(safe_arcname(source, path))
                info.date_time = (1980, 1, 1, 0, 0, 0)
                mode = path.stat().st_mode
                info.external_attr = (stat.S_IMODE(mode) & 0xFFFF) << 16
                archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
            metadata_info = zipfile.ZipInfo("LONGVIEW_PACKAGE.json")
            metadata_info.date_time = (1980, 1, 1, 0, 0, 0)
            metadata_info.external_attr = 0o644 << 16
            archive.writestr(
                metadata_info,
                json.dumps(metadata, sort_keys=True, indent=2) + "\n",
                compress_type=zipfile.ZIP_DEFLATED,
                compresslevel=9,
            )
        temp_path.replace(output)
    finally:
        temp_path.unlink(missing_ok=True)
    return {"path": str(output), "size": output.stat().st_size, "sha256": sha256(output)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Create a deterministic LongView portable ZIP")
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--platform", required=True)
    parser.add_argument("--arch", required=True)
    parser.add_argument("--chromium-commit", required=True)
    args = parser.parse_args(argv)
    try:
        result = package(args.source, args.output, {
            "schemaVersion": 1,
            "product": "LongView Chromium",
            "version": args.version,
            "platform": args.platform,
            "arch": args.arch,
            "chromiumCommit": args.chromium_commit,
        })
        print(json.dumps(result))
        return 0
    except (OSError, ValueError) as error:
        print(f"package error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
