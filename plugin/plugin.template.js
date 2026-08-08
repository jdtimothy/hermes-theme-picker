/**
 * theme-picker — browse and apply Hermes skins from a full-page picker.
 *
 * Self-contained: all scene color data is embedded (no Python backend, no REST),
 * so it works identically on any machine running Hermes Desktop. Applying a
 * scene mirrors Desktop's root-token application path immediately, then saves the
 * scene and mode for the next boot — no navigation or renderer reload. The
 * selected concrete light/dark variant is also queued through gateway
 * `config.set`, which broadcasts it to every connected Desktop and CLI.
 *
 * It also registers every scene via THEMES_AREA, so the same scenes show up
 * in Settings → Appearance and can be switched there (works even offline).
 *
 * Live discovery: when a skin is applied from elsewhere (CLI /skin, another
 * surface) the `skin.changed` event carries its full palette, so a skin NOT in
 * the embedded catalog (e.g. one you just installed) appears in the picker
 * immediately. To also have it in the browsable catalog before applying, run
 * the regeneration script (see scripts/regenerate.py) and re-copy plugin.js.
 *
 * Plain ESM loaded uncompiled: UI is jsx() calls, NOT JSX syntax; only
 * @hermes/plugin-sdk, react, react/jsx-runtime resolve.
 */

import {
  Badge,
  cn,
  EmptyState,
  haptic,
  host,
  PALETTE_AREA,
  ROUTES_AREA,
  ScrollArea,
  SearchField,
  SegmentedControl,
  SIDEBAR_NAV_AREA,
  STATUSBAR_AREAS,
  THEMES_AREA,
  useValue
} from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useMemo, useState } from 'react'

const ID = 'theme-picker'
const PAGE_PATH = '/theme-picker'
// Desktop reads this cache before plugins register, so a selected contributed
// theme remains resolvable during the next app startup.
const USER_THEMES_KEY = 'hermes-desktop-user-themes-v1'
const SKIN_KEY = 'hermes-desktop-theme-v2'
const MODE_KEY = 'hermes-desktop-mode-v1'
const PROFILE_SKINS_KEY = 'hermes-desktop-profile-themes-v1'
const PROFILE_MODES_KEY = 'hermes-desktop-profile-modes-v1'
const CORE_DESKTOP_THEMES = new Set(['nous', 'midnight', 'ember', 'mono', 'cyberpunk', 'slate'])
const EMOJI_FALLBACK = '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", emoji'
const DEFAULT_FONT_SANS = '"Segoe WPC", "Segoe UI", -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif, ' + EMOJI_FALLBACK
const DEFAULT_FONT_MONO = 'Menlo, Monaco, "SF Mono", "Courier Prime", monospace, ' + EMOJI_FALLBACK
const SCENE_TYPOGRAPHY = {
  nous: { fontMono: `"Courier Prime", ${DEFAULT_FONT_MONO}` },
  midnight: { fontMono: `"JetBrains Mono", ${DEFAULT_FONT_MONO}` },
  ember: { fontMono: `"IBM Plex Mono", ${DEFAULT_FONT_MONO}` },
  cyberpunk: {
    fontSans: `"Courier New", Courier, monospace, ${EMOJI_FALLBACK}`,
    fontMono: `"Courier New", Courier, monospace, ${EMOJI_FALLBACK}`
  }
}
let gatewaySyncQueue = Promise.resolve()
let applyGeneration = 0
const latestAppearanceByProfile = new Map()

// ---------------------------------------------------------------------------
// Embedded skin catalog — generated from ~/.hermes/skins/*.yaml + backend
// built-ins (see scripts/regenerate.py at the bottom of this folder).
// ---------------------------------------------------------------------------

const SKINS = __SKINS_DATA__

// ---------------------------------------------------------------------------
// Color math — faithful port of apps/desktop/src/themes/color.ts
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const clean = String(hex || '').trim().replace(/^#/, '')
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)]
}

function rgbToHex(rgb) {
  return `#${rgb
    .map(n => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0'))
    .join('')}`
}

function mix(a, b, amount) {
  const ar = hexToRgb(a)
  const br = hexToRgb(b)
  return ar && br
    ? rgbToHex([ar[0] + (br[0] - ar[0]) * amount, ar[1] + (br[1] - ar[1]) * amount, ar[2] + (br[2] - ar[2]) * amount])
    : a
}

function luminance(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const [r, g, b] = rgb.map(v => v / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function relativeLuminance(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const linear = v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = rgb.map(v => linear(v / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(a, b) {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return la >= lb ? (la + 0.05) / (lb + 0.05) : (lb + 0.05) / (la + 0.05)
}

function readableOn(hex) {
  return relativeLuminance(hex) > 0.58 ? '#161616' : '#ffffff'
}

function ensureContrast(color, bg, min) {
  if (contrastRatio(color, bg) >= min) return color
  const towards = relativeLuminance(bg) < 0.5 ? '#ffffff' : '#000000'
  let best = color
  for (let amount = 0.2; amount <= 1.0001; amount += 0.2) {
    best = mix(color, towards, Math.min(amount, 1))
    if (contrastRatio(best, bg) >= min) return best
  }
  return best
}

// ---------------------------------------------------------------------------
// Skin → DesktopTheme — faithful port of skinToDesktopTheme() (themes/skin.ts)
// ---------------------------------------------------------------------------

function skinToDesktopTheme(skin) {
  const colors = skin.colors || {}
  const pick = keys => {
    for (const key of keys) {
      const v = colors[key]
      if (typeof v === 'string' && hexToRgb(v)) return v
    }
    return null
  }

  const seededBg = pick(['background', 'status_bar_bg']) || '#000000'
  const foregroundSeed = pick(['ui_text', 'banner_text', 'status_bar_text']) || null
  const background = seededBg !== '#000000'
    ? seededBg
    : foregroundSeed && luminance(foregroundSeed) > 0.5 ? '#141414' : '#f7f7f8'
  const dark = luminance(background) < 0.4
  const foreground = foregroundSeed || (dark ? '#e6e6e6' : '#161616')

  const accentSeed = pick(['ui_accent', 'banner_accent', 'banner_title']) || mix(foreground, background, 0.55)
  const sidebar = mix(background, foreground, dark ? 0.02 : 0.012)
  const accent = ensureContrast(accentSeed, sidebar, 4.5)
  const border = pick(['ui_border', 'banner_border']) || mix(background, foreground, dark ? 0.16 : 0.14)
  const mutedForeground = pick(['banner_dim', 'session_border']) || mix(foreground, background, 0.45)
  const destructive = pick(['ui_error']) || '#e25563'

  const palette = {
    background,
    foreground,
    card: mix(background, foreground, dark ? 0.04 : 0.025),
    cardForeground: foreground,
    muted: mix(background, foreground, dark ? 0.06 : 0.04),
    mutedForeground,
    popover: mix(background, foreground, dark ? 0.08 : 0.05),
    popoverForeground: foreground,
    primary: accent,
    primaryForeground: readableOn(accent),
    secondary: mix(accent, background, dark ? 0.72 : 0.86),
    secondaryForeground: foreground,
    accent: mix(accent, background, dark ? 0.82 : 0.88),
    accentForeground: foreground,
    border,
    input: pick(['completion_menu_bg']) || mix(background, foreground, dark ? 0.1 : 0.06),
    ring: accent,
    midground: accent,
    midgroundForeground: readableOn(accent),
    composerRing: accent,
    destructive,
    destructiveForeground: readableOn(destructive),
    sidebarBackground: sidebar,
    sidebarBorder: border,
    userBubble: mix(background, accent, dark ? 0.18 : 0.12),
    userBubbleBorder: border
  }

  return {
    name: skin.name,
    label: skin.name.charAt(0).toUpperCase() + skin.name.slice(1),
    description: skin.description || 'Hermes skin',
    colors: palette,
    darkColors: palette
  }
}

function sceneToDesktopTheme(scene) {
  const lightColors = scene.lightColors || scene.darkColors || scene.colors || {}
  const darkColors = scene.darkColors || scene.lightColors || scene.colors || {}
  const light = skinToDesktopTheme({ ...scene, colors: lightColors })
  const dark = skinToDesktopTheme({ ...scene, colors: darkColors })
  return {
    ...light,
    label: scene.label || light.label,
    description: scene.description || 'Theme Picker scene',
    colors: light.colors,
    darkColors: dark.colors,
    typography: SCENE_TYPOGRAPHY[scene.name],
    themePickerManaged: true
  }
}

function renderedModeFor(colors, mode) {
  return luminance(colors.background) > 0.5 ? 'light' : hexToRgb(colors.background) ? 'dark' : mode
}

const NEUTRAL_CHROME = { light: '#f3f3f3', dark: '#0d0d0e' }

function mixesFor(isDark) {
  return {
    '--theme-mix-chrome': isDark ? '74%' : '92%',
    '--theme-mix-sidebar': '100%',
    '--theme-mix-card': isDark ? '38%' : '22%',
    '--theme-mix-elevated': isDark ? '46%' : '28%',
    '--theme-mix-bubble': isDark ? '46%' : '0%'
  }
}

/**
 * Immediate local repaint — a source-faithful port of Desktop's applyTheme().
 * The public plugin SDK does not expose ThemeContext.setTheme/setMode, so this
 * updates the same root tokens and native window hooks without navigating or
 * remounting the React app. Persistence is handled separately for next boot.
 */
function applyDesktopTheme(theme, mode) {
  const root = document.documentElement
  const c = mode === 'dark' ? (theme.darkColors || theme.colors) : theme.colors
  const typo = {
    fontSans: DEFAULT_FONT_SANS,
    fontMono: DEFAULT_FONT_MONO,
    ...(theme.typography || {})
  }
  const rendered = renderedModeFor(c, mode)
  const isDark = rendered === 'dark'
  const midground = c.midground || c.ring

  root.style.setProperty('color-scheme', rendered)
  root.dataset.hermesTheme = theme.name
  root.dataset.hermesMode = rendered
  root.classList.toggle('dark', isDark)

  const seeds = {
    '--theme-foreground': c.foreground,
    '--theme-primary': c.primary,
    '--theme-secondary': c.secondary,
    '--theme-accent-soft': c.accent,
    '--theme-midground': midground,
    '--theme-warm': c.primary,
    '--theme-background-seed': c.background,
    '--theme-sidebar-seed': c.sidebarBackground || c.background,
    '--theme-card-seed': c.card,
    '--theme-elevated-seed': c.popover,
    '--theme-bubble-seed': c.userBubble || c.popover
  }
  const palette = {
    '--dt-primary-foreground': c.primaryForeground,
    '--dt-secondary-foreground': c.secondaryForeground,
    '--dt-accent-foreground': c.accentForeground,
    '--dt-border': c.border,
    '--dt-input': c.input,
    '--dt-ring': c.ring,
    '--dt-muted': c.muted,
    '--dt-midground-foreground': c.midgroundForeground || readableOn(midground),
    '--dt-composer-ring': c.composerRing || midground,
    '--dt-destructive': c.destructive,
    '--dt-destructive-foreground': c.destructiveForeground,
    '--dt-sidebar-border': c.sidebarBorder || c.border,
    '--dt-user-bubble-border': c.userBubbleBorder || c.border,
    '--dt-font-sans': typo.fontSans,
    '--dt-font-mono': typo.fontMono,
    '--noise-opacity-mul': isDark ? 'calc(0.04 / 0.21)' : 'calc(0.34 / 0.21)'
  }
  for (const [key, value] of Object.entries({ ...seeds, ...mixesFor(isDark), ...palette })) {
    if (value) root.style.setProperty(key, value)
  }

  const chromeBg = mix(c.background, NEUTRAL_CHROME[isDark ? 'dark' : 'light'], isDark ? 0.26 : 0.08)
  try {
    window.hermesDesktop?.setTitleBarTheme?.({ background: chromeBg, foreground: c.foreground })
    window.hermesDesktop?.setNativeTheme?.(rendered)
  } catch {
    // Native chrome hooks are optional; the renderer repaint is already done.
  }
  try {
    window.localStorage.setItem('hermes-boot-background', chromeBg)
    window.localStorage.setItem('hermes-boot-color-scheme', rendered)
  } catch {
    // Restricted storage must not block the current in-place repaint.
  }

}

function isLegacyPickerTheme(existing, theme) {
  const legacyLabel = theme.name.charAt(0).toUpperCase() + theme.name.slice(1)
  const expectedPalette = theme.darkColors || theme.colors
  const expected = JSON.stringify(expectedPalette)
  return Boolean(existing && existing.colors && existing.darkColors &&
    existing.label === legacyLabel && existing.description === theme.description &&
    JSON.stringify(existing.colors) === expected &&
    JSON.stringify(existing.darkColors) === expected)
}

function persistThemesForBoot(themes) {
  try {
    const raw = window.localStorage.getItem(USER_THEMES_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    const stored = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}

    let changed = false
    for (const theme of themes) {
      // Native imports take precedence over a plugin contribution with the same
      // name, matching the desktop's user-theme resolution order.
      const existing = stored[theme.name]
      if (!existing || existing.themePickerManaged || isLegacyPickerTheme(existing, theme)) {
        stored[theme.name] = theme
        changed = true
      }
    }
    if (changed) window.localStorage.setItem(USER_THEMES_KEY, JSON.stringify(stored))
    return true
  } catch {
    // Storage is best-effort; the current session can still use contributed themes.
    return false
  }
}

function readRecord(key) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function persistAppearance(themeName, mode, profile = 'default') {
  try {
    if (profile === 'default') {
      window.localStorage.setItem(SKIN_KEY, themeName)
      window.localStorage.setItem(MODE_KEY, mode)
      return true
    }
    window.localStorage.setItem(PROFILE_SKINS_KEY, JSON.stringify({ ...readRecord(PROFILE_SKINS_KEY), [profile]: themeName }))
    window.localStorage.setItem(PROFILE_MODES_KEY, JSON.stringify({ ...readRecord(PROFILE_MODES_KEY), [profile]: mode }))
    return true
  } catch {
    return false
  }
}

function readAppearance(profile = 'default') {
  try {
    const theme = profile === 'default'
      ? window.localStorage.getItem(SKIN_KEY)
      : readRecord(PROFILE_SKINS_KEY)[profile] || window.localStorage.getItem(SKIN_KEY)
    const mode = profile === 'default'
      ? window.localStorage.getItem(MODE_KEY)
      : readRecord(PROFILE_MODES_KEY)[profile] || window.localStorage.getItem(MODE_KEY)
    return { theme: theme || 'nous', mode: mode === 'dark' ? 'dark' : 'light' }
  } catch {
    return { theme: 'nous', mode: 'light' }
  }
}

function desktopModeFor(profile, renderedMode) {
  return renderedMode === 'light' || renderedMode === 'dark'
    ? renderedMode
    : readAppearance(profile).mode
}

function sceneForThemeName(themeName) {
  return SKINS.find(item =>
    item.name === themeName || item.lightName === themeName || item.darkName === themeName ||
    item.gatewayLightName === themeName || item.gatewayDarkName === themeName
  )
}

function sceneNameFor(themeName) {
  const scene = sceneForThemeName(themeName)
  return scene ? scene.name : themeName
}

function migrateAppearanceAliases() {
  let storedThemes = {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(USER_THEMES_KEY) || '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) storedThemes = parsed
  } catch {
    // A malformed cache must not block ordinary alias migration.
  }

  const alias = name => {
    if (name === 'default') return { name: 'nous', mode: null }
    const lightScene = SKINS.find(item =>
      (item.lightName === name && item.lightName !== item.name) || item.gatewayLightName === name
    )
    if (lightScene) return { name: lightScene.name, mode: 'light' }
    // Paired source packs conventionally use the dark source name as the new
    // combined scene name. Only infer dark mode when the selected cached theme
    // is the legacy picker-managed single-palette shape; otherwise the same
    // scene name may be an intentional current Light selection or user import.
    const canonicalDarkScene = SKINS.find(item =>
      item.modeSupport === 'dynamic' && item.darkName === name && item.name === name
    )
    if (canonicalDarkScene) {
      const combined = sceneToDesktopTheme(canonicalDarkScene)
      if (isLegacyPickerTheme(storedThemes[name], combined)) {
        return { name: canonicalDarkScene.name, mode: 'dark' }
      }
    }
    const darkScene = SKINS.find(item =>
      (item.darkName === name && item.darkName !== item.name) || item.gatewayDarkName === name
    )
    return darkScene ? { name: darkScene.name, mode: 'dark' } : null
  }

  try {
    const globalTheme = window.localStorage.getItem(SKIN_KEY)
    const globalAlias = alias(globalTheme)
    if (globalAlias) {
      window.localStorage.setItem(SKIN_KEY, globalAlias.name)
      if (globalAlias.mode) window.localStorage.setItem(MODE_KEY, globalAlias.mode)
    }

    const themes = readRecord(PROFILE_SKINS_KEY)
    const modes = readRecord(PROFILE_MODES_KEY)
    let changed = false
    for (const [profile, name] of Object.entries(themes)) {
      const match = alias(name)
      if (!match) continue
      themes[profile] = match.name
      if (match.mode) modes[profile] = match.mode
      changed = true
    }
    if (changed) {
      window.localStorage.setItem(PROFILE_SKINS_KEY, JSON.stringify(themes))
      window.localStorage.setItem(PROFILE_MODES_KEY, JSON.stringify(modes))
    }
  } catch {
    // Migration is best-effort and must not prevent plugin registration.
  }
}

function columnsForWidth(width) {
  if (width >= 900) return 4
  if (width >= 620) return 3
  return 2
}

function buildThemeGroups(scenes) {
  return [
    { id: 'dynamic', title: 'Dynamic Scenes', scenes: scenes.filter(scene => scene.modeSupport === 'dynamic') },
    { id: 'dark', title: 'Dark Mode Only', scenes: scenes.filter(scene => scene.modeSupport === 'dark') },
    { id: 'light', title: 'Light Mode Only', scenes: scenes.filter(scene => scene.modeSupport === 'light') }
  ]
}

// ---------------------------------------------------------------------------
// Active-skin tracking + live discovery of skins applied elsewhere.
// `skin.changed` events carry the full palette of the newly active skin, so a
// skin installed after this plugin was built shows up as soon as it is applied.
// ---------------------------------------------------------------------------

function useActiveSkin() {
  const profile = useValue(host.state.profile) || 'default'
  const [active, setActive] = useState(() => sceneNameFor(readAppearance(profile).theme))
  const [live, setLive] = useState([])

  useEffect(() => {
    let mounted = true
    setActive(sceneNameFor(readAppearance(profile).theme))

    const root = document.documentElement
    const sync = () => {
      if (mounted && root.dataset.hermesTheme) setActive(sceneNameFor(root.dataset.hermesTheme))
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['data-hermes-theme'] })

    const off = host.onEvent('skin.changed', event => {
      if (!mounted) return
      const skin = event && event.payload
      const name = skin && skin.name
      if (!name) return
      // Live-discover skins outside the embedded catalog (freshly installed).
      if (!sceneForThemeName(name)) {
        setLive(prev => {
          if (prev.some(s => s.name === name)) return prev
          return [...prev, normalizeLiveSkin(skin)]
        })
      }
    })

    return () => {
      mounted = false
      observer.disconnect()
      off()
    }
  }, [profile])

  return [active, setActive, live]
}

function normalizeLiveSkin(skin) {
  const colors = (skin && skin.colors) || {}
  const isHex = v => typeof v === 'string' && /^#([0-9a-f]{6})$/i.test(v)
  const bg = isHex(colors.background) ? colors.background : isHex(colors.status_bar_bg) ? colors.status_bar_bg : ''
  const text = isHex(colors.banner_text) ? colors.banner_text : isHex(colors.ui_text) ? colors.ui_text : ''
  const isDark = bg ? luminance(bg) < 0.5 : text ? luminance(text) < 0.5 : true
  return {
    name: skin.name,
    label: skin.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: skin.description || 'Newly installed skin',
    category: 'New',
    source: 'live',
    modeSupport: isDark ? 'dark' : 'light',
    lightColors: isDark ? null : colors,
    darkColors: isDark ? colors : null,
    lightName: isDark ? null : skin.name,
    darkName: isDark ? skin.name : null,
    colors
  }
}

function gatewaySkinNameFor(scene, mode) {
  return mode === 'dark'
    ? scene.gatewayDarkName || scene.darkName || scene.name
    : scene.gatewayLightName || scene.lightName || scene.name
}

function persistLatestAppearance(profile) {
  const latest = latestAppearanceByProfile.get(profile)
  return latest ? persistAppearance(latest.scene.name, latest.mode, profile) : true
}

function snapshotPersistedAppearances() {
  const themes = readRecord(PROFILE_SKINS_KEY)
  const modes = readRecord(PROFILE_MODES_KEY)
  const profiles = new Set(['default', ...Object.keys(themes), ...Object.keys(modes)])
  const snapshot = new Map()
  for (const profile of profiles) {
    const appearance = readAppearance(profile)
    const scene = sceneForThemeName(appearance.theme)
    if (scene) snapshot.set(profile, { scene, mode: appearance.mode })
  }
  return snapshot
}

function syncSceneToGateway(scene, mode, profile, generation) {
  const skinName = gatewaySkinNameFor(scene, mode)
  const perform = async () => {
    if ((host.state.profile.get() || 'default') !== profile) return false
    // Capture every persisted profile before config.set can broadcast and let
    // Desktop overwrite the newly active profile with this request's alias.
    const recoveryAppearances = snapshotPersistedAppearances()
    try {
      await host.request('config.set', { key: 'skin', value: skinName })
      // The broadcast applies the concrete gateway variant in Desktop before
      // this RPC resolves. ThemeProvider may apply that concrete skin through
      // its stale internal mode (the SDK has no setMode), so restore the latest
      // combined scene both visibly and durably. A stale acknowledgement must
      // never overwrite or repaint over a newer rapid selection.
      const latest = latestAppearanceByProfile.get(profile)
      const activeProfile = host.state.profile.get() || 'default'
      const isActiveProfile = activeProfile === profile
      if (latest && isActiveProfile) {
        applyDesktopTheme(sceneToDesktopTheme(latest.scene), latest.mode)
      } else if (!isActiveProfile) {
        // config.set broadcasts before resolving, so this old-profile request
        // may have just repainted the profile the user switched into. Restore
        // that active profile from its own latest selection, never from the
        // completed request's old-profile map entry.
        const activeRecovery = latestAppearanceByProfile.get(activeProfile) ||
          recoveryAppearances.get(activeProfile) || recoveryAppearances.get('default')
        if (activeRecovery) {
          applyDesktopTheme(sceneToDesktopTheme(activeRecovery.scene), activeRecovery.mode)
          persistAppearance(activeRecovery.scene.name, activeRecovery.mode, activeProfile)
        }
      }
      const durable = persistLatestAppearance(profile)
      if (!durable && latestAppearanceByProfile.get(profile)?.generation === generation) {
        host.notify({
          kind: 'warning',
          message: `${scene.label || scene.name} synchronized, but its combined scene could not be saved for restart`
        })
      }
      return true
    } catch {
      const latest = latestAppearanceByProfile.get(profile)
      const isLatest = latest?.generation === generation
      const isActiveProfile = (host.state.profile.get() || 'default') === profile
      if (isLatest && isActiveProfile) {
        // An older queued request may already have broadcast and repainted the
        // root before this latest request failed. Reassert the user's latest
        // optimistic selection in the live Desktop as well as in persistence.
        applyDesktopTheme(sceneToDesktopTheme(latest.scene), latest.mode)
      }
      persistLatestAppearance(profile)
      if (isLatest && isActiveProfile) {
        host.notify({
          kind: 'warning',
          message: `${scene.label || scene.name} is active here, but the connected gateway could not apply "${skinName}"`
        })
      }
      return false
    }
  }
  const queued = gatewaySyncQueue.then(perform, perform)
  gatewaySyncQueue = queued.then(() => undefined, () => undefined)
  return queued
}

function applyScene(scene, mode, setActive) {
  const profile = host.state.profile.get() || 'default'
  const generation = ++applyGeneration
  latestAppearanceByProfile.set(profile, { generation, scene, mode })
  const theme = sceneToDesktopTheme(scene)
  const bootThemeSaved = CORE_DESKTOP_THEMES.has(scene.name) || persistThemesForBoot([theme])
  applyDesktopTheme(theme, mode)
  const appearanceSaved = persistAppearance(scene.name, mode, profile)
  const persisted = bootThemeSaved && appearanceSaved
  haptic('tap')
  setActive(scene.name)
  if (!persisted) {
    host.notify({
      kind: 'warning',
      message: `${scene.label || scene.name} applied for this session but could not be saved for restart`
    })
  }
  return syncSceneToGateway(scene, mode, profile, generation)
}

// ---------------------------------------------------------------------------
// Picker UI (shared by the pane and the full page)
// ---------------------------------------------------------------------------

function ThemeCard({ scene, mode, active, applying, onApply }) {
  const c = (mode === 'dark' ? scene.darkColors : scene.lightColors) || scene.colors || {}
  const isActive = scene.name === active
  const strip = [
    c.background || c.status_bar_bg,
    c.ui_accent || c.banner_accent || c.banner_title,
    c.ui_tool || c.banner_accent || c.banner_title,
    c.banner_text || c.ui_text,
    c.ui_border || c.banner_border
  ].filter(Boolean)

  return jsxs('button', {
    type: 'button',
    onClick: () => onApply(scene),
    disabled: applying === scene.name,
    title: `${scene.description || scene.name} (${scene.modeSupport === 'dynamic' ? `${mode} variant` : `${scene.modeSupport} only`})`,
    className: cn(
      'group flex w-full flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors',
      isActive
        ? 'border-(--ui-accent) bg-(--ui-bg-tertiary)'
        : 'border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) hover:border-(--ui-stroke-strong)'
    ),
    children: [
      jsx('div', {
        className: 'flex h-5 w-full overflow-hidden rounded-[4px] ring-1 ring-black/15',
        children: strip.map((color, i) =>
          jsx('span', { key: i, className: 'h-full flex-1', style: { backgroundColor: color } })
        )
      }),
      jsxs('div', {
        className: 'flex w-full items-center justify-between gap-1',
        children: [
          jsxs('span', {
            className: 'flex min-w-0 items-center gap-1',
            children: [
              jsx('span', {
                className: cn('shrink-0 text-[0.6875rem] leading-none', mode === 'dark' ? 'text-(--ui-accent)' : 'text-(--ui-warn)'),
                children: scene.modeSupport === 'dynamic' ? '⇄' : scene.modeSupport === 'dark' ? '☾' : '☀'
              }),
              jsx('span', { className: 'truncate text-[0.6875rem] font-medium', children: scene.label || scene.name.replace(/-/g, ' ') })
            ]
          }),
          isActive
            ? jsx(Badge, { variant: 'outline', className: 'shrink-0 px-1 text-[0.5625rem] text-(--ui-accent)', children: 'ACTIVE' })
            : jsx('span', { className: 'shrink-0 text-[0.5625rem] uppercase tracking-wide text-(--ui-text-tertiary)', children: scene.modeSupport === 'dynamic' ? mode : scene.modeSupport })
        ]
      })
    ]
  })
}

function ThemePicker() {
  const [active, setActive, live] = useActiveSkin()
  const [q, setQ] = useState('')
  const [applying, setApplying] = useState(null)
  const profile = useValue(host.state.profile) || 'default'
  const viewport = useValue(host.state.viewport)
  const [mode, setMode] = useState(() => desktopModeFor(profile, document.documentElement.dataset.hermesMode))

  useEffect(() => {
    const root = document.documentElement
    const sync = () => setMode(desktopModeFor(profile, root.dataset.hermesMode))
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['data-hermes-mode'] })
    return () => observer.disconnect()
  }, [profile])

  const allSkins = useMemo(() => {
    const known = new Set(SKINS.map(s => s.name))
    return [...SKINS, ...live.filter(s => !known.has(s.name))]
  }, [live])

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return allSkins.filter(s => {
      if (ql && !`${s.name} ${s.label || ''} ${s.description || ''}`.toLowerCase().includes(ql)) return false
      return true
    })
  }, [allSkins, q])

  const onApply = scene => {
    const nextMode = scene.modeSupport === 'dynamic' ? mode : scene.modeSupport
    setApplying(scene.name)
    try {
      applyScene(scene, nextMode, setActive)
    } finally {
      setApplying(null)
    }
  }

  const onModeChange = next => {
    if (next !== 'light' && next !== 'dark') return
    setMode(next)
    const scene = allSkins.find(item => item.name === active)
    if (scene) applyScene(scene, next, setActive)
  }

  const cols = columnsForWidth(viewport.width)
  const gap = cols > 2 ? 12 : 8
  const cardWidth = `calc((100% - ${gap * (cols - 1)}px) / ${cols})`
  const groups = buildThemeGroups(filtered).filter(group => group.scenes.length)
  const activeScene = allSkins.find(scene => scene.name === active)
  const activeColors = activeScene && ((mode === 'dark' ? activeScene.darkColors : activeScene.lightColors) || activeScene.colors)

  return jsxs('div', {
    className: 'flex h-full min-h-0 flex-col',
    children: [
      jsxs('div', {
        className: 'flex flex-col gap-2 border-b border-(--ui-stroke-secondary) p-3',
        children: [
          jsxs('div', {
            className: 'flex items-center justify-between gap-2',
            children: [
              jsx('div', { className: 'text-sm font-semibold', children: 'Theme Picker' }),
              jsxs('div', {
                className: 'flex min-w-0 items-center gap-1.5',
                children: [
                  active
                    ? jsxs('span', {
                        className: 'flex min-w-0 items-center gap-1 rounded-full border border-(--ui-stroke-secondary) px-2 py-0.5',
                        children: [
                          jsx('span', {
                            className: 'h-2 w-2 shrink-0 rounded-full',
                            style: { backgroundColor: activeColors?.ui_accent || activeColors?.banner_accent || 'var(--ui-accent)' }
                          }),
                          jsx('span', { className: 'truncate text-[0.6875rem] text-(--ui-text-secondary)', children: activeScene?.label || active.replace(/-/g, ' ') })
                        ]
                      })
                    : null,
                  jsx(Badge, { variant: 'muted', children: `${filtered.length}` })
                ]
              })
            ]
          }),
          jsx(SearchField, {
            placeholder: 'Search scenes…',
            value: q,
            onChange: v => setQ(typeof v === 'string' ? v : '')
          }),
          jsx(SegmentedControl, {
            options: [
              { id: 'dark', label: '☾ Dark mode' },
              { id: 'light', label: '☀ Light mode' }
            ],
            value: mode,
            onChange: onModeChange
          })
        ]
      }),
      jsx(ScrollArea, {
        className: 'min-h-0 flex-1 p-2',
        children:
          filtered.length === 0
            ? jsx(EmptyState, { title: 'No scenes found', description: 'Try a different search.' })
            : jsx('div', {
                className: 'flex flex-col gap-4',
                children: groups.map((group, index) =>
                  jsxs('section', {
                    key: group.id,
                    className: index ? 'border-t border-(--ui-stroke-secondary) pt-4' : '',
                    children: [
                      jsx('div', {
                        className: 'mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-(--ui-text-tertiary)',
                        children: `${group.title} (${group.scenes.length})`
                      }),
                      jsx('div', {
                        className: 'flex flex-wrap',
                        style: { gap },
                        children: group.scenes.map(scene =>
                          jsx('div', {
                            key: scene.name,
                            style: { width: cardWidth },
                            children: jsx(ThemeCard, { scene, mode: scene.modeSupport === 'dynamic' ? mode : scene.modeSupport, active, applying, onApply })
                          })
                        )
                      })
                    ]
                  })
                )
              })
      })
    ]
  })
}

// ---------------------------------------------------------------------------
// Statusbar chip — shows the active theme, opens the Theme Picker page
// ---------------------------------------------------------------------------

function ThemeChip() {
  const [active] = useActiveSkin()

  return jsx('button', {
    type: 'button',
    onClick: () => {
      haptic('tap')
      host.navigate(PAGE_PATH)
    },
    title: `Active theme: ${active || 'nous'} — open Theme Picker`,
    className: 'flex h-full items-center gap-1 px-1.5 text-[0.6875rem] text-(--ui-text-secondary) transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground',
    children: [
      jsx('span', {
        className: 'h-2 w-2 shrink-0 rounded-full',
        style: { backgroundColor: (SKINS.find(s => s.name === active) || {}).colors?.ui_accent || 'var(--ui-accent)' }
      }),
      jsx('span', { className: 'max-w-24 truncate', children: active ? (SKINS.find(s => s.name === active)?.label || active.replace(/-/g, ' ')) : 'Nous' })
    ]
  })
}

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

export default {
  id: ID,
  name: 'Theme Picker',
  register(ctx) {
    migrateAppearanceAliases()
    // Register each scene as one Desktop theme. Matched scenes carry a true
    // light palette plus darkColors, so Desktop's mode switch changes polarity
    // without creating duplicate Appearance entries. Core names stay native.
    const userThemes = SKINS
      .filter(scene => !CORE_DESKTOP_THEMES.has(scene.name))
      .map(sceneToDesktopTheme)
      .filter(Boolean)
    persistThemesForBoot(userThemes)
    for (const theme of userThemes) {
      ctx.register({
        id: `theme:${theme.name}`,
        area: THEMES_AREA,
        data: theme
      })
    }

    // A full page — reachable from the statusbar chip, sidebar nav, and palette.
    ctx.register({
      id: 'theme-picker-page',
      area: ROUTES_AREA,
      data: { path: PAGE_PATH },
      render: () => jsx('div', { className: 'h-full', children: jsx(ThemePicker, {}) })
    })
    ctx.register({
      id: 'theme-picker-nav',
      area: SIDEBAR_NAV_AREA,
      data: { path: PAGE_PATH, label: 'Theme Picker', codicon: 'paintcan' }
    })
    ctx.register({
      id: 'theme-picker-command',
      area: PALETTE_AREA,
      data: {
        id: 'theme-picker.open',
        label: 'Open Theme Picker',
        keywords: ['theme', 'skin', 'appearance', 'color'],
        run: () => host.navigate(PAGE_PATH)
      }
    })

    // Statusbar chip: current theme at a glance; click opens the picker.
    ctx.register({
      id: 'theme-picker-chip',
      area: STATUSBAR_AREAS.right,
      order: 130,
      render: () => jsx(ThemeChip, {})
    })
  }
}
