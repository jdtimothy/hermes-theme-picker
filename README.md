# Hermes Theme Picker

A portable visual theme picker for the **Hermes Desktop app**. Browse and apply
Hermes skins with one click from a full-page gallery — no terminal commands
needed to switch themes, and no dependency on the gateway machine's filesystem.

![Theme Picker](docs/hermes-theme-picker.png)

## Features

- **Full-page picker** at `/theme-picker` — a grid of swatch cards showing each
  skin's real palette, with search and a light/dark filter.
- **Connection-independent catalog** — the picker carries its own theme data,
  so the same bundled skins are available whether Desktop is connected to a
  local gateway, a remote gateway, or temporarily offline.
- **Cross-device persistence** — install the plugin on any desktop device and
  its custom themes remain available in Settings → Appearance after restart;
  they do not depend on a skin folder existing on the connected gateway host.
- **One-click apply** — the desktop repaints instantly, and the choice persists.
- **Statusbar chip** — shows your current theme in the bottom bar; click it to
  open the picker.
- **Settings → Appearance integration** — every bundled skin also appears in
  the built-in Appearance settings, so you can switch themes there too (even
  without a gateway connection).
- **Live discovery** — apply a skin from anywhere (CLI, another surface) and it
  appears in the picker automatically.
- **76 bundled skins** (see [Third-Party Notices](THIRD_PARTY_NOTICES.md) for
  credits), plus every Hermes built-in theme.

## Why themes work across connections and devices

The picker is deliberately a self-contained Desktop plugin: its bundled skin
catalog is embedded in `plugin.js`, then registered locally with Hermes Desktop.
That means a Windows Desktop app connected to a Linux gateway has the same
picker catalog as a local Desktop app, even though the two machines do not share
a filesystem. The catalog is also saved into the Desktop's local theme store at
plugin load, so a selected custom theme can be resolved before plugins load on
the next app start.

This is different from the gateway's active skin: the gateway can still send a
`skin.changed` event for a newly activated Linux skin, allowing it to appear
live for the current session. To make a new skin part of the permanent picker
catalog on another device, regenerate and install that device's `plugin.js`.

### Set a theme on the active gateway

Use Hermes' configuration command to select a skin by name:

```bash
hermes config set display.skin <theme-name>
```

For example, to activate the bundled `retro-mac` skin:

```bash
hermes config set display.skin retro-mac
```

When Desktop is connected to a remote gateway, this command updates the
**currently active gateway** immediately. The active remote session receives
the theme change, so connected Desktop surfaces can repaint without waiting for
a restart.

> **Remote restart and durability:** setting a theme synchronizes the active
> selection; it does not permanently copy a newly live-discovered skin's YAML
> into the remote gateway. After that gateway restarts, a live-only theme is no
> longer available there until it is included in a newly generated `plugin.js`
> and that plugin is installed/reloaded on the Desktop device. For a theme to
> survive independently on the gateway itself, also keep its YAML in that
> gateway's `~/.hermes/skins/` directory.

## Requirements

- **Hermes Desktop app** (any recent build) — the plugin runs inside it.
- **Python 3.8+** with `pyyaml` — only needed for `regenerate.py` when you want
  to add your own skins; not needed to use the picker. On Windows, install it
  for the Python launcher with `py -m pip install --user PyYAML`.
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
   # Windows — double-click install\install-windows.cmd in Explorer,
   # or run it from a PowerShell prompt:
   .\install\install-windows.cmd
   ```

   The launcher starts PowerShell for this install only. If you prefer the
   script itself, right-click `install-windows.ps1` and choose **Run with
   PowerShell**; double-clicking a `.ps1` can open it in a text editor instead.

2. **Reload plugins:** in Hermes Desktop, press `Ctrl+K` and run
   **Reload desktop plugins** (or restart the app).

3. **Open the picker:** click the theme name in the bottom statusbar, or press
   `Ctrl+K` → **Open Theme Picker**.

That's it. Click any card to switch themes instantly.

## Adding your own skins

Skins are simple YAML files (name, description, colors). You can:

1. **Drop a skin YAML into your Hermes skins folder** (e.g. `~/.hermes/skins/`),
   then apply it once (e.g. `hermes config set display.skin <name>`). It appears
   immediately through live discovery for the current desktop session.

2. **Rebuild the bundled catalog** so the new skin appears as a normal card
   (browsable before applying, and included for anyone else who installs the
   plugin). See [regenerate.py](#regeneratepy) below.

### Windows: keep new skins in the picker after a restart

The Windows Desktop plugin is a self-contained catalog, so a skin added to
`%LOCALAPPDATA%\hermes\skins\` must be regenerated into `plugin.js` to stay in
the picker across restarts. From a repository checkout, run this in PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install\regenerate-windows.ps1
```

The runner combines the repository's bundled skins with every `*.yaml` in
`%LOCALAPPDATA%\hermes\skins\`, writes directly to
`%LOCALAPPDATA%\hermes\desktop-plugins\theme-picker\plugin.js`, and refuses to
replace the installed plugin if it cannot find any valid skins. Then press
`Ctrl+K` → **Reload desktop plugins** (or restart Hermes Desktop).

If PowerShell reports that PyYAML is unavailable, run:

```powershell
py -m pip install --user PyYAML
```

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
├── skins/                   ← 76 bundled skins (MIT, see notices)
├── scripts/
│   └── regenerate.py        ← rebuild plugin.js from skins + template
├── install/
│   ├── install-windows.cmd       ← double-clickable Windows launcher
│   ├── install-windows.ps1       ← installer logic
│   └── regenerate-windows.ps1    ← rebuilds Windows catalog with local skins
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
