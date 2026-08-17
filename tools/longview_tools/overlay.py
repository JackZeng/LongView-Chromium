from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from .blink_patch import install_runtime_feature, remove_runtime_feature, write_metadata
from .config import Paths

RUNTIME_FEATURES = Path("third_party/blink/renderer/platform/runtime_enabled_features.json5")


def install_overlay(paths: Paths, version: str, force: bool = False) -> Path:
    source = paths.overlay_source
    engine_source = paths.repo / "src" / "engine"
    destination = paths.overlay_destination
    if not source.is_dir():
        raise FileNotFoundError(f"LongView Chromium overlay is missing: {source}")
    if not engine_source.is_dir():
        raise FileNotFoundError(f"LongView engine contract is missing: {engine_source}")
    if destination.exists():
        if not force:
            raise FileExistsError(f"Overlay destination already exists: {destination}; pass --force to replace it")
        shutil.rmtree(destination)
    shutil.copytree(source, destination)
    shutil.copytree(engine_source, destination / "engine")
    metadata = {
        "version": version,
        "installedAt": datetime.now(timezone.utc).isoformat(),
        "source": str(source.resolve()),
        "engineSource": str(engine_source.resolve()),
        "destination": str(destination.resolve()),
    }
    (destination / "OVERLAY.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return destination


def remove_overlay(paths: Paths) -> bool:
    if not paths.overlay_destination.exists():
        return False
    shutil.rmtree(paths.overlay_destination)
    return True


def install_blink_observability(paths: Paths) -> bool:
    target = paths.chromium_src / RUNTIME_FEATURES
    if not target.is_file():
        raise FileNotFoundError(f"Blink runtime feature file is missing: {target}")
    result = install_runtime_feature(target)
    paths.overlay_destination.mkdir(parents=True, exist_ok=True)
    write_metadata(target, paths.overlay_destination / "BLINK_OBSERVABILITY.json")
    return result.changed


def remove_blink_observability(paths: Paths) -> bool:
    target = paths.chromium_src / RUNTIME_FEATURES
    if not target.is_file():
        return False
    result = remove_runtime_feature(target)
    (paths.overlay_destination / "BLINK_OBSERVABILITY.json").unlink(missing_ok=True)
    return result.changed
