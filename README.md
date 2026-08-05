# Hermes Theme Picker

A self-contained theme picker for the **Hermes Desktop app**: browse and apply
Hermes skins with one click, plus a statusbar chip showing the active theme.

```
hermes-theme-picker/
├── plugin/
│   ├── plugin.js            ← the deliverable: copy this into the desktop app
│   └── plugin.template.js   ← source template (has __SKINS_DATA__ placeholder)
├── scripts/
│   └── regenerate.py        ← rebuild plugin.js after adding/editing skins
├── install/
│   └── install-windows.ps1  ← one-shot installer for Windows desktops
├── docs/
│   └── ARCHITECTURE.md      ← how the picker works internally
└── README.md
```

## What it does

- **Full Theme Picker page** at `/theme-picker` — grid of swatch cards (real
  palette strips), search box, ☀ light / ☾ dark filter, active-theme badge.
  Reachable from the statusbar chip, the sidebar nav row ("Theme Picker"), or
  Ctrl+K → "Open Theme Picker".
- **Apply with one click** — writes `display.skin` through the gateway RPC
  `config.set { key: 'skin' }`; the desktop repaints live.
- **Settings → Appearance integration** — every user skin is registered via
  `THEMES_AREA`, so the same themes appear in Appearance and can be switched
  there even when the gateway is offline.
- **Live discovery** — a skin applied from elsewhere (CLI `/skin`, another
  surface) appears in the picker automatically via the `skin.changed` event,
  even if it was installed after this plugin was built.

## Install

The plugin is **one self-contained file**: copy `plugin/plugin.js` into the
desktop app's plugin folder and reload plugins. No backend plugin, no Python
runtime, no credentials, nothing to enable.

The desktop app loads plugins from `<hermes home>/desktop-plugins/<id>/plugin.js`
on the machine running the desktop app. `<hermes home>` is:

| Platform | Path |
|---|---|
| Windows (Desktop install) | `%LOCALAPPDATA%\hermes` |
| macOS / Linux (CLI default) | `~/.hermes` |
| Custom | whatever `hermes doctor` reports |

```bash
# example (macOS/Linux)
mkdir -p ~/.hermes/desktop-plugins/theme-picker
cp plugin/plugin.js ~/.hermes/desktop-plugins/theme-picker/plugin.js
```

Windows: either copy the file to `%LOCALAPPDATA%\hermes\desktop-plugins\theme-picker\plugin.js`
or run `install\install-windows.ps1` (detects the Desktop home automatically).

Then reload plugins: **Ctrl+K → "Reload desktop plugins"** (or restart the app).

> **Topology note:** the skins themselves resolve on the Hermes **gateway**
> machine (where `$HERMES_HOME/skins/*.yaml` lives), not the desktop. A
> Windows desktop connected to a Linux gateway works fine: the picker applies
> via the gateway, and the gateway announces the change back. The desktop only
> needs the plugin file locally.

## Adding a new skin

1. Drop the skin YAML into the gateway's skins folder (`~/.hermes/skins/` or
   `$HERMES_HOME/skins/`).
2. **Apply it** (`hermes config set display.skin <name>` or `/skin <name>`) —
   it shows up in the picker immediately via live discovery.
3. **For the browsable catalog** (card visible before applying, survives
   restarts), regenerate the plugin:
   ```bash
   python3 scripts/regenerate.py
   ```
   This rebuilds `plugin/plugin.js` with every skin in the skins folder
   embedded. Re-copy it to the desktop and reload plugins.

## Updating the plugin after a code change

1. Edit `plugin/plugin.template.js`.
2. Rebuild:
   ```bash
   python3 scripts/regenerate.py
   ```
   (this also re-embeds the current skin catalog).
3. Copy `plugin/plugin.js` to the desktop machine, reload plugins.
4. Commit the template change.

## Uninstall

Delete `<hermes home>/desktop-plugins/theme-picker/` and reload plugins (or
restart the app). Skins are never touched.

## Compatibility

- Requires a Hermes desktop app that loads plugins from `desktop-plugins/`
  (any recent build).
- Apply path requires the gateway (`config.set` RPC). Offline, applying still
  works from Settings → Appearance because the themes are registered locally.
- The embedded catalog is a snapshot at build time; `regenerate.py` refreshes
  it. Built-in desktop skins (`nous`, `mono`, …) are never shadowed.
