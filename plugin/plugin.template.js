/**
 * theme-picker — browse and apply Hermes skins from a full-page picker.
 *
 * Self-contained: all skin color data is embedded (no Python backend, no REST),
 * so it works identically on any machine running the desktop app. Applying uses
 * the gateway RPC `config.set { key: 'skin', value: <name> }`, which writes
 * display.skin and broadcasts `skin.changed` — the desktop then repaints live
 * (verified against tui_gateway/server.py + apps/desktop/src/themes/backend-sync.ts).
 *
 * It also registers every user skin via THEMES_AREA, so the same skins show up
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

// ---------------------------------------------------------------------------
// Active-skin tracking + live discovery of skins applied elsewhere.
// `skin.changed` events carry the full palette of the newly active skin, so a
// skin installed after this plugin was built shows up as soon as it is applied.
// ---------------------------------------------------------------------------

function useActiveSkin() {
  const [active, setActive] = useState('')
  const [live, setLive] = useState([])

  useEffect(() => {
    let mounted = true

    host
      .request('config.get', { key: 'skin' })
      .then(res => {
        if (mounted && res && res.value) setActive(res.value)
      })
      .catch(() => {})

    const off = host.onEvent('skin.changed', event => {
      if (!mounted) return
      const skin = event && event.payload
      const name = skin && skin.name
      if (!name) return
      setActive(name)
      // Live-discover skins outside the embedded catalog (freshly installed).
      if (!SKINS.some(s => s.name === name)) {
        setLive(prev => {
          if (prev.some(s => s.name === name)) return prev
          return [...prev, normalizeLiveSkin(skin)]
        })
      }
    })

    return () => {
      mounted = false
      off()
    }
  }, [])

  return [active, setActive, live]
}

function normalizeLiveSkin(skin) {
  const colors = (skin && skin.colors) || {}
  const isHex = v => typeof v === 'string' && /^#([0-9a-f]{6})$/i.test(v)
  const bg = isHex(colors.background) ? colors.background : isHex(colors.status_bar_bg) ? colors.status_bar_bg : ''
  const text = isHex(colors.banner_text) ? colors.banner_text : isHex(colors.ui_text) ? colors.ui_text : ''
  return {
    name: skin.name,
    description: skin.description || 'Newly installed skin',
    category: 'New',
    source: 'live',
    isDark: bg ? luminance(bg) < 0.5 : text ? luminance(text) < 0.5 : true,
    colors
  }
}

async function applySkin(name, setActive) {
  try {
    await host.request('config.set', { key: 'skin', value: name })
    haptic('tap')
    setActive(name)
    host.notify({ kind: 'success', message: `Theme applied: ${name}` })
  } catch (e) {
    host.notify({ kind: 'error', message: `Could not apply "${name}" — gateway offline? It is still available in Settings → Appearance.` })
  }
}

// ---------------------------------------------------------------------------
// Picker UI (shared by the pane and the full page)
// ---------------------------------------------------------------------------

function ThemeCard({ skin, active, applying, onApply }) {
  const c = skin.colors || {}
  const isActive = skin.name === active
  const strip = [
    c.background || c.status_bar_bg,
    c.ui_accent || c.banner_accent || c.banner_title,
    c.ui_tool || c.banner_accent || c.banner_title,
    c.banner_text || c.ui_text,
    c.ui_border || c.banner_border
  ].filter(Boolean)

  return jsxs('button', {
    type: 'button',
    onClick: () => onApply(skin.name),
    disabled: applying === skin.name,
    title: `${skin.description || skin.name} (${skin.isDark ? 'dark' : 'light'})`,
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
                className: cn('shrink-0 text-[0.6875rem] leading-none', skin.isDark ? 'text-(--ui-accent)' : 'text-(--ui-warn)'),
                children: skin.isDark ? '☾' : '☀'
              }),
              jsx('span', { className: 'truncate text-[0.6875rem] font-medium capitalize', children: skin.name.replace(/-/g, ' ') })
            ]
          }),
          isActive
            ? jsx(Badge, { variant: 'outline', className: 'shrink-0 px-1 text-[0.5625rem] text-(--ui-accent)', children: 'ACTIVE' })
            : jsx('span', { className: 'shrink-0 text-[0.5625rem] uppercase tracking-wide text-(--ui-text-tertiary)', children: skin.category })
        ]
      })
    ]
  })
}

/**
 * The full picker surface. `cols` controls the grid density (4-5 on the page).
 * Uses flex-wrap + inline widths because the app's Tailwind build only ships
 * grid-cols-1/2/4/6.
 */
function ThemePicker({ cols = 4 }) {
  const [active, setActive, live] = useActiveSkin()
  const [q, setQ] = useState('')
  const [pol, setPol] = useState('all')
  const [applying, setApplying] = useState(null)

  const gateway = useValue(host.state.gateway)
  const offline = gateway !== 'open'

  const allSkins = useMemo(() => {
    const known = new Set(SKINS.map(s => s.name))
    return [...SKINS, ...live.filter(s => !known.has(s.name))]
  }, [live])

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return allSkins.filter(s => {
      if (pol === 'dark' && !s.isDark) return false
      if (pol === 'light' && s.isDark) return false
      if (ql && !s.name.toLowerCase().includes(ql) && !(s.description || '').toLowerCase().includes(ql)) return false
      return true
    })
  }, [allSkins, q, pol])

  const onApply = async name => {
    setApplying(name)
    await applySkin(name, setActive)
    setApplying(null)
  }

  const gap = cols > 2 ? 12 : 8
  const cardWidth = `calc((100% - ${gap * (cols - 1)}px) / ${cols})`

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
                            style: { backgroundColor: (allSkins.find(s => s.name === active) || {}).colors?.ui_accent || 'var(--ui-accent)' }
                          }),
                          jsx('span', { className: 'truncate text-[0.6875rem] capitalize text-(--ui-text-secondary)', children: active.replace(/-/g, ' ') })
                        ]
                      })
                    : null,
                  jsx(Badge, { variant: 'muted', children: `${filtered.length}` })
                ]
              })
            ]
          }),
          jsx(SearchField, {
            placeholder: 'Search skins…',
            value: q,
            onChange: v => setQ(typeof v === 'string' ? v : '')
          }),
          jsx(SegmentedControl, {
            options: [
              { id: 'all', label: 'All' },
              { id: 'dark', label: '☾ Dark' },
              { id: 'light', label: '☀ Light' }
            ],
            value: pol,
            onChange: v => setPol(typeof v === 'string' ? v : 'all')
          }),
          offline
            ? jsx('div', {
                className: 'text-[0.6875rem] text-(--ui-text-tertiary)',
                children: `Gateway ${gateway} — apply still works in Settings → Appearance (all skins are registered there too).`
              })
            : null
        ]
      }),
      jsx(ScrollArea, {
        className: 'min-h-0 flex-1 p-2',
        children:
          filtered.length === 0
            ? jsx(EmptyState, { title: 'No skins found', description: 'Try a different search or filter.' })
            : jsx('div', {
                className: 'flex flex-wrap gap-2',
                children: filtered.map(skin =>
                  jsx('div', { key: skin.name, style: { width: cardWidth }, children: jsx(ThemeCard, { skin, active, applying, onApply }) })
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
    title: `Active theme: ${active || 'default'} — open Theme Picker`,
    className: 'flex h-full items-center gap-1 px-1.5 text-[0.6875rem] text-(--ui-text-secondary) transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground',
    children: [
      jsx('span', {
        className: 'h-2 w-2 shrink-0 rounded-full',
        style: { backgroundColor: (SKINS.find(s => s.name === active) || {}).colors?.ui_accent || 'var(--ui-accent)' }
      }),
      jsx('span', { className: 'max-w-24 truncate', children: active ? active.replace(/-/g, ' ') : 'default' })
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
    // Register every USER skin as a desktop theme so it shows up in Settings →
    // Appearance and can be applied there (offline-safe). Built-ins are skipped:
    // the desktop already ships its own presets for those names.
    for (const skin of SKINS) {
      if (skin.source === 'builtin') continue
      const theme = skinToDesktopTheme(skin)
      if (theme) {
        ctx.register({
          id: `theme:${skin.name}`,
          area: THEMES_AREA,
          data: theme
        })
      }
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
