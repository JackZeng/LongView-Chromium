import tempfile
import unittest
from pathlib import Path

from longview_tools.blink_patch import FEATURE_NAME, install_runtime_feature, remove_runtime_feature


class BlinkPatchTest(unittest.TestCase):
    def test_install_is_idempotent_and_removable(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "runtime_enabled_features.json5"
            path.write_text("{\n  data: [\n  ],\n}\n", encoding="utf-8")
            first = install_runtime_feature(path)
            second = install_runtime_feature(path)
            self.assertTrue(first.changed)
            self.assertFalse(second.changed)
            self.assertIn(FEATURE_NAME, path.read_text(encoding="utf-8"))
            removed = remove_runtime_feature(path)
            self.assertTrue(removed.changed)
            self.assertNotIn(FEATURE_NAME, path.read_text(encoding="utf-8"))

    def test_rejects_unknown_layout(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "features.json5"
            path.write_text("{}\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                install_runtime_feature(path)


if __name__ == "__main__":
    unittest.main()
