from __future__ import annotations

import json
import os
import plistlib
import shutil
import stat
from pathlib import Path

from .config import Paths, browser_binary, host_platform


def _copy_extension(paths: Paths, destination: Path) -> Path:
    target = destination / "longview-extension"
    shutil.copytree(paths.extension, target, dirs_exist_ok=True)
    return target


def package_developer_bundle(paths: Paths, output_dir: str, version: str, destination: Path) -> Path:
    platform_name = host_platform()
    bundle = destination / f"longview-chromium-{version}-{platform_name}"
    if bundle.exists():
        shutil.rmtree(bundle)
    bundle.mkdir(parents=True)
    extension = _copy_extension(paths, bundle)
    browser = browser_binary(paths.chromium_src, output_dir)
    if not browser.exists():
        raise FileNotFoundError(f"Chromium binary not found: {browser}. Build it first.")

    metadata = {
        "longviewVersion": version,
        "platform": platform_name,
        "browser": str(browser),
        "extension": str(extension),
        "kind": "developer-bundle",
    }
    (bundle / "bundle.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    if platform_name == "win":
        launcher = bundle / "LongView Chromium.cmd"
        launcher.write_text(
            "@echo off\r\n"
            "setlocal\r\n"
            f'"{browser}" --user-data-dir="%~dp0profile" '
            '--disable-extensions-except="%~dp0longview-extension" '
            '--load-extension="%~dp0longview-extension" --no-first-run %*\r\n',
            encoding="utf-8",
        )
    else:
        launcher = bundle / "longview-chromium"
        launcher.write_text(
            "#!/usr/bin/env sh\nset -eu\n"
            'HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\n'
            f'exec "{browser}" --user-data-dir="$HERE/profile" '
            '--disable-extensions-except="$HERE/longview-extension" '
            '--load-extension="$HERE/longview-extension" --no-first-run "$@"\n',
            encoding="utf-8",
        )
        launcher.chmod(launcher.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return bundle


def package_macos_app(paths: Paths, output_dir: str, version: str, destination: Path) -> Path:
    if host_platform() != "mac":
        raise RuntimeError("A macOS app bundle can only be packaged on macOS")
    source_app = paths.chromium_src / "out" / output_dir / "Chromium.app"
    if not source_app.exists():
        raise FileNotFoundError(f"Chromium.app not found: {source_app}")

    app = destination / "LongView Chromium.app"
    if app.exists():
        shutil.rmtree(app)
    resources = app / "Contents" / "Resources"
    macos = app / "Contents" / "MacOS"
    resources.mkdir(parents=True)
    macos.mkdir(parents=True)
    shutil.copytree(source_app, resources / "Chromium.app")
    shutil.copytree(paths.extension, resources / "longview-extension")

    executable = macos / "LongView Chromium"
    executable.write_text(
        "#!/bin/sh\nset -eu\n"
        'ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)\n'
        'exec "$ROOT/Resources/Chromium.app/Contents/MacOS/Chromium" '
        '--user-data-dir="$HOME/Library/Application Support/LongView Chromium" '
        '--disable-extensions-except="$ROOT/Resources/longview-extension" '
        '--load-extension="$ROOT/Resources/longview-extension" --no-first-run "$@"\n',
        encoding="utf-8",
    )
    executable.chmod(executable.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    info = {
        "CFBundleDisplayName": "LongView Chromium",
        "CFBundleExecutable": "LongView Chromium",
        "CFBundleIdentifier": "org.longview.chromium",
        "CFBundleInfoDictionaryVersion": "6.0",
        "CFBundleName": "LongView Chromium",
        "CFBundlePackageType": "APPL",
        "CFBundleShortVersionString": version,
        "CFBundleVersion": version,
        "LSMinimumSystemVersion": "12.0",
        "NSHighResolutionCapable": True,
    }
    with (app / "Contents" / "Info.plist").open("wb") as file:
        plistlib.dump(info, file)
    return app
