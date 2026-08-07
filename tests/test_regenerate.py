import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).parents[1] / 'scripts' / 'regenerate.py'
spec = importlib.util.spec_from_file_location('regenerate', SCRIPT)
if spec is None or spec.loader is None:
    raise RuntimeError(f'Could not load {SCRIPT}')
regenerate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(regenerate)


class ResolveHermesHomeTests(unittest.TestCase):
    def test_prefers_windows_localappdata_when_hermes_home_is_unset(self):
        home = regenerate.resolve_hermes_home(
            {'LOCALAPPDATA': r'C:\Users\Joshua\AppData\Local'},
            Path(r'C:\Users\Joshua'),
            platform_name='win32',
        )

        self.assertEqual(home, Path(r'C:\Users\Joshua\AppData\Local') / 'hermes')


class RegenerateSafetyTests(unittest.TestCase):
    def test_refuses_to_replace_plugin_when_no_skins_are_found(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            skins_dir = Path(temp_dir) / 'skins'
            skins_dir.mkdir()
            output = Path(temp_dir) / 'plugin.js'
            output.write_text('existing plugin', encoding='utf-8')

            with (
                patch.object(regenerate, '_backend_builtins', return_value=[]),
                patch.object(sys, 'argv', ['regenerate.py', str(skins_dir), str(output)]),
            ):
                result = regenerate.main()

            self.assertEqual(result, 1)
            self.assertEqual(output.read_text(encoding='utf-8'), 'existing plugin')


class WindowsRunnerTests(unittest.TestCase):
    def test_repo_ships_a_runner_that_preserves_bundled_and_installed_skins(self):
        runner = SCRIPT.parents[1] / 'install' / 'regenerate-windows.ps1'
        source = runner.read_text(encoding='utf-8')

        self.assertIn("Join-Path $env:LOCALAPPDATA 'hermes'", source)
        self.assertIn("Join-Path $bundle '..\\skins'", source)
        self.assertIn("Join-Path $hermesHome 'skins'", source)
        self.assertIn("scripts\\regenerate.py", source)


if __name__ == '__main__':
    unittest.main()
