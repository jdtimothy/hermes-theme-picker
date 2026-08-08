# Hermes Theme Picker

**Current version: v1.5.0** · [See what changed](CHANGELOG.md)

A portable visual theme picker for the **Hermes Desktop app**. Browse and apply
Hermes skins with one click from a full-page gallery, repaint the current
Desktop instantly, and synchronize the selected palette through the connected
gateway to every Desktop and CLI.

![Theme Picker](docs/hermes-theme-picker.png)

## Features

- **Full-page picker** at `/theme-picker` — a responsive grid of swatch cards
  showing each scene's real palette, with search and a light/dark mode switch.
- **Dynamic scenes first** — all 50 matched light/dark pairs plus Hermes'
  dual-mode defaults are grouped above dark-only and light-only scenes.
- **Connection-independent catalog** — the picker carries its own theme data,
  so the same bundled skins are available whether Desktop is connected to a
  local gateway, a remote gateway, or temporarily offline.
- **Cross-device persistence** — install the plugin on any desktop device and
  its custom themes remain available in Settings → Appearance after restart;
  they do not depend on a skin folder existing on the connected gateway host.
- **One-click apply** — the desktop repaints in place without leaving the
  picker, preserves the scene and mode choice per profile, then broadcasts the
  concrete light or dark palette through the connected gateway.
- **Gateway-wide synchronization** — the selected variant is sent with
  `config.set { key: "skin" }`, so all connected Desktops and CLIs update.
- **Statusbar chip** — shows your current theme in the bottom bar; click it to
  open the picker.
- **Settings → Appearance integration** — every bundled skin also appears in
  the built-in Appearance settings, so you can switch themes there too (even
  without a gateway connection).
- **Live discovery** — apply a skin from anywhere (CLI, another surface) and it
  appears in the picker automatically.
- **140 bundled skins** (see [Third-Party Notices](THIRD_PARTY_NOTICES.md) for
  credits), including all 100 themes from CliffWade's updated pack, plus every
  Hermes built-in theme.

## Hybrid local and gateway application

The picker applies each selection in two coordinated steps:

1. It repaints the current Desktop immediately from the palette embedded in
   `plugin.js`, without navigating away from the picker.
2. It sends the concrete light or dark skin name to the connected gateway. The
   gateway broadcasts `skin.changed`, repainting every connected Desktop and
   CLI with the same palette.

The embedded catalog remains a local fallback and supplies Desktop's richer
theme tokens. For gateway synchronization, install `skins/` plus the 114
mode-locked Dynamic Scene variants in `gateway-skins/` on the gateway host.
Dedicated aliases prevent Desktop's stale internal mode from briefly painting
the opposite palette while a gateway change propagates.

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
- A Hermes **gateway is required for cross-device synchronization**. If it is
  unavailable, the current Desktop still repaints and persists locally, and the
  picker displays a gateway synchronization warning.

## Installation

Clone or download this repository, then choose either the automatic installer
or the manual copy instructions below. Both methods install the same single
file, `plugin/plugin.js`; Python and the files in `skins/` are not needed just
to use the picker.

### Automatic installers

#### Windows

Double-click `install\install-windows.cmd` in File Explorer, or run it from
PowerShell:

```powershell
.\install\install-windows.cmd
```

The launcher runs the PowerShell installer with an execution-policy bypass for
that process only. You can alternatively right-click `install-windows.ps1` and
choose **Run with PowerShell**; double-clicking a `.ps1` may open it in an
editor instead of running it.

The Windows installer uses `%HERMES_HOME%` when it is set. Otherwise it installs
to `%LOCALAPPDATA%\hermes` when that Desktop home already exists, falling back
to `%USERPROFILE%\.hermes` for a CLI-style installation. It prints the exact
destination when it finishes.

#### macOS

Double-click `install/install-macos.command` in Finder, or run it from Terminal:

```bash
./install/install-macos.command
```

The installer uses `$HERMES_HOME` when it is set; otherwise it installs under
`~/.hermes`. If macOS blocks a downloaded script, right-click the file, choose
**Open**, and confirm once, or run it from Terminal with:

```bash
sh install/install-macos.command
```

### Manual installation

Hermes Desktop loads this plugin from a folder named `theme-picker` inside its
local `desktop-plugins` directory. Copy **`plugin/plugin.js` from this repo** to
the exact destination below (create the missing folders first):

| Platform | Plugin destination |
|---|---|
| Windows | `%LOCALAPPDATA%\hermes\desktop-plugins\theme-picker\plugin.js` |
| macOS | `~/.hermes/desktop-plugins/theme-picker/plugin.js` |
| Linux | `~/.hermes/desktop-plugins/theme-picker/plugin.js` |

If you have set `HERMES_HOME`, replace `%LOCALAPPDATA%\hermes` or `~/.hermes`
with that directory.

**Windows (PowerShell):**

```powershell
$dest = if ($env:HERMES_HOME) { $env:HERMES_HOME } else { "$env:LOCALAPPDATA\hermes" }
New-Item -ItemType Directory -Force "$dest\desktop-plugins\theme-picker" | Out-Null
Copy-Item .\plugin\plugin.js "$dest\desktop-plugins\theme-picker\plugin.js" -Force
```

**macOS or Linux:**

```bash
hermes_home="${HERMES_HOME:-$HOME/.hermes}"
mkdir -p "$hermes_home/desktop-plugins/theme-picker"
cp plugin/plugin.js "$hermes_home/desktop-plugins/theme-picker/plugin.js"
```

### Finish setup

1. On the machine running the connected gateway, install the bundled and
   canonical transport skins:

   ```bash
   ./install/install-gateway-skins.sh
   ```

   The script honors `$HERMES_HOME` and otherwise installs into
   `~/.hermes/skins/`. It does not require a Desktop or gateway restart. It
   refuses to overwrite a same-named modified skin; review and back up any
   reported collision before deliberately rerunning with `--force`. Destination
   symlinks are always refused, including in force mode.
2. In Hermes Desktop, open the Command Palette and run **Reload desktop
   plugins**. Restarting the app also works.
3. Click the theme name in the bottom statusbar, or open the Command Palette
   and run **Open Theme Picker**.

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
├── skins/                   ← 140 bundled skins (MIT, see notices)
├── scripts/
│   └── regenerate.py        ← rebuild plugin.js from skins + template
├── install/
│   ├── install-macos.command     ← double-clickable macOS installer
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

- **BChop's Hermes Skins Pack** — 50 original theme designs; 40 remain as
  exclusive files and 10 are represented by CliffWade's updated ports
  ([GitHub](https://github.com/bchop-studio/hermes-skins-pack))
- **CliffWade's Hermes Desktop Theme Pack** — all 100 skins from v1.1.0
  ([GitHub](https://github.com/CliffWade/hermes-desktop-theme-pack)), whose
  theme-switcher concept also inspired this project

Both are MIT licensed; full license texts are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

MIT — see [LICENSE](LICENSE).
