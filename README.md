# Hermes Theme Picker

A visual theme picker for the **Hermes Desktop app**. Browse and apply Hermes
skins with one click, straight from a full-page gallery — no terminal commands
needed to switch themes.

![Theme Picker](docs/hermes-theme-picker.png)

## Features

- **Full-page picker** at `/theme-picker` — a grid of swatch cards showing each
  skin's real palette, with search and a light/dark filter.
- **One-click apply** — the desktop repaints instantly, and the choice persists.
- **Statusbar chip** — shows your current theme in the bottom bar; click it to
  open the picker.
- **Settings → Appearance integration** — every bundled skin also appears in
  the built-in Appearance settings, so you can switch themes there too (even
  without a gateway connection).
- **Live discovery** — apply a skin from anywhere (CLI, another surface) and it
  appears in the picker automatically.
- **74 bundled skins** (see [Third-Party Notices](THIRD_PARTY_NOTICES.md) for
  credits), plus every Hermes built-in theme.

## Requirements

- **Hermes Desktop app** (any recent build) — the plugin runs inside it.
- **Python 3.8+** with `pyyaml` — only needed for `regenerate.py` when you want
  to add your own skins; not needed to use the picker.
- A Hermes **gateway** for one-click apply (the desktop's normal backend). If
  the gateway is unreachable, skins can still be switched from Settings →
  Appearance.

## Quick start

1. **Copy the plugin into Hermes Desktop:**

   The desktop app loads plugins from a `desktop-plugins` folder inside its
   Hermes home. Find your Hermes home (run `hermes doctor` if unsure):

   | Platform | Typical Hermes home |
   |---|---|
   | Windows (Desktop install) | `%LOCALAPPDATA%\hermes` |
   | macOS / Linux (CLI default) | `~/.hermes` |

   ```bash
   # macOS / Linux
   mkdir -p ~/.hermes/desktop-plugins/theme-picker
   cp plugin/plugin.js ~/.hermes/desktop-plugins/theme-picker/plugin.js
   ```

   ```powershell
   # Windows — or just run install\install-windows.ps1
   New-Item -ItemType Directory -Force "$env:LOCALAPPDATA\hermes\desktop-plugins\theme-picker"
   Copy-Item plugin\plugin.js "$env:LOCALAPPDATA\hermes\desktop-plugins\theme-picker\plugin.js"
   ```

2. **Reload plugins:** in Hermes Desktop, press `Ctrl+K` and run
   **Reload desktop plugins** (or restart the app).

3. **Open the picker:** click the theme name in the bottom statusbar, or press
   `Ctrl+K` → **Open Theme Picker**.

That's it. Click any card to switch themes instantly.

## Adding your own skins

Skins are simple YAML files (name, description, colors). You can:

1. **Drop a skin YAML into your Hermes skins folder** (e.g. `~/.hermes/skins/`),
   apply it once (e.g. `hermes config set display.skin <name>`), and it will
   appear in the picker automatically via live discovery — no rebuild needed.

2. **Rebuild the bundled catalog** so the new skin appears as a normal card
   (browsable before applying, and included for anyone else who installs the
   plugin). See [regenerate.py](#regeneratepy) below.

## regenerate.py

`scripts/regenerate.py` rebuilds `plugin/plugin.js` with the current skin
catalog embedded. It reads every `*.yaml` from a skins folder, converts each
palette, and regenerates the plugin file.

```bash
# From a checkout — uses the bundled skins/, writes plugin/plugin.js
python3 scripts/regenerate.py

# Use a different skins folder (e.g. your live Hermes skins)
python3 scripts/regenerate.py ~/.hermes/skins

# Write to a specific output file
python3 scripts/regenerate.py ~/.hermes/skins /tmp/plugin.js
```

After regenerating, copy the new `plugin/plugin.js` into the desktop app and
reload plugins.

### Adding a skin to *this repo*

1. Add your `my-skin.yaml` to `skins/` (copy the structure of any existing one).
2. `python3 scripts/regenerate.py`
3. `git add skins/ plugin/plugin.js && git commit`

### How it works

`regenerate.py` parses each skin YAML, extracts the color keys the desktop
converter understands, pulls in the Hermes backend's built-in themes, and
splices everything into `plugin/plugin.template.js` (which contains the UI code
with a `__SKINS_DATA__` placeholder). Run it with no arguments from a checkout
and it writes `plugin/plugin.js`; run it from an installed plugin folder and it
writes back to the Hermes home.

> **Why embed the skins?** The plugin is a single self-contained file — no
> backend, no dependencies — so it works identically on any machine. The
> embedded catalog is a snapshot; `regenerate.py` refreshes it.

## Updating the plugin code

The UI lives in `plugin/plugin.template.js`. After editing it, rebuild with
`python3 scripts/regenerate.py`, copy the new `plugin/plugin.js` to your
desktop, and reload plugins.

## Uninstall

Delete the `theme-picker` folder from the desktop app's `desktop-plugins`
directory, then reload plugins or restart the app. Your skins are untouched.

## Project layout

```
├── plugin/
│   ├── plugin.js            ← the deliverable: copy into the desktop app
│   └── plugin.template.js   ← UI source (has __SKINS_DATA__ placeholder)
├── skins/                   ← 74 bundled skins (MIT, see notices)
├── scripts/
│   └── regenerate.py        ← rebuild plugin.js from skins + template
├── install/
│   └── install-windows.ps1  ← one-shot Windows installer
├── docs/ARCHITECTURE.md     ← how the picker works internally
├── LICENSE                  ← MIT (this project)
└── THIRD_PARTY_NOTICES.md   ← MIT notices for the bundled skins
```

## Credits

This project bundles skin palettes from two open-source packs. The picker code
itself is an original implementation — all credit for the **skins** goes to
their authors:

- **BChop's Hermes Skins Pack** — 50 skins ([GitHub](https://github.com/bchop-studio/hermes-skins-pack))
- **CliffWade's Hermes Desktop Theme Pack** — 24 skins ([GitHub](https://github.com/CliffWade/hermes-desktop-theme-pack)), whose theme-switcher concept also inspired this project

Both are MIT licensed; full license texts are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

MIT — see [LICENSE](LICENSE).
