import tempfile
import unittest
from pathlib import Path

from longview_tools.config import Paths
from longview_tools.overlay import install_blink_observability, install_overlay, remove_blink_observability, remove_overlay


class OverlayTest(unittest.TestCase):
    def test_install_and_remove(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo = root / "repo"
            workspace = root / "workspace"
            src = workspace / "src"
            (repo / "chromium_overlay").mkdir(parents=True)
            (repo / "chromium_overlay" / "BUILD.gn").write_text("# test\n", encoding="utf-8")
            target = src / "third_party/blink/renderer/platform"
            target.mkdir(parents=True)
            (target / "runtime_enabled_features.json5").write_text("{\n  data: [\n  ],\n}\n", encoding="utf-8")
            paths = Paths(repo=repo, workspace=workspace)
            installed = install_overlay(paths, "0.2.0")
            self.assertTrue((installed / "OVERLAY.json").is_file())
            self.assertTrue(install_blink_observability(paths))
            self.assertTrue((installed / "BLINK_OBSERVABILITY.json").is_file())
            self.assertTrue(remove_blink_observability(paths))
            self.assertTrue(remove_overlay(paths))


if __name__ == "__main__":
    unittest.main()
