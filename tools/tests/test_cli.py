import unittest

from longview_tools.cli import common_parser


class CliTest(unittest.TestCase):
    def test_phase2_commands_parse(self):
        parser = common_parser()
        for command in ("install-overlay", "remove-overlay", "install-blink-observability", "remove-blink-observability", "native-probe", "evidence"):
            args = parser.parse_args([command])
            self.assertEqual(args.command, command)


if __name__ == "__main__":
    unittest.main()
