from __future__ import annotations

import json
import tempfile
import unittest
import zipfile
from pathlib import Path

import check_chromium_pin
import generate_sbom
import locate_build
import package_portable
import install_staged_update


class Phase7ToolTest(unittest.TestCase):
    def test_portable_package_is_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            source.mkdir()
            (source / "browser").write_bytes(b"longview")
            metadata = {"version": "1.0.0-rc.1", "platform": "linux"}
            first = root / "first.zip"
            second = root / "second.zip"
            a = package_portable.package(source, first, metadata)
            b = package_portable.package(source, second, metadata)
            self.assertEqual(a["sha256"], b["sha256"])
            with zipfile.ZipFile(first) as archive:
                self.assertEqual(archive.read("browser"), b"longview")
                package = json.loads(archive.read("LONGVIEW_PACKAGE.json"))
                self.assertEqual(package["version"], "1.0.0-rc.1")

    def test_pin_evaluation(self) -> None:
        result = check_chromium_pin.evaluate(
            {"version": "151.0.7922.77", "commit": "a" * 40},
            {"channels": {"Stable": {"version": "152.0.8000.1"}}},
        )
        self.assertTrue(result["updateAvailable"])
        self.assertEqual(result["latestStable"], "152.0.8000.1")

    def test_sbom_contains_pin_and_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "chromium.version").write_text(json.dumps({
                "version": "151.0.7922.77", "commit": "b" * 40, "channel": "stable"
            }))
            (root / "SOURCE_MANIFEST.sha256").write_text("abc  file\n")
            sbom = generate_sbom.build_sbom(root, "1.0.0-rc.1")
            self.assertEqual(sbom["bomFormat"], "CycloneDX")
            self.assertEqual(sbom["components"][1]["version"], "151.0.7922.77")

    def test_locate_build_requires_existing_path(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaises(FileNotFoundError):
                locate_build.locate(Path(temporary), "LongView", "binary")

    def test_atomic_install_and_rollback(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source"
            source.mkdir()
            (source / "browser").write_text("new")
            artifact = root / "update.zip"
            packaged = package_portable.package(source, artifact, {"version": "1.0.0-rc.1"})
            state = root / "staged-update.json"
            state.write_text(json.dumps({
                "schemaVersion": 1,
                "version": "1.0.0-rc.1",
                "artifact": str(artifact),
                "sha256": packaged["sha256"],
                "readyToInstall": True,
            }))
            install_dir = root / "LongView"
            install_dir.mkdir()
            (install_dir / "browser").write_text("old")
            result = install_staged_update.install(state, install_dir, [], 5)
            self.assertTrue(result["healthCheckPassed"])
            self.assertEqual((install_dir / "browser").read_text(), "new")
            self.assertEqual((root / ".LongView.previous" / "browser").read_text(), "old")

    def test_safe_extract_rejects_parent_escape(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / "bad.zip"
            with zipfile.ZipFile(archive, "w") as zf:
                zf.writestr("../outside", b"bad")
            with self.assertRaises(ValueError):
                install_staged_update.safe_extract(archive, root / "output")


if __name__ == "__main__":
    unittest.main()
