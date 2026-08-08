#!/usr/bin/env python3
"""Regenerate the Theme Picker plugin after installing new skins.

Drop new skin YAML files into the Hermes skins folder, then run this script.
It rebuilds plugin.js with the full, current skin catalog embedded, so every
installed skin appears in the picker as a browseable card.

Usage:
    python3 regenerate.py [skins_dir] [out_plugin_js]

Defaults:
    skins_dir   = <hermes home>/skins  (HERMES_HOME, else ~/.hermes)
    out_plugin  = <hermes home>/desktop-plugins/theme-picker/plugin.js

Then copy the output plugin.js to the machine running the desktop app
(Windows: %LOCALAPPDATA%\\hermes\\desktop-plugins\\theme-picker\\plugin.js)
and run "Reload desktop plugins" from the Command Palette (Ctrl+K).
"""

from __future__ import annotations

from collections.abc import Mapping
import json
import os
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover - hermes ships pyyaml
    yaml = None

CATEGORY_PREFIXES = [
    ("dark-", "Dark"),
    ("light-", "Light"),
    ("vibrant-", "Vibrant"),
    ("nature-", "Nature"),
    ("minimal-", "Minimal"),
    ("retro-", "Retro"),
]

# Color keys the desktop converter + preview actually use.
KEEP_KEYS = {
    "background", "status_bar_bg", "ui_text", "banner_text", "status_bar_text",
    "ui_accent", "banner_accent", "banner_title", "ui_border", "banner_border",
    "banner_dim", "session_border", "ui_error", "ui_ok", "ui_warn", "ui_tool",
    "completion_menu_bg", "prompt", "shell_dollar",
}

# Canonical light/dark matches from CliffWade/hermes-desktop-theme-pack v1.1.0.
# Each pair becomes one Desktop theme whose light/dark toggle swaps real palettes.
THEME_PAIRS = [
    ("dark-aubergine", "light-lavender"),
    ("dark-ayu", "light-ayu"),
    ("dark-bone", "minimal-bone"),
    ("dark-catppuccin", "light-catppuccin"),
    ("dark-charcoal", "light-cloud"),
    ("dark-cozy-paper", "light-cozy-paper"),
    ("dark-crimson", "light-rose"),
    ("dark-dracula", "light-dracula"),
    ("dark-everforest", "light-everforest"),
    ("dark-github", "light-github"),
    ("dark-gruvbox", "light-gruvbox"),
    ("dark-kanagawa", "light-kanagawa"),
    ("dark-lcars", "light-lcars"),
    ("dark-lemon", "light-lemon"),
    ("dark-mac", "retro-mac"),
    ("dark-material", "light-material"),
    ("dark-navy", "light-sky"),
    ("dark-nord", "light-nord"),
    ("dark-obsidian", "light-porcelain"),
    ("dark-one", "light-one"),
    ("dark-plum", "light-grape"),
    ("dark-rosepine", "light-rosepine"),
    ("dark-sage", "light-sage"),
    ("dark-solarized", "light-solarized"),
    ("dark-tokyo-night", "light-tokyo-day"),
    ("dark-vanilla", "light-vanilla"),
    ("dark-vscode", "light-vscode"),
    ("minimal-graphite", "minimal-pearl"),
    ("nature-autumn", "light-melon"),
    ("nature-desert", "light-sand"),
    ("nature-forest", "light-fern"),
    ("nature-nordic", "light-frost"),
    ("nature-ocean", "light-tide"),
    ("newsprint-noir", "light-paper"),
    ("peach-fuzz", "light-peach"),
    ("redwood", "light-cream"),
    ("retro-amber", "light-honey"),
    ("retro-blue", "light-denim"),
    ("retro-terminal", "light-mint"),
    ("shadow-thief", "light-lilac"),
    ("slate-mist", "light-mist"),
    ("stained-glass", "light-stained-glass"),
    ("steel-thread", "light-ash"),
    ("vaporwave-mall", "light-aqua"),
    ("vibrant-neon", "light-neon"),
    ("vibrant-pacific", "light-pacific"),
    ("vibrant-sunset", "light-blush"),
    ("vibrant-synthwave", "light-synthwave"),
    ("void-sunset", "light-sunset"),
    ("warm-ash", "light-oat"),
]

HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$")


def resolve_hermes_home(
    environ: Mapping[str, str] | None = None,
    home: Path | None = None,
    platform_name: str | None = None,
) -> Path:
    """Return Hermes home using the desktop app's Windows location when needed."""
    env = os.environ if environ is None else environ
    configured = env.get("HERMES_HOME")
    if configured:
        return Path(configured)

    if (platform_name or sys.platform).startswith("win") and (local_app_data := env.get("LOCALAPPDATA")):
        return Path(local_app_data) / "hermes"

    return (home or Path.home()) / ".hermes"


def _luminance(hex_color: str) -> float | None:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6:
        return None
    try:
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except ValueError:
        return None
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255


def _parse_skin_file(path: Path) -> dict | None:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8")) if yaml else None
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    name = str(data.get("name", "")).strip() or path.stem
    colors = data.get("colors") or {}
    category = "Other"
    for prefix, label in CATEGORY_PREFIXES:
        if name.startswith(prefix):
            category = label
            break
    bg = colors.get("background") or colors.get("status_bar_bg") or ""
    text = colors.get("banner_text") or colors.get("ui_text") or ""
    lum = _luminance(bg) if bg else (_luminance(text) if text else None)
    return {
        "name": name,
        "description": str(data.get("description", "")),
        "category": category,
        "isDark": lum is None or lum < 0.5,
        "source": "user",
        "colors": {
            k: v for k, v in colors.items()
            if isinstance(v, str) and HEX_RE.match(v) and k in KEEP_KEYS
        },
    }


def _preview(background: str, text: str, accent: str, border: str, tool: str | None = None) -> dict:
    """Build the compact skin-shaped palette consumed by the picker preview."""
    return {
        "background": background,
        "ui_text": text,
        "banner_text": text,
        "ui_accent": accent,
        "banner_accent": accent,
        "ui_tool": tool or accent,
        "ui_border": border,
        "banner_border": border,
    }


def _dynamic_scene(
    name: str,
    label: str,
    description: str,
    light: dict,
    dark: dict,
    *,
    light_name: str | None = None,
    dark_name: str | None = None,
    source: str = "builtin-desktop",
) -> dict:
    return {
        "name": name,
        "label": label,
        "description": description,
        "category": "Built-in" if source == "builtin-desktop" else "Dynamic",
        "modeSupport": "dynamic",
        "source": source,
        "colors": light,
        "lightColors": light,
        "darkColors": dark,
        "lightName": light_name or name,
        "darkName": dark_name or name,
        # Dynamic variants always travel under dedicated aliases. Backend skins
        # are single-mode Desktop themes; a unique alias prevents a loaded
        # combined user theme of the same name from winning resolution and
        # briefly painting its opposite palette through stale React mode state.
        "gatewayLightName": f"theme-picker-{name}-light",
        "gatewayDarkName": f"theme-picker-{name}-dark",
    }


def _desktop_builtin_scenes() -> list[dict]:
    """The canonical Desktop scenes, with swatches matching Hermes presets."""
    scenes = [
        _dynamic_scene(
            "nous", "Nous", "Glass neutrals with Nous blue accents",
            _preview("#F8FAFF", "#17171A", "#0053FD", "#C7D7FA"),
            _preview("#0D2F86", "#FFE6CB", "#FFE6CB", "#3158AD", "#0053FD"),
            dark_name="default",
        ),
        _dynamic_scene(
            "midnight", "Midnight", "Deep blue-violet with cool accents",
            _preview("#FFFFFF", "#161616", "#8B80E8", "#DEDDF5"),
            _preview("#08081C", "#DDD6FF", "#8B80E8", "#1E1E52"),
        ),
        _dynamic_scene(
            "ember", "Ember", "Warm crimson and bronze — forge vibes",
            _preview("#FFFFFF", "#161616", "#D97316", "#F1D9C4"),
            _preview("#160800", "#FFD8B0", "#D97316", "#3A1C08"),
        ),
        _dynamic_scene(
            "mono", "Mono", "Clean grayscale — minimal and focused",
            _preview("#FFFFFF", "#161616", "#707070", "#DEDEDE"),
            _preview("#0E0E0E", "#EAEAEA", "#9A9A9A", "#2A2A2A"),
        ),
        _dynamic_scene(
            "cyberpunk", "Cyberpunk", "Neon green on black — matrix terminal",
            _preview("#FFFFFF", "#161616", "#008F28", "#C9E8D2"),
            _preview("#000A00", "#00FF41", "#00FF41", "#003000"),
        ),
        _dynamic_scene(
            "rose", "Rose", "Soft pink and warm ivory — easy on the eyes",
            _preview("#FFF8FB", "#24171D", "#B64F78", "#E8CAD6"),
            _preview("#1A0F15", "#FFD4E1", "#F9A8D4", "#54283B"),
        ),
        _dynamic_scene(
            "shadow-thief", "Shadow Thief", "Rogue's night — matte black, muted plum, and silver-steel with a glint of cyan",
            _preview("#F7F1FA", "#3A2645", "#8B5CA8", "#D8C8E0", "#7A4F94"),
            _preview("#101014", "#B0B0C0", "#50A8A8", "#4A4060"),
            light_name="light-lilac",
            dark_name="shadow-thief",
        ),
        _dynamic_scene(
            "hermes-teal", "Hermes Teal", "Classic teal — the canonical Hermes dashboard look",
            _preview("#F4FCFC", "#132B2B", "#087F7A", "#B9DBD8"),
            _preview("#041C1C", "#FFE6CB", "#33C4BA", "#205654"),
        ),
    ]
    return scenes


def _mode_support(name: str, is_dark: bool) -> str:
    if name in {"daylight", "warm-lightmode"}:
        return "light"
    return "dark" if is_dark else "light"


def _single_scene(skin: dict) -> dict:
    mode = _mode_support(skin["name"], skin.get("isDark", True))
    colors = skin.get("colors", {})
    return {
        **skin,
        "label": skin.get("label") or skin["name"].replace("-", " ").title(),
        "modeSupport": mode,
        "lightColors": colors if mode == "light" else None,
        "darkColors": colors if mode == "dark" else None,
        "lightName": skin["name"] if mode == "light" else None,
        "darkName": skin["name"] if mode == "dark" else None,
    }


def _build_catalog(
    user_skins: list[dict],
    backend_builtins: list[dict],
    *,
    pairs: list[tuple[str, str]] | None = None,
    desktop_builtins: list[dict] | None = None,
) -> list[dict]:
    """Collapse matched palettes into scenes, then retain every unpaired skin."""
    pair_list = THEME_PAIRS if pairs is None else pairs
    desktop = _desktop_builtin_scenes() if desktop_builtins is None else desktop_builtins
    by_name = {skin["name"]: skin for skin in user_skins}
    consumed = set()
    scenes = []
    for builtin in desktop:
        scene = dict(builtin)
        light = by_name.get(scene.get("lightName"))
        dark = by_name.get(scene.get("darkName"))
        # Shadow Thief is both a canonical Desktop scene and part of the
        # vendored pack. Preserve the complete source palettes so migration can
        # recognize the exact legacy single-palette cache without broad rules.
        if light:
            scene["colors"] = light.get("colors", {})
            scene["lightColors"] = light.get("colors", {})
        if dark:
            scene["darkColors"] = dark.get("colors", {})
        scenes.append(scene)

    reserved = {scene["name"] for scene in desktop}
    for scene in desktop:
        reserved.update(name for name in (scene.get("lightName"), scene.get("darkName")) if name)

    for dark_name, light_name in pair_list:
        if dark_name in reserved or light_name in reserved:
            consumed.update({dark_name, light_name})
            continue
        dark = by_name.get(dark_name)
        light = by_name.get(light_name)
        if not dark or not light:
            continue
        consumed.update({dark_name, light_name})
        scenes.append(_dynamic_scene(
            dark_name,
            dark_name.removeprefix("dark-").replace("-", " ").title(),
            dark.get("description", "") or light.get("description", ""),
            light.get("colors", {}),
            dark.get("colors", {}),
            light_name=light_name,
            dark_name=dark_name,
            source="user",
        ))

    for skin in user_skins:
        if skin["name"] not in consumed and skin["name"] not in reserved:
            scenes.append(_single_scene(skin))

    desktop_names = {scene["name"] for scene in desktop}
    for skin in backend_builtins:
        # Backend `default` is the retired gold skin; Desktop's default is Nous.
        if skin["name"] != "default" and skin["name"] not in desktop_names:
            scenes.append(_single_scene(skin))

    return scenes


def _backend_builtins() -> list[dict]:
    """Load the pinned backend built-ins used by deterministic generation."""
    source = Path(__file__).resolve().with_name("backend-builtins.json")
    try:
        builtins = json.loads(source.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RuntimeError(f"could not load pinned backend built-ins from {source}: {exc}") from exc
    expected = ["default", "ares", "mono", "slate", "daylight", "warm-lightmode", "poseidon", "sisyphus", "charizard"]
    if not isinstance(builtins, list) or [skin.get("name") for skin in builtins] != expected:
        raise RuntimeError(f"pinned backend built-ins in {source} do not match the expected catalog")
    return builtins


def _write_gateway_transport_skins(catalog: list[dict], destination: Path) -> int:
    """Generate one mode-locked gateway skin for every dynamic variant."""
    assert yaml is not None
    destination.mkdir(parents=True, exist_ok=True)
    expected = set()
    for scene in catalog:
        if scene.get("modeSupport") != "dynamic":
            continue
        for mode in ("light", "dark"):
            name = scene[f"gateway{mode.title()}Name"]
            expected.add(f"{name}.yaml")
            payload = {
                "name": name,
                "description": f"Theme Picker transport for {scene.get('label', scene['name'])} ({mode})",
                "colors": scene[f"{mode}Colors"],
            }
            text = yaml.safe_dump(payload, sort_keys=False, allow_unicode=True)
            (destination / f"{name}.yaml").write_text(text, encoding="utf-8")

    for path in destination.glob("*.yaml"):
        if path.name not in expected:
            path.unlink()
    return len(expected)


def main() -> int:
    home = resolve_hermes_home()

    if yaml is None:
        print('ERROR: PyYAML is required to read skin files; refusing to replace plugin.js.', file=sys.stderr)
        return 1

    # Default skins dir: the repo's own skins/ folder when running from a
    # checkout (self-contained), else the Hermes home's skins folder.
    script_dir = Path(__file__).resolve().parent
    repo_skins = script_dir.parent / "skins"
    default_skins = repo_skins if repo_skins.is_dir() else home / "skins"
    skins_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else default_skins

    # Default output: the repo's plugin/plugin.js when running from a checkout,
    # else the in-place desktop-plugins location.
    repo_out = script_dir.parent / "plugin" / "plugin.js"
    default_out = repo_out if (script_dir.parent / "plugin").is_dir() else home / "desktop-plugins" / "theme-picker" / "plugin.js"
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else default_out

    user_skins = []
    for p in sorted(skins_dir.glob("*.yaml")):
        if not p.is_file() or p.is_symlink():
            continue
        parsed = _parse_skin_file(p)
        if parsed and parsed.get("colors"):
            user_skins.append(parsed)

    # Backend built-ins are supplemental. Never let them turn an empty,
    # malformed, or non-regular supplied bundle into a destructive partial
    # regeneration: transport generation also prunes files not in the catalog.
    if not user_skins:
        print(f"ERROR: no valid bundled skins found in {skins_dir}; refusing to replace {out_path}.", file=sys.stderr)
        return 1

    try:
        builtins = _backend_builtins()
    except RuntimeError as exc:
        print(f"ERROR: {exc}; refusing to replace {out_path}.", file=sys.stderr)
        return 1
    catalog = _build_catalog(user_skins, builtins)
    repo_gateway_skins = script_dir.parent / "gateway-skins"
    transport_count = _write_gateway_transport_skins(catalog, repo_gateway_skins)
    # sort_keys=True keeps output byte-stable across runs (matches the shipped
    # plugin.js), so a rebuild with unchanged skins produces an identical file.
    data = json.dumps(catalog, ensure_ascii=False, separators=(",", ":"), sort_keys=True)

    # Template lives in the project's plugin/ dir (repo layout) or next to the
    # plugin folder root (in-place layout: ../plugin.template.js).
    script_dir = Path(__file__).resolve().parent
    template = (
        script_dir.parent / "plugin" / "plugin.template.js"  # repo layout
        if (script_dir.parent / "plugin" / "plugin.template.js").exists()
        else script_dir.parent / "plugin.template.js"          # in-place layout
    )
    if not template.exists():
        print(f"ERROR: template not found at {template}", file=sys.stderr)
        return 1

    plugin = template.read_text(encoding="utf-8").replace("__SKINS_DATA__", data)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(plugin, encoding="utf-8")

    print(f"Rebuilt {out_path} with {len(catalog)} scenes from "
          f"{len(user_skins)} bundled skins + {len(builtins)} backend built-ins "
          f"and {transport_count} gateway transports.")
    print("Next: copy plugin.js to the desktop machine and run "
          "'Reload desktop plugins' (Ctrl+K).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
