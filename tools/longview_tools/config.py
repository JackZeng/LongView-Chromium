from __future__ import annotations

import json
import os
import platform
import shutil
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ChromiumPin:
    version: str
    tag: str
    commit: str
    channel: str

    @classmethod
    def load(cls, path: Path) -> "ChromiumPin":
        payload = json.loads(path.read_text(encoding="utf-8"))
        commit = str(payload["commit"]).strip().lower()
        if len(commit) != 40 or any(character not in "0123456789abcdef" for character in commit):
            raise ValueError(f"Invalid Chromium commit in {path}: {commit!r}")
        return cls(
            version=str(payload["version"]),
            tag=str(payload["tag"]),
            commit=commit,
            channel=str(payload.get("channel", "unknown")),
        )


@dataclass(frozen=True)
class Paths:
    repo: Path
    workspace: Path

    @property
    def depot_tools(self) -> Path:
        return self.workspace / "depot_tools"

    @property
    def chromium_src(self) -> Path:
        return self.workspace / "src"

    @property
    def extension(self) -> Path:
        return self.repo / "product" / "extension"

    @property
    def profiles(self) -> Path:
        return self.workspace / "profiles"

    @classmethod
    def discover(cls, repo: Path, workspace: str | None = None) -> "Paths":
        configured = workspace or os.environ.get("LONGVIEW_WORKSPACE")
        root = Path(configured).expanduser() if configured else repo / ".longview"
        return cls(repo=repo.resolve(), workspace=root.resolve())


def host_platform() -> str:
    value = platform.system().lower()
    if value == "darwin":
        return "mac"
    if value == "windows":
        return "win"
    if value == "linux":
        return "linux"
    raise RuntimeError(f"Unsupported host platform: {platform.system()}")


def browser_binary(chromium_src: Path, output_dir: str) -> Path:
    build = chromium_src / "out" / output_dir
    current = host_platform()
    if current == "mac":
        return build / "Chromium.app" / "Contents" / "MacOS" / "Chromium"
    if current == "win":
        return build / "chrome.exe"
    return build / "chrome"


def depot_tool(paths: Paths, name: str) -> Path:
    suffix = ".bat" if host_platform() == "win" else ""
    local = paths.depot_tools / f"{name}{suffix}"
    if local.exists():
        return local
    resolved = shutil.which(f"{name}{suffix}") or shutil.which(name)
    if resolved:
        return Path(resolved)
    return local
