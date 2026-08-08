# Architecture

How the Theme Picker works internally — written so the next maintainer (or a
fork for another setup) does not have to re-derive it from the Desktop source.

## Three-layer theme system (Desktop)

Hermes Desktop resolves themes from three layers:

1. **Built-in themes** — hardcoded in `apps/desktop/src/themes/presets.ts`.
2. **Backend skins** — pushed by the gateway and converted into Desktop themes.
3. **User and contributed themes** — loaded from local storage or registered by
   plugins through `THEMES_AREA`.

The picker uses layer 3 for its permanent catalog. It registers each embedded
scene through `THEMES_AREA`, seeds the same theme into Desktop's user-theme cache
for boot-time resolution, and persists the selected scene and mode per profile.
It then uses layer 2 to synchronize the concrete selected variant through the
gateway while retaining local application as the immediate path and fallback.

## Scene model

`plugin/plugin.js` embeds a generated `SKINS` array. Each entry is a scene with:

- a stable scene name and display label;
- `modeSupport`: `dynamic`, `dark`, or `light`;
- light and dark variant names;
- `lightColors` and `darkColors` preview palettes;
- source and description metadata.

A dynamic scene registers one `DesktopTheme`: `colors` is its real light
palette and `darkColors` is its real dark palette. A single-mode scene uses its
one real palette in both slots, matching Desktop's normal handling of a
single-mode imported skin.

## Apply path

```text
picker card or mode toggle
  → apply the same root CSS tokens used by Desktop's ThemeProvider
  → synchronize native mode, titlebar, and boot-paint colors
  → persist scene and mode in the active profile's Desktop records
  → queue config.set { key: "skin", value: concreteVariantName }
  → gateway broadcasts skin.changed to all connected Desktops and CLIs
  → after acknowledgement, reapply and persist the latest combined scene/mode
  → remain on the picker page for rapid theme comparison
```

Gateway requests are serialized so rapid clicking preserves selection order,
while every local repaint remains synchronous. A failed gateway request leaves
the local theme active and produces a warning instead of reloading the renderer.
Every Dynamic Scene mode uses a dedicated gateway alias whose backend theme is
single-mode (the same palette in `colors` and `darkColors`). This prevents
ThemeProvider's stale internal mode from selecting the opposite palette during
`skin.changed`, eliminating light/dark flashes on every connected Desktop. The
post-acknowledgement local repaint remains a final reconciliation fallback; the
gateway emits the event before resolving `config.set`, so it cannot block
cross-device propagation.

## Dynamic pairing and grouping

`scripts/regenerate.py` carries the 50 canonical pairs published by
CliffWade's v1.1.0 pack. It collapses each pair into one dynamic scene, then
adds the canonical Hermes defaults and keeps every remaining skin as a
single-mode scene. The UI always renders groups in this order:

1. **Dynamic Scenes**
2. **Dark Mode Only**
3. **Light Mode Only**

`daylight` and `warm-lightmode` are explicitly classified as light-only. The
top segmented control changes the active Desktop mode; it no longer filters the
catalog.

## Canonical Hermes defaults

The first dynamic scenes are Nous, Midnight, Ember, Mono, Cyberpunk, Rose,
Shadow Thief, and Hermes Teal. Their swatches are defined from the corresponding
Hermes Desktop/dashboard palettes. The retired backend `default` card is not
shown; Desktop's default identity is labeled **Nous**.

Core Desktop names (`nous`, `midnight`, `ember`, `mono`, `cyberpunk`, and
`slate`) remain native and are never shadowed. Additional scenes are registered
and cached locally.

## Live discovery

A `skin.changed` gateway event includes the active skin's full palette. When its
name is absent from the embedded catalog and from all paired variant names, the
picker normalizes it into a new single-mode scene for the current session.
Regeneration is still required to make that scene permanently browsable on
another device.

## Embedded catalog generation

`scripts/regenerate.py`:

- parses every `skins/*.yaml` file;
- collapses the 50 declared light/dark pairs;
- adds the eight canonical Desktop scenes;
- loads the nine canonical backend built-ins from the pinned
  `scripts/backend-builtins.json` snapshot, independent of the locally
  installed Hermes package;
- writes compact, key-sorted JSON into `plugin/plugin.template.js` to produce
  deterministic `plugin/plugin.js` output.

A no-skin guard prevents an empty or broken regeneration from replacing the
installed plugin.

## Bundled skins and provenance

`skins/` contains 140 unique YAML files:

- 50 designs from [BChop's Hermes Skins Pack](https://github.com/bchop-studio/hermes-skins-pack);
- all 100 themes from [CliffWade's Hermes Desktop Theme Pack](https://github.com/CliffWade/hermes-desktop-theme-pack) v1.1.0.

The sources overlap on 10 names. Those files use CliffWade's current v1.1.0
versions, leaving 140 unique names rather than 150. Both sources are MIT
licensed; see `THIRD_PARTY_NOTICES.md`.

## Responsive cards

The picker reads `host.state.viewport` and uses four columns at 900px and wider,
three columns from 620px, and two columns below 620px. Widths remain inline
because arbitrary Tailwind grid classes are not guaranteed to exist in the
Desktop build.

## Files

| File | Purpose |
|---|---|
| `plugin/plugin.js` | Generated deliverable copied into Desktop |
| `plugin/plugin.template.js` | Source of truth for picker UI and behavior |
| `skins/` | 140 vendored YAML palettes |
| `gateway-skins/` | 114 mode-locked light/dark transports for all 57 Dynamic Scenes |
| `scripts/regenerate.py` | Builds scenes and regenerates `plugin.js` |
| `scripts/backend-builtins.json` | Pinned backend palettes for environment-independent generation |
| `scripts/cliffwade-v1.1.0-sha256.json` | Pinned byte-identity manifest for the 100 vendored CliffWade v1.1.0 YAML files |
| `tests/test_regenerate.py` | Generator, pairing, mode-category, and installer tests |
| `tests/theme-persistence.test.mjs` | Desktop cache, grouping, persistence, and responsive tests |
| `install/install-macos.command` | macOS installer |
| `install/install-gateway-skins.sh` | Installs all synchronized palettes on a gateway host |
| `install/install-windows.ps1` | Windows installer |
| `THIRD_PARTY_NOTICES.md` | Upstream MIT notices and counts |
