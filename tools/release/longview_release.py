#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$")
PLATFORMS = {"macos", "windows", "linux"}
ARCHES = {"x64", "arm64"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def require_semver(value: str) -> str:
    if not SEMVER.fullmatch(value):
        raise ValueError(f"invalid semantic version: {value}")
    return value


def canonical_json(payload: object) -> bytes:
    return (json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode("utf-8")


@dataclass(frozen=True)
class Artifact:
    platform: str
    arch: str
    filename: str
    url: str
    sha256: str
    size: int
    signature_url: str | None = None

    def validate(self) -> None:
        if self.platform not in PLATFORMS:
            raise ValueError(f"unsupported platform: {self.platform}")
        if self.arch not in ARCHES:
            raise ValueError(f"unsupported architecture: {self.arch}")
        if not re.fullmatch(r"[0-9a-f]{64}", self.sha256):
            raise ValueError(f"invalid sha256 for {self.filename}")
        if self.size <= 0:
            raise ValueError(f"invalid artifact size for {self.filename}")
        if not self.url.startswith("https://"):
            raise ValueError(f"artifact URL must use HTTPS: {self.url}")
        if self.signature_url and not self.signature_url.startswith("https://"):
            raise ValueError(f"signature URL must use HTTPS: {self.signature_url}")


def split_artifact_spec(spec: str) -> tuple[str, str, str, str | None]:
    # platform:arch:path[:https://signature-url]
    # Only the two structural prefixes are split. This preserves
    # Windows drive letters, while the optional signature URL is
    # identified by its mandatory HTTPS scheme.
    parts = spec.split(":", 2)
    if len(parts) != 3:
        raise ValueError("artifact must be platform:arch:path[:https://signature-url]")
    target_platform, arch, remainder = parts
    signature_match = re.search(r":(https://.+)$", remainder)
    if signature_match:
        raw_path = remainder[:signature_match.start()]
        signature_url = signature_match.group(1)
    else:
        raw_path = remainder
        signature_url = None
    if not raw_path:
        raise ValueError("artifact path must not be empty")
    return target_platform, arch, raw_path, signature_url


def parse_artifact_spec(spec: str, base_url: str) -> Artifact:
    target_platform, arch, raw_path, signature_url = split_artifact_spec(spec)
    path = Path(raw_path).resolve()
    if not path.is_file():
        raise FileNotFoundError(path)
    filename = path.name
    url = f"{base_url.rstrip('/')}/{filename}"
    artifact = Artifact(
        platform=target_platform,
        arch=arch,
        filename=filename,
        url=url,
        sha256=sha256_file(path),
        size=path.stat().st_size,
        signature_url=signature_url,
    )
    artifact.validate()
    return artifact


def build_manifest(*, version: str, channel: str, base_url: str,
                   artifact_specs: Iterable[str], minimum_version: str | None,
                   rollout_percent: int, commit: str | None) -> dict:
    require_semver(version)
    if minimum_version:
        require_semver(minimum_version)
    if not re.fullmatch(r"[a-z][a-z0-9-]{0,31}", channel):
        raise ValueError(f"invalid channel: {channel}")
    if not base_url.startswith("https://"):
        raise ValueError("base URL must use HTTPS")
    if not 0 <= rollout_percent <= 100:
        raise ValueError("rollout percent must be between 0 and 100")
    artifacts = [parse_artifact_spec(spec, base_url) for spec in artifact_specs]
    if not artifacts:
        raise ValueError("at least one artifact is required")
    keys = {(item.platform, item.arch) for item in artifacts}
    if len(keys) != len(artifacts):
        raise ValueError("duplicate platform/architecture artifact")
    return {
        "schemaVersion": 1,
        "product": "LongView Chromium",
        "channel": channel,
        "version": version,
        "minimumVersion": minimum_version,
        "generatedAt": utc_now(),
        "commit": commit,
        "rolloutPercent": rollout_percent,
        "artifacts": [asdict(item) for item in artifacts],
    }


def validate_manifest(payload: dict) -> None:
    if payload.get("schemaVersion") != 1:
        raise ValueError("unsupported release manifest schema")
    require_semver(str(payload.get("version", "")))
    minimum = payload.get("minimumVersion")
    if minimum is not None:
        require_semver(str(minimum))
    rollout = payload.get("rolloutPercent")
    if not isinstance(rollout, int) or not 0 <= rollout <= 100:
        raise ValueError("invalid rolloutPercent")
    artifacts = payload.get("artifacts")
    if not isinstance(artifacts, list) or not artifacts:
        raise ValueError("release manifest has no artifacts")
    seen: set[tuple[str, str]] = set()
    for raw in artifacts:
        artifact = Artifact(
            platform=str(raw.get("platform", "")),
            arch=str(raw.get("arch", "")),
            filename=str(raw.get("filename", "")),
            url=str(raw.get("url", "")),
            sha256=str(raw.get("sha256", "")),
            size=int(raw.get("size", 0)),
            signature_url=raw.get("signature_url"),
        )
        artifact.validate()
        key = (artifact.platform, artifact.arch)
        if key in seen:
            raise ValueError(f"duplicate artifact: {key}")
        seen.add(key)


def sign_file(path: Path, private_key: Path, output: Path) -> None:
    command = [
        "openssl", "dgst", "-sha256", "-sign", str(private_key),
        "-out", str(output), str(path),
    ]
    subprocess.run(command, check=True)


def verify_signature(path: Path, public_key: Path, signature: Path) -> None:
    command = [
        "openssl", "dgst", "-sha256", "-verify", str(public_key),
        "-signature", str(signature), str(path),
    ]
    subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(canonical_json(payload))


def command_manifest(args: argparse.Namespace) -> int:
    payload = build_manifest(
        version=args.version,
        channel=args.channel,
        base_url=args.base_url,
        artifact_specs=args.artifact,
        minimum_version=args.minimum_version,
        rollout_percent=args.rollout_percent,
        commit=args.commit,
    )
    write_json(args.output, payload)
    if args.signing_key:
        sign_file(args.output, args.signing_key, args.output.with_suffix(args.output.suffix + ".sig"))
    print(json.dumps({"output": str(args.output), "artifacts": len(payload["artifacts"])}))
    return 0


def command_verify(args: argparse.Namespace) -> int:
    payload = json.loads(args.manifest.read_text(encoding="utf-8"))
    validate_manifest(payload)
    if args.public_key or args.signature:
        if not args.public_key or not args.signature:
            raise ValueError("--public-key and --signature must be supplied together")
        verify_signature(args.manifest, args.public_key, args.signature)
    if args.artifact_dir:
        for item in payload["artifacts"]:
            path = args.artifact_dir / item["filename"]
            if not path.is_file():
                raise FileNotFoundError(path)
            if path.stat().st_size != item["size"]:
                raise ValueError(f"size mismatch: {path}")
            if sha256_file(path) != item["sha256"]:
                raise ValueError(f"sha256 mismatch: {path}")
    print(json.dumps({"valid": True, "version": payload["version"], "channel": payload["channel"]}))
    return 0


def command_feed(args: argparse.Namespace) -> int:
    manifests = []
    for path in args.manifest:
        payload = json.loads(path.read_text(encoding="utf-8"))
        validate_manifest(payload)
        manifests.append({
            "version": payload["version"],
            "generatedAt": payload["generatedAt"],
            "manifestUrl": f"{args.base_url.rstrip('/')}/{path.name}",
            "manifestSha256": sha256_file(path),
            "rolloutPercent": payload["rolloutPercent"],
        })
    feed = {
        "schemaVersion": 1,
        "product": "LongView Chromium",
        "channel": args.channel,
        "generatedAt": utc_now(),
        "releases": manifests,
    }
    write_json(args.output, feed)
    print(json.dumps({"output": str(args.output), "releases": len(manifests)}))
    return 0


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="LongView release manifest and update-feed tooling")
    sub = parser.add_subparsers(dest="command", required=True)

    manifest = sub.add_parser("manifest")
    manifest.add_argument("--version", required=True)
    manifest.add_argument("--channel", default="stable")
    manifest.add_argument("--base-url", required=True)
    manifest.add_argument("--artifact", action="append", required=True)
    manifest.add_argument("--minimum-version")
    manifest.add_argument("--rollout-percent", type=int, default=100)
    manifest.add_argument("--commit")
    manifest.add_argument("--output", type=Path, required=True)
    manifest.add_argument("--signing-key", type=Path)
    manifest.set_defaults(func=command_manifest)

    verify = sub.add_parser("verify")
    verify.add_argument("manifest", type=Path)
    verify.add_argument("--artifact-dir", type=Path)
    verify.add_argument("--public-key", type=Path)
    verify.add_argument("--signature", type=Path)
    verify.set_defaults(func=command_verify)

    feed = sub.add_parser("feed")
    feed.add_argument("--channel", default="stable")
    feed.add_argument("--base-url", required=True)
    feed.add_argument("--manifest", action="append", type=Path, required=True)
    feed.add_argument("--output", type=Path, required=True)
    feed.set_defaults(func=command_feed)
    return parser


def main(argv: list[str] | None = None) -> int:
    try:
        args = make_parser().parse_args(argv)
        return int(args.func(args))
    except (OSError, ValueError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        print(f"release error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
