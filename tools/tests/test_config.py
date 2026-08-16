import json
import tempfile
import unittest
from pathlib import Path

from longview_tools.config import ChromiumPin, Paths, host_platform


class ChromiumPinTest(unittest.TestCase):
    def test_loads_valid_pin(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "chromium.version"
            path.write_text(json.dumps({"version": "1.2.3.4", "tag": "refs/tags/1.2.3.4", "commit": "a" * 40, "channel": "stable"}), encoding="utf-8")
            pin = ChromiumPin.load(path)
            self.assertEqual(pin.version, "1.2.3.4")
            self.assertEqual(pin.commit, "a" * 40)

    def test_rejects_invalid_commit(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "chromium.version"
            path.write_text(json.dumps({"version": "1", "tag": "refs/tags/1", "commit": "not-a-sha"}), encoding="utf-8")
            with self.assertRaises(ValueError):
                ChromiumPin.load(path)

    def test_rejects_mismatched_tag(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "chromium.version"
            path.write_text(json.dumps({"version": "1.2.3.4", "tag": "refs/tags/other", "commit": "a" * 40}), encoding="utf-8")
            with self.assertRaises(ValueError):
                ChromiumPin.load(path)

    def test_paths_expose_overlay_locations(self):
        paths = Paths(repo=Path("/repo"), workspace=Path("/workspace"))
        self.assertEqual(paths.overlay_source, Path("/repo/chromium_overlay"))
        self.assertEqual(paths.overlay_destination, Path("/workspace/src/longview"))

    def test_host_platform_is_supported(self):
        self.assertIn(host_platform(), {"mac", "win", "linux"})


if __name__ == "__main__":
    unittest.main()
