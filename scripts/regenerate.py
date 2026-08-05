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

import json
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

HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$")


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


def _backend_builtins() -> list[dict]:
    """Pull the backend's built-in skins so the picker can also show/apply them."""
    builtins = []
    try:
        from hermes_cli.skin_engine import list_skins, load_skin
    except Exception:
        return builtins
    for s in list_skins():
        if s.get("source") != "builtin":
            continue
        name = s["name"]
        try:
            sk = load_skin(name)
            colors = {
                k: v for k, v in (sk.colors or {}).items()
                if isinstance(v, str) and k in KEEP_KEYS
            }
        except Exception:
            colors = {}
        builtins.append({
            "name": name,
            "description": s.get("description", "") or f"Hermes built-in: {name}",
            "category": "Built-in",
            "isDark": True,
            "source": "builtin",
            "colors": colors,
        })
    return builtins


def main() -> int:
    home = Path(__import__("os").environ.get("HERMES_HOME") or Path.home() / ".hermes")
    skins_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else home / "skins"
    out_path = (
        Path(sys.argv[2])
        if len(sys.argv) > 2
        else home / "desktop-plugins" / "theme-picker" / "plugin.js"
    )

    user_skins = []
    for p in sorted(skins_dir.glob("*.yaml")):
        parsed = _parse_skin_file(p)
        if parsed:
            user_skins.append(parsed)

    builtins = _backend_builtins()
    names = {s["name"] for s in user_skins}
    all_skins = user_skins + [b for b in builtins if b["name"] not in names]
    # sort_keys=True keeps output byte-stable across runs (matches the shipped
    # plugin.js), so a rebuild with unchanged skins produces an identical file.
    data = json.dumps(all_skins, ensure_ascii=False, separators=(",", ":"), sort_keys=True)

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

    print(f"Rebuilt {out_path} with {len(all_skins)} skins "
          f"({len(user_skins)} user + {len(builtins)} built-in).")
    print("Next: copy plugin.js to the desktop machine and run "
          "'Reload desktop plugins' (Ctrl+K).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
