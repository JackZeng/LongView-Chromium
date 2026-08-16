from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

FEATURE_NAME = "LongViewSegmentLifecycle"
FEATURE_MARKER = "// LongView: document-scoped long-page segment lifecycle observability."
FEATURE_BLOCK = f'''  {{
    {FEATURE_MARKER}
    name: "{FEATURE_NAME}",
    base_feature_status: "disabled",
    public: true,
  }},
'''


@dataclass(frozen=True)
class PatchResult:
    path: Path
    changed: bool
    installed: bool


def _feature_present(text: str) -> bool:
    return f'name: "{FEATURE_NAME}"' in text


def install_runtime_feature(path: Path) -> PatchResult:
    path = path.resolve()
    text = path.read_text(encoding="utf-8")
    if _feature_present(text):
        return PatchResult(path=path, changed=False, installed=True)
    anchor = "  data: [\n"
    if anchor not in text:
        anchor = "data: [\n"
    if anchor not in text:
        raise ValueError(f"Could not find top-level data array in {path}")
    path.write_text(text.replace(anchor, anchor + FEATURE_BLOCK, 1), encoding="utf-8", newline="\n")
    return PatchResult(path=path, changed=True, installed=True)


def remove_runtime_feature(path: Path) -> PatchResult:
    path = path.resolve()
    text = path.read_text(encoding="utf-8")
    if not _feature_present(text):
        return PatchResult(path=path, changed=False, installed=False)
    if FEATURE_BLOCK not in text:
        raise ValueError(f"{FEATURE_NAME} exists in {path}, but it was not installed by LongView; refusing removal")
    path.write_text(text.replace(FEATURE_BLOCK, "", 1), encoding="utf-8", newline="\n")
    return PatchResult(path=path, changed=True, installed=False)


def feature_metadata(path: Path) -> dict[str, object]:
    return {
        "feature": FEATURE_NAME,
        "path": str(path.resolve()),
        "installed": _feature_present(path.read_text(encoding="utf-8")),
        "default": "disabled",
        "source": "runtime_enabled_features.json5",
    }


def write_metadata(path: Path, destination: Path) -> None:
    destination.write_text(json.dumps(feature_metadata(path), indent=2) + "\n", encoding="utf-8")
