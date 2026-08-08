import importlib.util
import hashlib
import json
import os
import subprocess
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
    def test_refuses_empty_or_malformed_bundle_before_mutating_outputs(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            repo = Path(temp_dir) / 'repo'
            scripts_dir = repo / 'scripts'
            scripts_dir.mkdir(parents=True)
            (scripts_dir / 'backend-builtins.json').write_bytes(
                (SCRIPT.parent / 'backend-builtins.json').read_bytes()
            )
            plugin_dir = repo / 'plugin'
            plugin_dir.mkdir()
            (plugin_dir / 'plugin.template.js').write_bytes(
                (SCRIPT.parents[1] / 'plugin' / 'plugin.template.js').read_bytes()
            )
            gateway_dir = repo / 'gateway-skins'
            gateway_dir.mkdir()
            transport = gateway_dir / 'existing.yaml'
            output = plugin_dir / 'plugin.js'

            cases = {
                'empty': None,
                'invalid yaml': 'name: [unterminated',
                'missing palette': 'name: empty-palette\ncolors: {}\n',
                'symlink': 'symlink',
            }
            for label, contents in cases.items():
                with self.subTest(label=label):
                    for generated in gateway_dir.iterdir():
                        generated.unlink()
                    transport.write_text('name: existing\n', encoding='utf-8')
                    output.write_text('existing plugin', encoding='utf-8')
                    skins_dir = repo / 'skins'
                    skins_dir.mkdir(exist_ok=True)
                    malformed = skins_dir / 'broken.yaml'
                    malformed.unlink(missing_ok=True)
                    if contents == 'symlink':
                        regular_skin = repo / 'outside.yaml'
                        regular_skin.write_text(
                            'name: linked\ncolors:\n  background: "#000000"\n',
                            encoding='utf-8',
                        )
                        malformed.symlink_to(regular_skin)
                    elif contents is not None:
                        malformed.write_text(contents, encoding='utf-8')

                    with (
                        patch.object(regenerate, '__file__', str(scripts_dir / 'regenerate.py')),
                        patch.object(sys, 'argv', ['regenerate.py', str(skins_dir), str(output)]),
                    ):
                        result = regenerate.main()

                    self.assertEqual(result, 1)
                    self.assertEqual(output.read_text(encoding='utf-8'), 'existing plugin')
                    self.assertEqual(transport.read_text(encoding='utf-8'), 'name: existing\n')
                    self.assertEqual(list(gateway_dir.iterdir()), [transport])


class ThemeCatalogTests(unittest.TestCase):
    def test_desktop_builtins_are_the_expected_dynamic_scenes(self):
        scenes = regenerate._desktop_builtin_scenes()

        self.assertEqual(
            [scene['name'] for scene in scenes],
            ['nous', 'midnight', 'ember', 'mono', 'cyberpunk', 'rose', 'shadow-thief', 'hermes-teal'],
        )
        for scene in scenes:
            self.assertEqual(scene['modeSupport'], 'dynamic')
            self.assertIn('lightColors', scene)
            self.assertIn('darkColors', scene)

    def test_desktop_builtins_have_concrete_gateway_variant_names(self):
        scenes = regenerate._desktop_builtin_scenes()

        for scene in scenes:
            self.assertEqual(scene['gatewayLightName'], f"theme-picker-{scene['name']}-light")
            self.assertEqual(scene['gatewayDarkName'], f"theme-picker-{scene['name']}-dark")

    def test_gateway_transport_skins_cover_desktop_only_variants(self):
        gateway_dir = SCRIPT.parents[1] / 'gateway-skins'

        for scene in regenerate._desktop_builtin_scenes():
            for mode, palette_key in (('light', 'lightColors'), ('dark', 'darkColors')):
                skin_name = scene[f'gateway{mode.title()}Name']
                skin = regenerate._parse_skin_file(gateway_dir / f'{skin_name}.yaml')
                self.assertIsNotNone(skin)
                self.assertEqual(skin['name'], skin_name)
                self.assertEqual(skin['colors']['background'].lower(), scene[palette_key]['background'].lower())
                self.assertEqual(skin['colors']['ui_accent'].lower(), scene[palette_key]['ui_accent'].lower())
                self.assertEqual(skin['colors']['ui_text'].lower(), scene[palette_key]['ui_text'].lower())

    def test_every_dynamic_variant_uses_a_unique_mode_locked_gateway_transport(self):
        repo = SCRIPT.parents[1]
        user_skins = [
            skin for path in sorted((repo / 'skins').glob('*.yaml'))
            if (skin := regenerate._parse_skin_file(path)) is not None
        ]
        catalog = regenerate._build_catalog(user_skins, regenerate._backend_builtins())
        dynamic = [scene for scene in catalog if scene['modeSupport'] == 'dynamic']
        transport_names = []

        for scene in dynamic:
            for mode in ('light', 'dark'):
                gateway_name = scene[f'gateway{mode.title()}Name']
                transport_names.append(gateway_name)
                self.assertTrue(gateway_name.startswith('theme-picker-'), scene['name'])
                self.assertNotIn(gateway_name, {scene['name'], scene.get(f'{mode}Name')})
                transport = regenerate.yaml.safe_load(
                    (repo / 'gateway-skins' / f'{gateway_name}.yaml').read_text(encoding='utf-8')
                )
                self.assertEqual(transport['name'], gateway_name)
                self.assertEqual(transport['colors'], scene[f'{mode}Colors'])

        self.assertEqual(len(dynamic), 57)
        self.assertEqual(len(transport_names), 114)
        self.assertEqual(len(set(transport_names)), 114)
        self.assertEqual(len(list((repo / 'gateway-skins').glob('*.yaml'))), 114)

    def test_every_catalog_scene_selects_a_gateway_resolvable_variant(self):
        repo = SCRIPT.parents[1]
        user_skins = [
            skin for path in (repo / 'skins').glob('*.yaml')
            if (skin := regenerate._parse_skin_file(path)) is not None
        ]
        catalog = regenerate._build_catalog(user_skins, [])
        available = {skin['name'] for skin in user_skins}
        available.update(path.stem for path in (repo / 'gateway-skins').glob('*.yaml'))
        available.update({'default', 'ares', 'mono', 'slate', 'daylight', 'warm-lightmode', 'poseidon', 'sisyphus', 'charizard'})

        for scene in catalog:
            if scene['modeSupport'] in {'dynamic', 'light'}:
                light_name = scene.get('gatewayLightName') or scene.get('lightName') or scene['name']
                self.assertIn(light_name, available, f"missing gateway light skin for {scene['name']}")
            if scene['modeSupport'] in {'dynamic', 'dark'}:
                dark_name = scene.get('gatewayDarkName') or scene.get('darkName') or scene['name']
                self.assertIn(dark_name, available, f"missing gateway dark skin for {scene['name']}")

    def test_backend_builtins_are_pinned_without_importing_hermes(self):
        real_import = __import__

        def isolated_import(name, *args, **kwargs):
            if name.startswith('hermes_cli'):
                raise ImportError('hermes is intentionally unavailable')
            return real_import(name, *args, **kwargs)

        with patch('builtins.__import__', side_effect=isolated_import):
            builtins = regenerate._backend_builtins()

        self.assertEqual(
            [skin['name'] for skin in builtins],
            ['default', 'ares', 'mono', 'slate', 'daylight', 'warm-lightmode', 'poseidon', 'sisyphus', 'charizard'],
        )

    def test_updated_cliff_pack_has_fifty_complete_pairs(self):
        skins_dir = SCRIPT.parents[1] / 'skins'
        available = {path.stem for path in skins_dir.glob('*.yaml')}

        self.assertEqual(len(regenerate.THEME_PAIRS), 50)
        paired = {name for pair in regenerate.THEME_PAIRS for name in pair}
        self.assertEqual(len(paired), 100)
        self.assertEqual(paired - available, set())

    def test_cliffwade_v1_1_0_files_match_the_pinned_hash_manifest(self):
        repo = SCRIPT.parents[1]
        manifest = json.loads((repo / 'scripts' / 'cliffwade-v1.1.0-sha256.json').read_text(encoding='utf-8'))

        self.assertEqual(len(manifest), 100)
        for name, expected_hash in manifest.items():
            actual_hash = hashlib.sha256((repo / 'skins' / name).read_bytes()).hexdigest()
            self.assertEqual(actual_hash, expected_hash, name)

    def test_daylight_and_warm_lightmode_are_light_only(self):
        self.assertEqual(regenerate._mode_support('daylight', True), 'light')
        self.assertEqual(regenerate._mode_support('warm-lightmode', True), 'light')

    def test_catalog_collapses_pairs_and_keeps_single_mode_skins(self):
        dark = {'name': 'dark-example', 'isDark': True, 'colors': {'background': '#111111'}}
        light = {'name': 'light-example', 'isDark': False, 'colors': {'background': '#eeeeee'}}
        single = {'name': 'only-dark', 'isDark': True, 'colors': {'background': '#000000'}}

        catalog = regenerate._build_catalog(
            [dark, light, single],
            [],
            pairs=[('dark-example', 'light-example')],
            desktop_builtins=[],
        )

        self.assertEqual([scene['name'] for scene in catalog], ['dark-example', 'only-dark'])
        self.assertEqual(catalog[0]['modeSupport'], 'dynamic')
        self.assertEqual(catalog[0]['darkName'], 'dark-example')
        self.assertEqual(catalog[0]['lightName'], 'light-example')
        self.assertEqual(catalog[1]['modeSupport'], 'dark')


class WindowsRunnerTests(unittest.TestCase):
    def test_repo_ships_a_runner_that_preserves_bundled_and_installed_skins(self):
        runner = SCRIPT.parents[1] / 'install' / 'regenerate-windows.ps1'
        source = runner.read_text(encoding='utf-8')

        self.assertIn("Join-Path $env:LOCALAPPDATA 'hermes'", source)
        self.assertIn("Join-Path $bundle '..\\skins'", source)
        self.assertIn("Join-Path $hermesHome 'skins'", source)
        self.assertIn("scripts\\regenerate.py", source)


class MacInstallerTests(unittest.TestCase):
    def test_installs_plugin_into_explicit_hermes_home(self):
        installer = SCRIPT.parents[1] / 'install' / 'install-macos.command'
        expected_plugin = SCRIPT.parents[1] / 'plugin' / 'plugin.js'

        with tempfile.TemporaryDirectory() as temp_dir:
            hermes_home = Path(temp_dir) / 'custom-hermes-home'
            env = os.environ.copy()
            env['HERMES_HOME'] = str(hermes_home)

            result = subprocess.run(
                [str(installer)],
                check=True,
                capture_output=True,
                env=env,
                text=True,
            )

            installed_plugin = hermes_home / 'desktop-plugins' / 'theme-picker' / 'plugin.js'
            self.assertEqual(installed_plugin.read_bytes(), expected_plugin.read_bytes())
            self.assertIn(f'Installed Theme Picker into: {installed_plugin.parent}', result.stdout)

    def test_installs_plugin_into_default_home_when_hermes_home_is_unset(self):
        installer = SCRIPT.parents[1] / 'install' / 'install-macos.command'
        expected_plugin = SCRIPT.parents[1] / 'plugin' / 'plugin.js'

        with tempfile.TemporaryDirectory() as temp_dir:
            home = Path(temp_dir) / 'home with spaces'
            env = os.environ.copy()
            env.pop('HERMES_HOME', None)
            env['HOME'] = str(home)

            subprocess.run(
                [str(installer)],
                check=True,
                capture_output=True,
                env=env,
                text=True,
            )

            installed_plugin = home / '.hermes' / 'desktop-plugins' / 'theme-picker' / 'plugin.js'
            self.assertEqual(installed_plugin.read_bytes(), expected_plugin.read_bytes())


class GatewaySkinInstallerTests(unittest.TestCase):
    def test_installs_bundled_and_transport_skins_into_gateway_home(self):
        repo = SCRIPT.parents[1]
        installer = repo / 'install' / 'install-gateway-skins.sh'
        self.assertTrue(os.access(installer, os.X_OK))

        with tempfile.TemporaryDirectory() as temp_dir:
            hermes_home = Path(temp_dir) / 'gateway home'
            subprocess.run(
                ['sh', str(installer)],
                check=True,
                env={**os.environ, 'HERMES_HOME': str(hermes_home)},
                capture_output=True,
                text=True,
            )

            installed = hermes_home / 'skins'
            expected = list((repo / 'skins').glob('*.yaml')) + list((repo / 'gateway-skins').glob('*.yaml'))
            self.assertEqual(len(list(installed.glob('*.yaml'))), len(expected))
            for source in expected:
                self.assertEqual((installed / source.name).read_bytes(), source.read_bytes())

    def test_refuses_modified_collisions_unless_force_is_explicit(self):
        repo = SCRIPT.parents[1]
        installer = repo / 'install' / 'install-gateway-skins.sh'

        with tempfile.TemporaryDirectory() as temp_dir:
            hermes_home = Path(temp_dir) / 'gateway'
            destination = hermes_home / 'skins'
            destination.mkdir(parents=True)
            collision = destination / 'dark-ayu.yaml'
            collision.write_text('name: dark-ayu\n# locally customized\n', encoding='utf-8')
            env = {**os.environ, 'HERMES_HOME': str(hermes_home)}

            refused = subprocess.run(
                ['sh', str(installer)],
                check=False,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(refused.returncode, 0)
            self.assertIn('Refusing to overwrite modified gateway skins', refused.stderr)
            self.assertEqual(collision.read_text(encoding='utf-8'), 'name: dark-ayu\n# locally customized\n')
            self.assertFalse((destination / 'theme-picker-nous-light.yaml').exists())

            subprocess.run(
                ['sh', str(installer), '--force'],
                check=True,
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertEqual(collision.read_bytes(), (repo / 'skins' / collision.name).read_bytes())

    def test_force_still_refuses_destination_symlinks(self):
        repo = SCRIPT.parents[1]
        installer = repo / 'install' / 'install-gateway-skins.sh'

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            hermes_home = root / 'gateway'
            destination = hermes_home / 'skins'
            destination.mkdir(parents=True)
            outside = root / 'outside.yaml'
            outside.write_text('name: protected\n', encoding='utf-8')
            (destination / 'dark-ayu.yaml').symlink_to(outside)

            refused = subprocess.run(
                ['sh', str(installer), '--force'],
                check=False,
                env={**os.environ, 'HERMES_HOME': str(hermes_home)},
                capture_output=True,
                text=True,
            )

            self.assertNotEqual(refused.returncode, 0)
            self.assertIn('Refusing destination symlink', refused.stderr)
            self.assertEqual(outside.read_text(encoding='utf-8'), 'name: protected\n')


if __name__ == '__main__':
    unittest.main()
