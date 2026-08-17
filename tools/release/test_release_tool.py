from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import longview_release
import update_client


class ReleaseToolTest(unittest.TestCase):
    def test_manifest_and_local_stage(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            artifact = root / "LongView-test.zip"
            artifact.write_bytes(b"longview-release-artifact")
            manifest = longview_release.build_manifest(
                version="1.0.0-rc.1",
                channel="beta",
                base_url="https://updates.example.test/beta",
                artifact_specs=[f"linux:x64:{artifact}"],
                minimum_version="0.2.0",
                rollout_percent=100,
                commit="deadbeef",
            )
            longview_release.validate_manifest(manifest)
            manifest_path = root / "manifest.json"
            longview_release.write_json(manifest_path, manifest)
            output = root / "stage"
            code = update_client.main([
                str(manifest_path),
                "--output-dir", str(output),
                "--state-dir", str(root / "state"),
                "--platform", "linux",
                "--arch", "x64",
                "--local-artifact", str(artifact),
                "--force",
            ])
            self.assertEqual(code, 0)
            state = json.loads((output / "staged-update.json").read_text())
            self.assertEqual(state["sha256"], longview_release.sha256_file(artifact))
            self.assertTrue(state["readyToInstall"])

    def test_artifact_spec_preserves_windows_drive_and_signature_url(self) -> None:
        target_platform, arch, raw_path, signature_url = longview_release.split_artifact_spec(
            r"windows:x64:C:\\release\\LongView.zip:https://updates.example.test:8443/LongView.zip.sig"
        )
        self.assertEqual(target_platform, "windows")
        self.assertEqual(arch, "x64")
        self.assertEqual(raw_path, r"C:\\release\\LongView.zip")
        self.assertEqual(signature_url, "https://updates.example.test:8443/LongView.zip.sig")

    def test_rollout_is_stable(self) -> None:
        first = update_client.rollout_bucket("machine", "stable", "1.2.3")
        second = update_client.rollout_bucket("machine", "stable", "1.2.3")
        self.assertEqual(first, second)
        self.assertGreaterEqual(first, 0)
        self.assertLess(first, 100)

    def test_rejects_insecure_url(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            artifact = Path(temporary) / "a.zip"
            artifact.write_bytes(b"x")
            with self.assertRaises(ValueError):
                longview_release.build_manifest(
                    version="1.0.0",
                    channel="stable",
                    base_url="http://updates.example.test",
                    artifact_specs=[f"linux:x64:{artifact}"],
                    minimum_version=None,
                    rollout_percent=100,
                    commit=None,
                )


if __name__ == "__main__":
    unittest.main()
