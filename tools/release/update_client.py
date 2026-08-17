#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import shutil
import ssl
import sys
import tempfile
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

from longview_release import sha256_file, validate_manifest, verify_signature


def current_target() -> tuple[str, str]:
    system = platform.system().lower()
    target_platform = {"darwin": "macos", "windows": "windows", "linux": "linux"}.get(system)
    machine = platform.machine().lower()
    arch = "arm64" if machine in {"arm64", "aarch64"} else "x64" if machine in {"x86_64", "amd64"} else None
    if not target_platform or not arch:
        raise ValueError(f"unsupported host: {system}/{machine}")
    return target_platform, arch


def rollout_bucket(machine_id: str, channel: str, version: str) -> int:
    digest = hashlib.sha256(f"{machine_id}\0{channel}\0{version}".encode()).digest()
    return int.from_bytes(digest[:8], "big") % 100


def read_machine_id(path: Path) -> str:
    if path.exists():
        value = path.read_text(encoding="utf-8").strip()
        if value:
            return value
    path.parent.mkdir(parents=True, exist_ok=True)
    value = os.urandom(16).hex()
    path.write_text(value + "\n", encoding="utf-8")
    return value


def download_https(url: str, output: Path) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError(f"refusing non-HTTPS URL: {url}")
    context = ssl.create_default_context()
    request = urllib.request.Request(url, headers={"User-Agent": "LongView-Updater/1"})
    with urllib.request.urlopen(request, context=context, timeout=60) as response, output.open("wb") as sink:
        if response.geturl().split(":", 1)[0].lower() != "https":
            raise ValueError("update redirect left HTTPS")
        shutil.copyfileobj(response, sink)


def select_artifact(manifest: dict, target_platform: str, arch: str) -> dict:
    for artifact in manifest["artifacts"]:
        if artifact["platform"] == target_platform and artifact["arch"] == arch:
            return artifact
    raise ValueError(f"no artifact for {target_platform}/{arch}")


def stage_update(args: argparse.Namespace) -> int:
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    validate_manifest(manifest)
    target_platform, arch = current_target() if not args.platform else (args.platform, args.arch)
    machine_id = read_machine_id(args.state_dir / "machine-id")
    bucket = rollout_bucket(machine_id, manifest["channel"], manifest["version"])
    eligible = bucket < manifest["rolloutPercent"]
    if not eligible and not args.force:
        print(json.dumps({"eligible": False, "bucket": bucket, "rolloutPercent": manifest["rolloutPercent"]}))
        return 3
    artifact = select_artifact(manifest, target_platform, arch)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    final = args.output_dir / artifact["filename"]
    with tempfile.NamedTemporaryFile(prefix="longview-update-", dir=args.output_dir, delete=False) as temp:
        temporary = Path(temp.name)
    try:
        if args.local_artifact:
            shutil.copyfile(args.local_artifact, temporary)
        else:
            download_https(artifact["url"], temporary)
        if temporary.stat().st_size != artifact["size"]:
            raise ValueError("downloaded artifact size mismatch")
        if sha256_file(temporary) != artifact["sha256"]:
            raise ValueError("downloaded artifact SHA-256 mismatch")
        if args.public_key:
            if not args.signature:
                raise ValueError("--signature is required with --public-key")
            verify_signature(temporary, args.public_key, args.signature)
        temporary.replace(final)
        state = {
            "schemaVersion": 1,
            "version": manifest["version"],
            "channel": manifest["channel"],
            "platform": target_platform,
            "arch": arch,
            "artifact": str(final),
            "sha256": artifact["sha256"],
            "rolloutBucket": bucket,
            "readyToInstall": True,
        }
        (args.output_dir / "staged-update.json").write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(state))
        return 0
    finally:
        temporary.unlink(missing_ok=True)


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Verify and stage a LongView update without installing it")
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--state-dir", type=Path, default=Path.home() / ".longview-updater")
    parser.add_argument("--platform", choices=["macos", "windows", "linux"])
    parser.add_argument("--arch", choices=["x64", "arm64"])
    parser.add_argument("--local-artifact", type=Path, help="test/offline source; production uses manifest HTTPS URL")
    parser.add_argument("--public-key", type=Path)
    parser.add_argument("--signature", type=Path)
    parser.add_argument("--force", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    try:
        args = make_parser().parse_args(argv)
        if bool(args.platform) != bool(args.arch):
            raise ValueError("--platform and --arch must be supplied together")
        return stage_update(args)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"update error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
