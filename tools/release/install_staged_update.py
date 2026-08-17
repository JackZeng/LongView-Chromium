#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

from longview_release import sha256_file


def safe_extract(archive_path: Path, destination: Path) -> None:
    with zipfile.ZipFile(archive_path) as archive:
        for info in archive.infolist():
            name = info.filename.replace("\\", "/")
            if name.startswith("/") or any(part in {"", ".", ".."} for part in Path(name).parts):
                raise ValueError(f"unsafe archive entry: {info.filename}")
            mode = (info.external_attr >> 16) & 0o170000
            if mode == 0o120000:
                raise ValueError(f"symlink entry is not allowed: {info.filename}")
            target = (destination / name).resolve()
            if destination.resolve() not in target.parents and target != destination.resolve():
                raise ValueError(f"archive entry escapes destination: {info.filename}")
        archive.extractall(destination)


def read_state(state_path: Path) -> dict:
    state = json.loads(state_path.read_text(encoding="utf-8"))
    if state.get("schemaVersion") != 1 or not state.get("readyToInstall"):
        raise ValueError("staged update is not installable")
    artifact = Path(state["artifact"]).resolve()
    if not artifact.is_file():
        raise FileNotFoundError(artifact)
    if sha256_file(artifact) != state.get("sha256"):
        raise ValueError("staged artifact SHA-256 mismatch")
    return state


def run_health_check(install_dir: Path, command: list[str], timeout: int) -> bool:
    if not command:
        return True
    resolved = [item.replace("{install}", str(install_dir)) for item in command]
    try:
        completed = subprocess.run(resolved, timeout=timeout, check=False)
        return completed.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def install(state_path: Path, install_dir: Path, health_command: list[str], timeout: int) -> dict:
    state = read_state(state_path)
    artifact = Path(state["artifact"]).resolve()
    install_dir = install_dir.resolve()
    parent = install_dir.parent
    parent.mkdir(parents=True, exist_ok=True)
    lock = parent / f".{install_dir.name}.update-lock"
    previous = parent / f".{install_dir.name}.previous"
    with lock.open("x", encoding="utf-8") as lock_file:
        lock_file.write(str(os.getpid()))
    staging = Path(tempfile.mkdtemp(prefix=f".{install_dir.name}.staging-", dir=parent))
    moved_current = False
    try:
        safe_extract(artifact, staging)
        package_meta = staging / "LONGVIEW_PACKAGE.json"
        if package_meta.is_file():
            metadata = json.loads(package_meta.read_text(encoding="utf-8"))
            if metadata.get("version") != state.get("version"):
                raise ValueError("package version does not match staged state")
        if previous.exists():
            shutil.rmtree(previous)
        if install_dir.exists():
            install_dir.replace(previous)
            moved_current = True
        staging.replace(install_dir)
        if not run_health_check(install_dir, health_command, timeout):
            failed = parent / f".{install_dir.name}.failed"
            if failed.exists():
                shutil.rmtree(failed)
            install_dir.replace(failed)
            if moved_current:
                previous.replace(install_dir)
            raise RuntimeError("new installation failed health check; rollback completed")
        result = {
            "schemaVersion": 1,
            "version": state["version"],
            "installedAt": str(install_dir),
            "previousAvailable": previous.exists(),
            "healthCheckPassed": True,
        }
        (install_dir / "LONGVIEW_INSTALL.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        return result
    finally:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        lock.unlink(missing_ok=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Atomically install a verified staged LongView portable update")
    parser.add_argument("state", type=Path, help="staged-update.json")
    parser.add_argument("--install-dir", type=Path, required=True)
    parser.add_argument("--health-command", nargs=argparse.REMAINDER, default=[])
    parser.add_argument("--health-timeout", type=int, default=30)
    args = parser.parse_args(argv)
    try:
        print(json.dumps(install(args.state, args.install_dir, args.health_command, args.health_timeout)))
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(f"install error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
