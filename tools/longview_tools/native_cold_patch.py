from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

from .blink_patch import install_runtime_feature, remove_runtime_feature

NODE_DECL_MARKER = "// LongView native-cold layout-tree hooks."
ELEMENT_DECL_MARKER = "// LongView experimental web-facing native-cold probes."
NODE_IMPL_MARKER = "// LongView native-cold Node implementation."
ELEMENT_IMPL_MARKER = "// LongView native-cold Element implementation."
IDL_MARKER = "// LongView Blink Native Cold Alpha."

NODE_DECL_BLOCK = f'''\n  {NODE_DECL_MARKER}\n  uint64_t LongViewCountInclusiveLayoutObjects() const;\n  uint64_t LongViewDetachLayoutTreeForCold();\n'''

ELEMENT_DECL_BLOCK = f'''\n  {ELEMENT_DECL_MARKER}\n  uint64_t longViewDetachDescendantLayoutObjects();\n  uint64_t longViewCountDescendantLayoutObjects();\n'''

IDL_BLOCK = f'''\n    {IDL_MARKER}\n    [RuntimeEnabled=LongViewSegmentLifecycle] unsigned long long longViewDetachDescendantLayoutObjects();\n    [RuntimeEnabled=LongViewSegmentLifecycle] unsigned long long longViewCountDescendantLayoutObjects();\n'''

ELEMENT_IMPL_BLOCK = f'''\n{ELEMENT_IMPL_MARKER}\nuint64_t Element::longViewCountDescendantLayoutObjects() {{\n  if (!RuntimeEnabledFeatures::LongViewSegmentLifecycleEnabled())\n    return 0;\n\n  uint64_t count = 0;\n  for (Node* child = firstChild(); child; child = child->nextSibling())\n    count += child->LongViewCountInclusiveLayoutObjects();\n  return count;\n}}\n\nuint64_t Element::longViewDetachDescendantLayoutObjects() {{\n  if (!RuntimeEnabledFeatures::LongViewSegmentLifecycleEnabled())\n    return 0;\n\n  uint64_t detached = 0;\n  for (Node* child = firstChild(); child;) {{\n    Node* next = child->nextSibling();\n    detached += child->LongViewDetachLayoutTreeForCold();\n    child = next;\n  }}\n  return detached;\n}}\n'''


@dataclass(frozen=True)
class NativeColdPatchResult:
    changed: bool
    installed: bool
    files: tuple[Path, ...]
    metadata: dict[str, object]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _write(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8", newline="\n")


def _insert_standard_include(text: str, include: str) -> str:
    if include in text:
        return text
    lines = text.splitlines(keepends=True)
    insertion = 0
    while insertion < len(lines) and (
        lines[insertion].startswith("//")
        or lines[insertion].startswith("/*")
        or not lines[insertion].strip()
        or lines[insertion].startswith("#pragma")
    ):
        insertion += 1
    lines.insert(insertion, include + "\n")
    return "".join(lines)


def _insert_after_include(text: str, anchor: str, include: str) -> str:
    if include in text:
        return text
    if anchor not in text:
        raise ValueError(f"include anchor not found: {anchor}")
    return text.replace(anchor, anchor + "\n" + include, 1)


def _insert_class_public(text: str, class_pattern: str, block: str, marker: str) -> str:
    if marker in text:
        return text
    match = re.search(class_pattern, text)
    if not match:
        raise ValueError(f"class declaration not found: {class_pattern}")
    public_at = text.find("public:", match.end())
    if public_at < 0:
        raise ValueError("public section not found")
    insertion = public_at + len("public:")
    return text[:insertion] + block + text[insertion:]


def _insert_before_namespace_close(text: str, block: str, marker: str) -> str:
    if marker in text:
        return text
    candidates = ["\n}  // namespace blink", "\n} // namespace blink"]
    position = max(text.rfind(candidate) for candidate in candidates)
    if position < 0:
        raise ValueError("Blink namespace close not found")
    return text[:position] + "\n" + block + text[position:]


def _insert_idl(text: str) -> str:
    if IDL_MARKER in text:
        return text
    position = text.rfind("};")
    if position < 0:
        raise ValueError("Element IDL interface terminator not found")
    return text[:position] + IDL_BLOCK + text[position:]


def _node_impl(node_header: str) -> str:
    if "SetForceReattachLayoutTree" in node_header:
        reattach = "  SetForceReattachLayoutTree();\n"
    elif "SetNeedsReattachLayoutTree" in node_header:
        reattach = "  SetNeedsReattachLayoutTree();\n"
    else:
        raise ValueError("No layout-tree reattach hook found in Node")

    detach_match = re.search(r"DetachLayoutTree\s*\(([^)]*)\)", node_header)
    if not detach_match:
        raise ValueError("DetachLayoutTree declaration not found in Node")
    parameters = detach_match.group(1)
    detach = (
        "  DetachLayoutTree(/*performing_reattach=*/true);\n"
        if "bool" in parameters
        else "  DetachLayoutTree();\n"
    )

    return f'''\n{NODE_IMPL_MARKER}\nuint64_t Node::LongViewCountInclusiveLayoutObjects() const {{\n  uint64_t count = GetLayoutObject() ? 1u : 0u;\n  for (const Node* child = firstChild(); child; child = child->nextSibling())\n    count += child->LongViewCountInclusiveLayoutObjects();\n  return count;\n}}\n\nuint64_t Node::LongViewDetachLayoutTreeForCold() {{\n  const uint64_t detached = LongViewCountInclusiveLayoutObjects();\n{reattach}{detach}  return detached;\n}}\n'''


def _paths(source: Path) -> dict[str, Path]:
    root = source.resolve()
    return {
        "runtime": root / "third_party/blink/renderer/platform/runtime_enabled_features.json5",
        "node_h": root / "third_party/blink/renderer/core/dom/node.h",
        "node_cc": root / "third_party/blink/renderer/core/dom/node.cc",
        "element_h": root / "third_party/blink/renderer/core/dom/element.h",
        "element_cc": root / "third_party/blink/renderer/core/dom/element.cc",
        "element_idl": root / "third_party/blink/renderer/core/dom/element.idl",
    }


def install_native_cold(source: Path) -> NativeColdPatchResult:
    paths = _paths(source)
    missing = [str(path) for path in paths.values() if not path.is_file()]
    if missing:
        raise FileNotFoundError("Missing Chromium source files: " + ", ".join(missing))

    runtime_result = install_runtime_feature(paths["runtime"])
    before = {name: _read(path) for name, path in paths.items()}

    node_h = _insert_standard_include(before["node_h"], "#include <cstdint>")
    node_h = _insert_class_public(
        node_h,
        r"class\s+(?:CORE_EXPORT\s+)?Node\b[^\{]*\{",
        NODE_DECL_BLOCK,
        NODE_DECL_MARKER,
    )
    node_impl = _node_impl(node_h)
    node_cc = _insert_before_namespace_close(before["node_cc"], node_impl, NODE_IMPL_MARKER)

    element_h = _insert_standard_include(before["element_h"], "#include <cstdint>")
    element_h = _insert_class_public(
        element_h,
        r"class\s+(?:CORE_EXPORT\s+)?Element\b[^\{]*\{",
        ELEMENT_DECL_BLOCK,
        ELEMENT_DECL_MARKER,
    )

    element_cc = _insert_after_include(
        before["element_cc"],
        '#include "third_party/blink/renderer/core/dom/element.h"',
        '#include "third_party/blink/renderer/platform/runtime_enabled_features.h"',
    )
    element_cc = _insert_before_namespace_close(
        element_cc, ELEMENT_IMPL_BLOCK, ELEMENT_IMPL_MARKER
    )
    element_idl = _insert_idl(before["element_idl"])

    updated = {
        "node_h": node_h,
        "node_cc": node_cc,
        "element_h": element_h,
        "element_cc": element_cc,
        "element_idl": element_idl,
    }
    for name, text in updated.items():
        _write(paths[name], text)

    changed = runtime_result.changed or any(before[name] != updated[name] for name in updated)
    metadata = {
        "feature": "LongViewSegmentLifecycle",
        "mode": "native-descendant-layout-detach-alpha",
        "runtimeFeatureDefault": "disabled",
        "webMethods": [
            "Element.longViewDetachDescendantLayoutObjects",
            "Element.longViewCountDescendantLayoutObjects",
        ],
        "files": {
            str(path.relative_to(source.resolve())): _sha256(path)
            for path in paths.values()
        },
    }
    return NativeColdPatchResult(
        changed=changed,
        installed=True,
        files=tuple(paths.values()),
        metadata=metadata,
    )


def remove_native_cold(source: Path) -> NativeColdPatchResult:
    paths = _paths(source)
    changed = False

    replacements = {
        "node_h": NODE_DECL_BLOCK,
        "element_h": ELEMENT_DECL_BLOCK,
        "element_idl": IDL_BLOCK,
    }
    for name, block in replacements.items():
        text = _read(paths[name])
        if block in text:
            _write(paths[name], text.replace(block, "", 1))
            changed = True

    for name, marker in (("node_cc", NODE_IMPL_MARKER), ("element_cc", ELEMENT_IMPL_MARKER)):
        text = _read(paths[name])
        marker_at = text.find(marker)
        if marker_at >= 0:
            start = text.rfind("\n", 0, marker_at)
            namespace_at = max(
                text.find("\n}  // namespace blink", marker_at),
                text.find("\n} // namespace blink", marker_at),
            )
            if namespace_at < 0:
                raise ValueError(f"Cannot remove native-cold block from {paths[name]}")
            _write(paths[name], text[:start] + text[namespace_at:])
            changed = True

    runtime_result = remove_runtime_feature(paths["runtime"])
    changed = changed or runtime_result.changed
    return NativeColdPatchResult(
        changed=changed,
        installed=False,
        files=tuple(paths.values()),
        metadata={"feature": "LongViewSegmentLifecycle", "installed": False},
    )


def write_metadata(result: NativeColdPatchResult, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result.metadata, indent=2) + "\n", encoding="utf-8")
