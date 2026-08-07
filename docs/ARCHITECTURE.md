# Architecture

How the Theme Picker works internally — written so the next maintainer (or a
fork for another setup) doesn't have to re-derive it from the desktop source.

## Three-layer theme system (desktop)

The Hermes desktop theme system has three independent layers:

1. **Built-in themes** — hardcoded in `apps/desktop/src/themes/presets.ts`
   (`nous`, `midnight`, `ember`, `mono`, `cyberpunk`, `slate`).
2. **Backend skins** — pushed via `skin.changed` / `gateway.ready` events from
   the Hermes gateway; converted by `skinToDesktopTheme()` and registered in
   `$backendThemes`. Only the ACTIVE skin is pushed.
3. **User themes** — registered via `THEMES_AREA` by plugins; stored in
   localStorage; appear in Settings → Appearance.

The picker uses layers 2 and 3: it registers every embedded user skin via
`THEMES_AREA` (so Appearance works offline), and it *applies* via the gateway
so the whole app repaints.

## Apply path (verified against the source)

```
picker click
  → host.request('config.set', { key: 'skin', value: <name> })
  → gateway writes display.skin (tui_gateway/server.py config.set handler)
  → gateway broadcasts skin.changed with the RESOLVED skin (full palette)
  → desktop ingestBackendSkin(skin, { apply: true })  (backend-sync.ts)
  → $pendingSkinApply → setTheme → repaint + persist per profile
```

**Critical:** the RPC key must be `'skin'`, NOT `'display.skin'`. The gateway
handler only accepts `prompt` / `personality` / `skin`; anything else returns
"unknown config key" and silently fails. (This was the bug that broke an early
version of the picker.)

## Reading the active skin

- `host.request('config.get', { key: 'skin' })` → `{ value: '<name>' }`
  (`'default'` when unset).
- `host.onEvent('skin.changed', e => e.payload.name)` — event payload is the
  resolved skin object `{ name, colors, ... }`.

## Live discovery

The `skin.changed` event carries the **full colors dict** of the newly active
skin. The picker keeps a `live` list: any event for a name NOT in the embedded
catalog gets normalized (`normalizeLiveSkin`) and added as a "New" card. So a
skin installed after build time appears the moment it's applied — no rebuild.

Limitation: the gateway only announces the *active* skin, so a fresh skin is
only discoverable AFTER being applied. `scripts/regenerate.py` embeds skins
into the browsable catalog before applying (the fully automatic path).

## Embedded catalog

`plugin/plugin.js` has a `const SKINS = [...]` array (generated, compact JSON):
name, description, category, isDark, source (`user`/`builtin`), and the hex
color keys the desktop converter uses. `plugin/plugin.template.js` is the same
file with `__SKINS_DATA__` as a placeholder; `scripts/regenerate.py` fills it.

`scripts/regenerate.py`:
- parses every `skins/*.yaml` (the repo's bundled `skins/` by default when
  running from a checkout, else `$HERMES_HOME/skins`),
- pulls backend built-ins via `hermes_cli.skin_engine.list_skins()`,
- writes `plugin/plugin.js` (repo layout) or back to the desktop-plugins
  folder (in-place layout).

## Bundled skins

`skins/` in this repo contains 74 skins: 50 from
[BChop's Hermes Skins Pack](https://github.com/bchop-studio/hermes-skins-pack)
and 24 from
[CliffWade's Hermes Desktop Theme Pack](https://github.com/CliffWade/hermes-desktop-theme-pack),
both MIT-licensed (see `THIRD_PARTY_NOTICES.md`). They are vendored so a fresh
clone is self-contained: `python3 scripts/regenerate.py` works immediately.
They are byte-identical to upstream; `regenerate.py` only reads their
`colors`/`description` and never modifies them.

## Registration rules

- User skins → `THEMES_AREA` (74 of them in the default pack).
- Backend built-ins (`default`, `ares`, `mono`, …) → shown in the picker as
  "Built-in" but NOT registered (the desktop already has presets for those
  names; `contributedThemes()` would skip them anyway).
- Desktop built-in names (`nous`, `mono`, `slate`) are never shadowed.

## Statusbar chip

Shows the active theme (color dot + name); click navigates to
`/theme-picker` (a `ROUTES_AREA` page). Pane-reveal APIs are internal to the
desktop, so a full page is the reliable way to "open the picker" from the chip.

## Files

| File | Purpose |
|---|---|
| `plugin/plugin.js` | Generated deliverable — copy into the desktop app |
| `plugin/plugin.template.js` | Source of truth for the UI code |
| `skins/` | 74 bundled skins (MIT, from the two packs) |
| `scripts/regenerate.py` | Rebuild plugin.js from skins + template |
| `install/install-windows.ps1` | Windows installer (detects Desktop home) |
| `LICENSE` | MIT license for this project |
| `THIRD_PARTY_NOTICES.md` | MIT notices for the bundled skins |
