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

const SKINS = [{"category":"Built-in","colors":{"background":"#F8FAFF","banner_accent":"#0053FD","banner_border":"#C7D7FA","banner_text":"#17171A","ui_accent":"#0053FD","ui_border":"#C7D7FA","ui_text":"#17171A","ui_tool":"#0053FD"},"darkColors":{"background":"#0D2F86","banner_accent":"#FFE6CB","banner_border":"#3158AD","banner_text":"#FFE6CB","ui_accent":"#FFE6CB","ui_border":"#3158AD","ui_text":"#FFE6CB","ui_tool":"#0053FD"},"darkName":"default","description":"Glass neutrals with Nous blue accents","gatewayDarkName":"theme-picker-nous-dark","gatewayLightName":"theme-picker-nous-light","label":"Nous","lightColors":{"background":"#F8FAFF","banner_accent":"#0053FD","banner_border":"#C7D7FA","banner_text":"#17171A","ui_accent":"#0053FD","ui_border":"#C7D7FA","ui_text":"#17171A","ui_tool":"#0053FD"},"lightName":"nous","modeSupport":"dynamic","name":"nous","source":"builtin-desktop"},{"category":"Built-in","colors":{"background":"#FFFFFF","banner_accent":"#8B80E8","banner_border":"#DEDDF5","banner_text":"#161616","ui_accent":"#8B80E8","ui_border":"#DEDDF5","ui_text":"#161616","ui_tool":"#8B80E8"},"darkColors":{"background":"#08081C","banner_accent":"#8B80E8","banner_border":"#1E1E52","banner_text":"#DDD6FF","ui_accent":"#8B80E8","ui_border":"#1E1E52","ui_text":"#DDD6FF","ui_tool":"#8B80E8"},"darkName":"midnight","description":"Deep blue-violet with cool accents","gatewayDarkName":"theme-picker-midnight-dark","gatewayLightName":"theme-picker-midnight-light","label":"Midnight","lightColors":{"background":"#FFFFFF","banner_accent":"#8B80E8","banner_border":"#DEDDF5","banner_text":"#161616","ui_accent":"#8B80E8","ui_border":"#DEDDF5","ui_text":"#161616","ui_tool":"#8B80E8"},"lightName":"midnight","modeSupport":"dynamic","name":"midnight","source":"builtin-desktop"},{"category":"Built-in","colors":{"background":"#FFFFFF","banner_accent":"#D97316","banner_border":"#F1D9C4","banner_text":"#161616","ui_accent":"#D97316","ui_border":"#F1D9C4","ui_text":"#161616","ui_tool":"#D97316"},"darkColors":{"background":"#160800","banner_accent":"#D97316","banner_border":"#3A1C08","banner_text":"#FFD8B0","ui_accent":"#D97316","ui_border":"#3A1C08","ui_text":"#FFD8B0","ui_tool":"#D97316"},"darkName":"ember","description":"Warm crimson and bronze — forge vibes","gatewayDarkName":"theme-picker-ember-dark","gatewayLightName":"theme-picker-ember-light","label":"Ember","lightColors":{"background":"#FFFFFF","banner_accent":"#D97316","banner_border":"#F1D9C4","banner_text":"#161616","ui_accent":"#D97316","ui_border":"#F1D9C4","ui_text":"#161616","ui_tool":"#D97316"},"lightName":"ember","modeSupport":"dynamic","name":"ember","source":"builtin-desktop"},{"category":"Built-in","colors":{"background":"#FFFFFF","banner_accent":"#707070","banner_border":"#DEDEDE","banner_text":"#161616","ui_accent":"#707070","ui_border":"#DEDEDE","ui_text":"#161616","ui_tool":"#707070"},"darkColors":{"background":"#0E0E0E","banner_accent":"#9A9A9A","banner_border":"#2A2A2A","banner_text":"#EAEAEA","ui_accent":"#9A9A9A","ui_border":"#2A2A2A","ui_text":"#EAEAEA","ui_tool":"#9A9A9A"},"darkName":"mono","description":"Clean grayscale — minimal and focused","gatewayDarkName":"theme-picker-mono-dark","gatewayLightName":"theme-picker-mono-light","label":"Mono","lightColors":{"background":"#FFFFFF","banner_accent":"#707070","banner_border":"#DEDEDE","banner_text":"#161616","ui_accent":"#707070","ui_border":"#DEDEDE","ui_text":"#161616","ui_tool":"#707070"},"lightName":"mono","modeSupport":"dynamic","name":"mono","source":"builtin-desktop"},{"category":"Built-in","colors":{"background":"#FFFFFF","banner_accent":"#008F28","banner_border":"#C9E8D2","banner_text":"#161616","ui_accent":"#008F28","ui_border":"#C9E8D2","ui_text":"#161616","ui_tool":"#008F28"},"darkColors":{"background":"#000A00","banner_accent":"#00FF41","banner_border":"#003000","banner_text":"#00FF41","ui_accent":"#00FF41","ui_border":"#003000","ui_text":"#00FF41","ui_tool":"#00FF41"},"darkName":"cyberpunk","description":"Neon green on black — matrix terminal","gatewayDarkName":"theme-picker-cyberpunk-dark","gatewayLightName":"theme-picker-cyberpunk-light","label":"Cyberpunk","lightColors":{"background":"#FFFFFF","banner_accent":"#008F28","banner_border":"#C9E8D2","banner_text":"#161616","ui_accent":"#008F28","ui_border":"#C9E8D2","ui_text":"#161616","ui_tool":"#008F28"},"lightName":"cyberpunk","modeSupport":"dynamic","name":"cyberpunk","source":"builtin-desktop"},{"category":"Built-in","colors":{"background":"#FFF8FB","banner_accent":"#B64F78","banner_border":"#E8CAD6","banner_text":"#24171D","ui_accent":"#B64F78","ui_border":"#E8CAD6","ui_text":"#24171D","ui_tool":"#B64F78"},"darkColors":{"background":"#1A0F15","banner_accent":"#F9A8D4","banner_border":"#54283B","banner_text":"#FFD4E1","ui_accent":"#F9A8D4","ui_border":"#54283B","ui_text":"#FFD4E1","ui_tool":"#F9A8D4"},"darkName":"rose","description":"Soft pink and warm ivory — easy on the eyes","gatewayDarkName":"theme-picker-rose-dark","gatewayLightName":"theme-picker-rose-light","label":"Rose","lightColors":{"background":"#FFF8FB","banner_accent":"#B64F78","banner_border":"#E8CAD6","banner_text":"#24171D","ui_accent":"#B64F78","ui_border":"#E8CAD6","ui_text":"#24171D","ui_tool":"#B64F78"},"lightName":"rose","modeSupport":"dynamic","name":"rose","source":"builtin-desktop"},{"category":"Built-in","colors":{"background":"#f7f1fa","banner_accent":"#8b5ca8","banner_border":"#d8c8e0","banner_dim":"#6d5a80","banner_text":"#3a2645","banner_title":"#3a2645","completion_menu_bg":"#ffffff","prompt":"#3a2645","session_border":"#d8c8e0","status_bar_bg":"#ede3f2","status_bar_text":"#3a2645","ui_accent":"#8b5ca8","ui_border":"#d8c8e0","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#3a2645","ui_tool":"#7a4f94","ui_warn":"#a87a1f"},"darkColors":{"background":"#101014","banner_accent":"#50a8a8","banner_border":"#4a4060","banner_dim":"#7e7c8c","banner_text":"#b0b0c0","banner_title":"#8898b0","completion_menu_bg":"#101014","prompt":"#b0b0c0","session_border":"#2a2838","status_bar_bg":"#08080c","status_bar_text":"#787888","ui_accent":"#50a8a8","ui_border":"#4a4060","ui_error":"#a05060","ui_ok":"#50a070","ui_text":"#b0b0c0","ui_tool":"#50a8a8","ui_warn":"#a09050"},"darkName":"shadow-thief","description":"Rogue's night — matte black, muted plum, and silver-steel with a glint of cyan","gatewayDarkName":"theme-picker-shadow-thief-dark","gatewayLightName":"theme-picker-shadow-thief-light","label":"Shadow Thief","lightColors":{"background":"#f7f1fa","banner_accent":"#8b5ca8","banner_border":"#d8c8e0","banner_dim":"#6d5a80","banner_text":"#3a2645","banner_title":"#3a2645","completion_menu_bg":"#ffffff","prompt":"#3a2645","session_border":"#d8c8e0","status_bar_bg":"#ede3f2","status_bar_text":"#3a2645","ui_accent":"#8b5ca8","ui_border":"#d8c8e0","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#3a2645","ui_tool":"#7a4f94","ui_warn":"#a87a1f"},"lightName":"light-lilac","modeSupport":"dynamic","name":"shadow-thief","source":"builtin-desktop"},{"category":"Built-in","colors":{"background":"#F4FCFC","banner_accent":"#087F7A","banner_border":"#B9DBD8","banner_text":"#132B2B","ui_accent":"#087F7A","ui_border":"#B9DBD8","ui_text":"#132B2B","ui_tool":"#087F7A"},"darkColors":{"background":"#041C1C","banner_accent":"#33C4BA","banner_border":"#205654","banner_text":"#FFE6CB","ui_accent":"#33C4BA","ui_border":"#205654","ui_text":"#FFE6CB","ui_tool":"#33C4BA"},"darkName":"hermes-teal","description":"Classic teal — the canonical Hermes dashboard look","gatewayDarkName":"theme-picker-hermes-teal-dark","gatewayLightName":"theme-picker-hermes-teal-light","label":"Hermes Teal","lightColors":{"background":"#F4FCFC","banner_accent":"#087F7A","banner_border":"#B9DBD8","banner_text":"#132B2B","ui_accent":"#087F7A","ui_border":"#B9DBD8","ui_text":"#132B2B","ui_tool":"#087F7A"},"lightName":"hermes-teal","modeSupport":"dynamic","name":"hermes-teal","source":"builtin-desktop"},{"category":"Dynamic","colors":{"background":"#f6f3fb","banner_accent":"#7a5fc0","banner_border":"#ddd5ec","banner_dim":"#6f6590","banner_text":"#2a2438","banner_title":"#2a2438","completion_menu_bg":"#eae7ef","prompt":"#2a2438","session_border":"#ddd5ec","status_bar_bg":"#f7f4fb","status_bar_text":"#2a2438","ui_accent":"#7a5fc0","ui_border":"#ddd5ec","ui_error":"#c65a5a","ui_ok":"#2f8e52","ui_text":"#2a2438","ui_tool":"#7a5fc0","ui_warn":"#a17a17"},"darkColors":{"background":"#150d22","banner_accent":"#c084fc","banner_border":"#3c2a55","banner_dim":"#8f7ab0","banner_text":"#f3e8ff","banner_title":"#f3e8ff","completion_menu_bg":"#221a2f","prompt":"#f3e8ff","session_border":"#3c2a55","status_bar_bg":"#130c1f","status_bar_text":"#f3e8ff","ui_accent":"#c084fc","ui_border":"#3c2a55","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#f3e8ff","ui_tool":"#7B2D8E","ui_warn":"#fbbf24"},"darkName":"dark-aubergine","description":"Deep aubergine with violet accents","gatewayDarkName":"theme-picker-dark-aubergine-dark","gatewayLightName":"theme-picker-dark-aubergine-light","label":"Aubergine","lightColors":{"background":"#f6f3fb","banner_accent":"#7a5fc0","banner_border":"#ddd5ec","banner_dim":"#6f6590","banner_text":"#2a2438","banner_title":"#2a2438","completion_menu_bg":"#eae7ef","prompt":"#2a2438","session_border":"#ddd5ec","status_bar_bg":"#f7f4fb","status_bar_text":"#2a2438","ui_accent":"#7a5fc0","ui_border":"#ddd5ec","ui_error":"#c65a5a","ui_ok":"#2f8e52","ui_text":"#2a2438","ui_tool":"#7a5fc0","ui_warn":"#a17a17"},"lightName":"light-lavender","modeSupport":"dynamic","name":"dark-aubergine","source":"user"},{"category":"Dynamic","colors":{"background":"#fafafa","banner_accent":"#a36229","banner_border":"#e8e8e8","banner_dim":"#6f737a","banner_text":"#555f6a","banner_title":"#555f6a","completion_menu_bg":"#f0f0f0","prompt":"#555f6a","session_border":"#e8e8e8","status_bar_bg":"#f0f0f0","status_bar_text":"#555f6a","ui_accent":"#a36229","ui_border":"#e8e8e8","ui_error":"#bc453b","ui_ok":"#6e8e39","ui_text":"#555f6a","ui_tool":"#8a521f","ui_warn":"#936b09"},"darkColors":{"background":"#0b0e14","banner_accent":"#59c2ff","banner_border":"#1f2430","banner_dim":"#787b77","banner_text":"#b3b1ad","banner_title":"#b3b1ad","completion_menu_bg":"#0a0d12","prompt":"#b3b1ad","session_border":"#1f2430","status_bar_bg":"#0a0d12","status_bar_text":"#b3b1ad","ui_accent":"#59c2ff","ui_border":"#1f2430","ui_error":"#f07178","ui_ok":"#a6cc70","ui_text":"#b3b1ad","ui_tool":"#8ad6ff","ui_warn":"#e6b450"},"darkName":"dark-ayu","description":"Ayu Dark, soft blue-charcoal","gatewayDarkName":"theme-picker-dark-ayu-dark","gatewayLightName":"theme-picker-dark-ayu-light","label":"Ayu","lightColors":{"background":"#fafafa","banner_accent":"#a36229","banner_border":"#e8e8e8","banner_dim":"#6f737a","banner_text":"#555f6a","banner_title":"#555f6a","completion_menu_bg":"#f0f0f0","prompt":"#555f6a","session_border":"#e8e8e8","status_bar_bg":"#f0f0f0","status_bar_text":"#555f6a","ui_accent":"#a36229","ui_border":"#e8e8e8","ui_error":"#bc453b","ui_ok":"#6e8e39","ui_text":"#555f6a","ui_tool":"#8a521f","ui_warn":"#936b09"},"lightName":"light-ayu","modeSupport":"dynamic","name":"dark-ayu","source":"user"},{"category":"Dynamic","colors":{"background":"#eae6dc","banner_accent":"#696458","banner_border":"#d4cebf","banner_dim":"#6b665c","banner_text":"#2e2b24","banner_title":"#2e2b24","completion_menu_bg":"#dfdbd1","prompt":"#2e2b24","session_border":"#d4cebf","status_bar_bg":"#ece8df","status_bar_text":"#2e2b24","ui_accent":"#696458","ui_border":"#d4cebf","ui_error":"#bc5656","ui_ok":"#2c854d","ui_text":"#2e2b24","ui_tool":"#8a8374","ui_warn":"#977316"},"darkColors":{"background":"#1a1814","banner_accent":"#c9c2b4","banner_border":"#34302a","banner_dim":"#8f8a80","banner_text":"#f5f2ec","banner_title":"#f5f2ec","completion_menu_bg":"#181612","prompt":"#f5f2ec","session_border":"#34302a","status_bar_bg":"#181612","status_bar_text":"#f5f2ec","ui_accent":"#c9c2b4","ui_border":"#34302a","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#f5f2ec","ui_tool":"#e8e2d6","ui_warn":"#fbbf24"},"darkName":"dark-bone","description":"Dark bone, warm charcoal with stone","gatewayDarkName":"theme-picker-dark-bone-dark","gatewayLightName":"theme-picker-dark-bone-light","label":"Bone","lightColors":{"background":"#eae6dc","banner_accent":"#696458","banner_border":"#d4cebf","banner_dim":"#6b665c","banner_text":"#2e2b24","banner_title":"#2e2b24","completion_menu_bg":"#dfdbd1","prompt":"#2e2b24","session_border":"#d4cebf","status_bar_bg":"#ece8df","status_bar_text":"#2e2b24","ui_accent":"#696458","ui_border":"#d4cebf","ui_error":"#bc5656","ui_ok":"#2c854d","ui_text":"#2e2b24","ui_tool":"#8a8374","ui_warn":"#977316"},"lightName":"minimal-bone","modeSupport":"dynamic","name":"dark-bone","source":"user"},{"category":"Dynamic","colors":{"background":"#eff1f5","banner_accent":"#1d62eb","banner_border":"#ccd0da","banner_dim":"#686b7b","banner_text":"#4c4f69","banner_title":"#4c4f69","completion_menu_bg":"#e5e7eb","prompt":"#4c4f69","session_border":"#ccd0da","status_bar_bg":"#e5e7eb","status_bar_text":"#4c4f69","ui_accent":"#1d62eb","ui_border":"#ccd0da","ui_error":"#bd0e33","ui_ok":"#3a9027","ui_text":"#4c4f69","ui_tool":"#1751c4","ui_warn":"#b27217"},"darkColors":{"background":"#1e1e2e","banner_accent":"#89b4fa","banner_border":"#313244","banner_dim":"#8489a0","banner_text":"#cdd6f4","banner_title":"#cdd6f4","completion_menu_bg":"#1c1c2a","prompt":"#cdd6f4","session_border":"#313244","status_bar_bg":"#1c1c2a","status_bar_text":"#cdd6f4","ui_accent":"#89b4fa","ui_border":"#313244","ui_error":"#f38ba8","ui_ok":"#a6e3a1","ui_text":"#cdd6f4","ui_tool":"#a9c4f8","ui_warn":"#f9e2af"},"darkName":"dark-catppuccin","description":"Catppuccin Mocha, creamy pastel dark","gatewayDarkName":"theme-picker-dark-catppuccin-dark","gatewayLightName":"theme-picker-dark-catppuccin-light","label":"Catppuccin","lightColors":{"background":"#eff1f5","banner_accent":"#1d62eb","banner_border":"#ccd0da","banner_dim":"#686b7b","banner_text":"#4c4f69","banner_title":"#4c4f69","completion_menu_bg":"#e5e7eb","prompt":"#4c4f69","session_border":"#ccd0da","status_bar_bg":"#e5e7eb","status_bar_text":"#4c4f69","ui_accent":"#1d62eb","ui_border":"#ccd0da","ui_error":"#bd0e33","ui_ok":"#3a9027","ui_text":"#4c4f69","ui_tool":"#1751c4","ui_warn":"#b27217"},"lightName":"light-catppuccin","modeSupport":"dynamic","name":"dark-catppuccin","source":"user"},{"category":"Dynamic","colors":{"background":"#f5f7fa","banner_accent":"#3b6ea8","banner_border":"#d9e0e8","banner_dim":"#5c6b7d","banner_text":"#1c2430","banner_title":"#1c2430","completion_menu_bg":"#e8eaee","prompt":"#1c2430","session_border":"#d9e0e8","status_bar_bg":"#f6f8fa","status_bar_text":"#1c2430","ui_accent":"#3b6ea8","ui_border":"#d9e0e8","ui_error":"#d05f5f","ui_ok":"#2f8e52","ui_text":"#1c2430","ui_tool":"#3b6ea8","ui_warn":"#a17a17"},"darkColors":{"background":"#16181d","banner_accent":"#8ec5ff","banner_border":"#262a33","banner_dim":"#8b919c","banner_text":"#e6e9ef","banner_title":"#e6e9ef","completion_menu_bg":"#22252a","prompt":"#e6e9ef","session_border":"#262a33","status_bar_bg":"#14161a","status_bar_text":"#e6e9ef","ui_accent":"#8ec5ff","ui_border":"#262a33","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#e6e9ef","ui_tool":"#4f9cf0","ui_warn":"#fbbf24"},"darkName":"dark-charcoal","description":"Steel gray-blue, calm and neutral","gatewayDarkName":"theme-picker-dark-charcoal-dark","gatewayLightName":"theme-picker-dark-charcoal-light","label":"Charcoal","lightColors":{"background":"#f5f7fa","banner_accent":"#3b6ea8","banner_border":"#d9e0e8","banner_dim":"#5c6b7d","banner_text":"#1c2430","banner_title":"#1c2430","completion_menu_bg":"#e8eaee","prompt":"#1c2430","session_border":"#d9e0e8","status_bar_bg":"#f6f8fa","status_bar_text":"#1c2430","ui_accent":"#3b6ea8","ui_border":"#d9e0e8","ui_error":"#d05f5f","ui_ok":"#2f8e52","ui_text":"#1c2430","ui_tool":"#3b6ea8","ui_warn":"#a17a17"},"lightName":"light-cloud","modeSupport":"dynamic","name":"dark-charcoal","source":"user"},{"category":"Dynamic","colors":{"background":"#f7f4ec","banner_accent":"#8e623a","banner_border":"#ded7c9","banner_dim":"#6f675c","banner_text":"#2b2620","banner_title":"#2b2620","completion_menu_bg":"#ebe8e0","prompt":"#2b2620","session_border":"#ded7c9","status_bar_bg":"#f8f5ee","status_bar_text":"#2b2620","ui_accent":"#8e623a","ui_border":"#ded7c9","ui_error":"#c65a5a","ui_ok":"#2f8e52","ui_text":"#2b2620","ui_tool":"#9a6b3f","ui_warn":"#a17a17"},"darkColors":{"background":"#232323","banner_accent":"#c9a87c","banner_border":"#3a3a3a","banner_dim":"#9a948a","banner_text":"#ddd7c9","banner_title":"#ddd7c9","completion_menu_bg":"#202020","prompt":"#ddd7c9","session_border":"#3a3a3a","status_bar_bg":"#202020","status_bar_text":"#ddd7c9","ui_accent":"#c9a87c","ui_border":"#3a3a3a","ui_error":"#c97b7b","ui_ok":"#a8b57a","ui_text":"#ddd7c9","ui_tool":"#dcbc92","ui_warn":"#d8b26a"},"darkName":"dark-cozy-paper","description":"Cozy Paper, warm dark","gatewayDarkName":"theme-picker-dark-cozy-paper-dark","gatewayLightName":"theme-picker-dark-cozy-paper-light","label":"Cozy Paper","lightColors":{"background":"#f7f4ec","banner_accent":"#8e623a","banner_border":"#ded7c9","banner_dim":"#6f675c","banner_text":"#2b2620","banner_title":"#2b2620","completion_menu_bg":"#ebe8e0","prompt":"#2b2620","session_border":"#ded7c9","status_bar_bg":"#f8f5ee","status_bar_text":"#2b2620","ui_accent":"#8e623a","ui_border":"#ded7c9","ui_error":"#c65a5a","ui_ok":"#2f8e52","ui_text":"#2b2620","ui_tool":"#9a6b3f","ui_warn":"#a17a17"},"lightName":"light-cozy-paper","modeSupport":"dynamic","name":"dark-cozy-paper","source":"user"},{"category":"Dynamic","colors":{"background":"#faf4f5","banner_accent":"#a2556d","banner_border":"#ead7dc","banner_dim":"#7d646d","banner_text":"#33262b","banner_title":"#33262b","completion_menu_bg":"#eee8e9","prompt":"#33262b","session_border":"#ead7dc","status_bar_bg":"#faf5f6","status_bar_text":"#33262b","ui_accent":"#a2556d","ui_border":"#ead7dc","ui_error":"#d05f5f","ui_ok":"#2f8e52","ui_text":"#33262b","ui_tool":"#b05c77","ui_warn":"#a17a17"},"darkColors":{"background":"#200608","banner_accent":"#e8b84a","banner_border":"#3d1214","banner_dim":"#c09090","banner_text":"#f5d9d9","banner_title":"#f5d9d9","completion_menu_bg":"#2a0e10","prompt":"#f5d9d9","session_border":"#3d1214","status_bar_bg":"#180406","status_bar_text":"#f5d9d9","ui_accent":"#e8b84a","ui_border":"#3d1214","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#f5d9d9","ui_tool":"#c03030","ui_warn":"#fbbf24"},"darkName":"dark-crimson","description":"Deep blood red with warm gold","gatewayDarkName":"theme-picker-dark-crimson-dark","gatewayLightName":"theme-picker-dark-crimson-light","label":"Crimson","lightColors":{"background":"#faf4f5","banner_accent":"#a2556d","banner_border":"#ead7dc","banner_dim":"#7d646d","banner_text":"#33262b","banner_title":"#33262b","completion_menu_bg":"#eee8e9","prompt":"#33262b","session_border":"#ead7dc","status_bar_bg":"#faf5f6","status_bar_text":"#33262b","ui_accent":"#a2556d","ui_border":"#ead7dc","ui_error":"#d05f5f","ui_ok":"#2f8e52","ui_text":"#33262b","ui_tool":"#b05c77","ui_warn":"#a17a17"},"lightName":"light-rose","modeSupport":"dynamic","name":"dark-crimson","source":"user"},{"category":"Dynamic","colors":{"background":"#f8f8f2","banner_accent":"#7b4fb8","banner_border":"#dcd9d0","banner_dim":"#4c5d99","banner_text":"#282a36","banner_title":"#282a36","completion_menu_bg":"#f4f4ee","prompt":"#282a36","session_border":"#dcd9d0","status_bar_bg":"#ecebe4","status_bar_text":"#282a36","ui_accent":"#7b4fb8","ui_border":"#dcd9d0","ui_error":"#c22f2f","ui_ok":"#1f7f3b","ui_text":"#282a36","ui_tool":"#0d6b85","ui_warn":"#8a8210"},"darkColors":{"background":"#282a36","banner_accent":"#bd93f9","banner_border":"#44475a","banner_dim":"#8b99c9","banner_text":"#f8f8f2","banner_title":"#f8f8f2","completion_menu_bg":"#21222c","prompt":"#f8f8f2","session_border":"#44475a","status_bar_bg":"#21222c","status_bar_text":"#f8f8f2","ui_accent":"#bd93f9","ui_border":"#44475a","ui_error":"#ff5555","ui_ok":"#50fa7b","ui_text":"#f8f8f2","ui_tool":"#8be9fd","ui_warn":"#f1fa8c"},"darkName":"dark-dracula","description":"Dracula dark, purple on near-black","gatewayDarkName":"theme-picker-dark-dracula-dark","gatewayLightName":"theme-picker-dark-dracula-light","label":"Dracula","lightColors":{"background":"#f8f8f2","banner_accent":"#7b4fb8","banner_border":"#dcd9d0","banner_dim":"#4c5d99","banner_text":"#282a36","banner_title":"#282a36","completion_menu_bg":"#f4f4ee","prompt":"#282a36","session_border":"#dcd9d0","status_bar_bg":"#ecebe4","status_bar_text":"#282a36","ui_accent":"#7b4fb8","ui_border":"#dcd9d0","ui_error":"#c22f2f","ui_ok":"#1f7f3b","ui_text":"#282a36","ui_tool":"#0d6b85","ui_warn":"#8a8210"},"lightName":"light-dracula","modeSupport":"dynamic","name":"dark-dracula","source":"user"},{"category":"Dynamic","colors":{"background":"#fdf6e3","banner_accent":"#637242","banner_border":"#eae4d2","banner_dim":"#6a7268","banner_text":"#515d64","banner_title":"#515d64","completion_menu_bg":"#f3ecda","prompt":"#515d64","session_border":"#eae4d2","status_bar_bg":"#f3ecda","status_bar_text":"#515d64","ui_accent":"#637242","ui_border":"#eae4d2","ui_error":"#9e4a39","ui_ok":"#536436","ui_text":"#515d64","ui_tool":"#556537","ui_warn":"#7d6230"},"darkColors":{"background":"#2f383e","banner_accent":"#a7c080","banner_border":"#475258","banner_dim":"#99a39c","banner_text":"#d3c6aa","banner_title":"#d3c6aa","completion_menu_bg":"#2b3439","prompt":"#d3c6aa","session_border":"#475258","status_bar_bg":"#2b3439","status_bar_text":"#d3c6aa","ui_accent":"#a7c080","ui_border":"#475258","ui_error":"#e67e80","ui_ok":"#a7c080","ui_text":"#d3c6aa","ui_tool":"#c0d0a0","ui_warn":"#dbbc7f"},"darkName":"dark-everforest","description":"Everforest, green-tinted forest dark","gatewayDarkName":"theme-picker-dark-everforest-dark","gatewayLightName":"theme-picker-dark-everforest-light","label":"Everforest","lightColors":{"background":"#fdf6e3","banner_accent":"#637242","banner_border":"#eae4d2","banner_dim":"#6a7268","banner_text":"#515d64","banner_title":"#515d64","completion_menu_bg":"#f3ecda","prompt":"#515d64","session_border":"#eae4d2","status_bar_bg":"#f3ecda","status_bar_text":"#515d64","ui_accent":"#637242","ui_border":"#eae4d2","ui_error":"#9e4a39","ui_ok":"#536436","ui_text":"#515d64","ui_tool":"#556537","ui_warn":"#7d6230"},"lightName":"light-everforest","modeSupport":"dynamic","name":"dark-everforest","source":"user"},{"category":"Dynamic","colors":{"background":"#ffffff","banner_accent":"#0969da","banner_border":"#d1d9e0","banner_dim":"#59636e","banner_text":"#1f2328","banner_title":"#1f2328","completion_menu_bg":"#f5f5f5","prompt":"#1f2328","session_border":"#d1d9e0","status_bar_bg":"#f5f5f5","status_bar_text":"#1f2328","ui_accent":"#0969da","ui_border":"#d1d9e0","ui_error":"#ba1f29","ui_ok":"#177232","ui_text":"#1f2328","ui_tool":"#0756b0","ui_warn":"#7b5200"},"darkColors":{"background":"#0d1117","banner_accent":"#2f81f7","banner_border":"#30363d","banner_dim":"#9198a1","banner_text":"#e6edf3","banner_title":"#e6edf3","completion_menu_bg":"#0c1015","prompt":"#e6edf3","session_border":"#30363d","status_bar_bg":"#0c1015","status_bar_text":"#e6edf3","ui_accent":"#2f81f7","ui_border":"#30363d","ui_error":"#f85149","ui_ok":"#3fb950","ui_text":"#e6edf3","ui_tool":"#6cb0fa","ui_warn":"#d29922"},"darkName":"dark-github","description":"GitHub Dark, official GitHub theme","gatewayDarkName":"theme-picker-dark-github-dark","gatewayLightName":"theme-picker-dark-github-light","label":"Github","lightColors":{"background":"#ffffff","banner_accent":"#0969da","banner_border":"#d1d9e0","banner_dim":"#59636e","banner_text":"#1f2328","banner_title":"#1f2328","completion_menu_bg":"#f5f5f5","prompt":"#1f2328","session_border":"#d1d9e0","status_bar_bg":"#f5f5f5","status_bar_text":"#1f2328","ui_accent":"#0969da","ui_border":"#d1d9e0","ui_error":"#ba1f29","ui_ok":"#177232","ui_text":"#1f2328","ui_tool":"#0756b0","ui_warn":"#7b5200"},"lightName":"light-github","modeSupport":"dynamic","name":"dark-github","source":"user"},{"category":"Dynamic","colors":{"background":"#fbf1c7","banner_accent":"#915e10","banner_border":"#d5c4a1","banner_dim":"#776b60","banner_text":"#3c3836","banner_title":"#3c3836","completion_menu_bg":"#f1e7bf","prompt":"#3c3836","session_border":"#d5c4a1","status_bar_bg":"#f1e7bf","status_bar_text":"#3c3836","ui_accent":"#915e10","ui_border":"#d5c4a1","ui_error":"#a53427","ui_ok":"#64650e","ui_text":"#3c3836","ui_tool":"#7a4e0d","ui_warn":"#7b5d0d"},"darkColors":{"background":"#282828","banner_accent":"#fabd2f","banner_border":"#504945","banner_dim":"#9b8d7f","banner_text":"#ebdbb2","banner_title":"#ebdbb2","completion_menu_bg":"#252525","prompt":"#ebdbb2","session_border":"#504945","status_bar_bg":"#252525","status_bar_text":"#ebdbb2","ui_accent":"#fabd2f","ui_border":"#504945","ui_error":"#fb4934","ui_ok":"#b8bb26","ui_text":"#ebdbb2","ui_tool":"#f4c856","ui_warn":"#fabd2f"},"darkName":"dark-gruvbox","description":"Gruvbox dark, retro warm groove","gatewayDarkName":"theme-picker-dark-gruvbox-dark","gatewayLightName":"theme-picker-dark-gruvbox-light","label":"Gruvbox","lightColors":{"background":"#fbf1c7","banner_accent":"#915e10","banner_border":"#d5c4a1","banner_dim":"#776b60","banner_text":"#3c3836","banner_title":"#3c3836","completion_menu_bg":"#f1e7bf","prompt":"#3c3836","session_border":"#d5c4a1","status_bar_bg":"#f1e7bf","status_bar_text":"#3c3836","ui_accent":"#915e10","ui_border":"#d5c4a1","ui_error":"#a53427","ui_ok":"#64650e","ui_text":"#3c3836","ui_tool":"#7a4e0d","ui_warn":"#7b5d0d"},"lightName":"light-gruvbox","modeSupport":"dynamic","name":"dark-gruvbox","source":"user"},{"category":"Dynamic","colors":{"background":"#f2ecbc","banner_accent":"#47688f","banner_border":"#d8d0b0","banner_dim":"#6e6a5e","banner_text":"#545464","banner_title":"#545464","completion_menu_bg":"#e8e3b4","prompt":"#545464","session_border":"#d8d0b0","status_bar_bg":"#e8e3b4","status_bar_text":"#545464","ui_accent":"#47688f","ui_border":"#d8d0b0","ui_error":"#ad354a","ui_ok":"#647b46","ui_text":"#545464","ui_tool":"#3b5878","ui_warn":"#7d6230"},"darkColors":{"background":"#1f1f28","banner_accent":"#7e9cd8","banner_border":"#363646","banner_dim":"#898881","banner_text":"#dcd7ba","banner_title":"#dcd7ba","completion_menu_bg":"#1d1d25","prompt":"#dcd7ba","session_border":"#363646","status_bar_bg":"#1d1d25","status_bar_text":"#dcd7ba","ui_accent":"#7e9cd8","ui_border":"#363646","ui_error":"#e46876","ui_ok":"#98bb6c","ui_text":"#dcd7ba","ui_tool":"#a3c0e8","ui_warn":"#e6c384"},"darkName":"dark-kanagawa","description":"Kanagawa Wave, Japanese ink-wash dark","gatewayDarkName":"theme-picker-dark-kanagawa-dark","gatewayLightName":"theme-picker-dark-kanagawa-light","label":"Kanagawa","lightColors":{"background":"#f2ecbc","banner_accent":"#47688f","banner_border":"#d8d0b0","banner_dim":"#6e6a5e","banner_text":"#545464","banner_title":"#545464","completion_menu_bg":"#e8e3b4","prompt":"#545464","session_border":"#d8d0b0","status_bar_bg":"#e8e3b4","status_bar_text":"#545464","ui_accent":"#47688f","ui_border":"#d8d0b0","ui_error":"#ad354a","ui_ok":"#647b46","ui_text":"#545464","ui_tool":"#3b5878","ui_warn":"#7d6230"},"lightName":"light-kanagawa","modeSupport":"dynamic","name":"dark-kanagawa","source":"user"},{"category":"Dynamic","colors":{"background":"#F2F0EC","banner_accent":"#7a4c00","banner_border":"#1f4fa8","banner_dim":"#5a5a64","banner_text":"#0A0A14","banner_title":"#0A0A14","completion_menu_bg":"#F7F5F1","prompt":"#0A0A14","session_border":"#1f4fa8","status_bar_bg":"#E6E3DC","status_bar_text":"#0A0A14","ui_accent":"#7a4c00","ui_border":"#1f4fa8","ui_error":"#c22f2f","ui_ok":"#1f7f3b","ui_text":"#0A0A14","ui_tool":"#0d6b85","ui_warn":"#8a6d1a"},"darkColors":{"background":"#050510","banner_accent":"#FF9C00","banner_border":"#3366FF","banner_dim":"#999999","banner_text":"#FFFFFF","banner_title":"#FFFFFF","completion_menu_bg":"#0A0A1A","prompt":"#FFFFFF","session_border":"#3366FF","status_bar_bg":"#0A0A1A","status_bar_text":"#FFFFFF","ui_accent":"#FF9C00","ui_border":"#3366FF","ui_error":"#FF5555","ui_ok":"#66FF99","ui_text":"#FFFFFF","ui_tool":"#66CCFF","ui_warn":"#FFCC66"},"darkName":"dark-lcars","description":"LCARS, Star Trek black with orange accents","gatewayDarkName":"theme-picker-dark-lcars-dark","gatewayLightName":"theme-picker-dark-lcars-light","label":"Lcars","lightColors":{"background":"#F2F0EC","banner_accent":"#7a4c00","banner_border":"#1f4fa8","banner_dim":"#5a5a64","banner_text":"#0A0A14","banner_title":"#0A0A14","completion_menu_bg":"#F7F5F1","prompt":"#0A0A14","session_border":"#1f4fa8","status_bar_bg":"#E6E3DC","status_bar_text":"#0A0A14","ui_accent":"#7a4c00","ui_border":"#1f4fa8","ui_error":"#c22f2f","ui_ok":"#1f7f3b","ui_text":"#0A0A14","ui_tool":"#0d6b85","ui_warn":"#8a6d1a"},"lightName":"light-lcars","modeSupport":"dynamic","name":"dark-lcars","source":"user"},{"category":"Dynamic","colors":{"background":"#fbf6e2","banner_accent":"#826d14","banner_border":"#e4dca8","banner_dim":"#77703f","banner_text":"#3a3313","banner_title":"#3a3313","completion_menu_bg":"#ffffff","prompt":"#3a3313","session_border":"#e4dca8","status_bar_bg":"#f0e8c0","status_bar_text":"#3a3313","ui_accent":"#826d14","ui_border":"#e4dca8","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#3a3313","ui_tool":"#726012","ui_warn":"#a87a1f"},"darkColors":{"background":"#1a1810","banner_accent":"#d4c84a","banner_border":"#33311e","banner_dim":"#9a9460","banner_text":"#f5f2ec","banner_title":"#f5f2ec","completion_menu_bg":"#18160f","prompt":"#f5f2ec","session_border":"#33311e","status_bar_bg":"#18160f","status_bar_text":"#f5f2ec","ui_accent":"#d4c84a","ui_border":"#33311e","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#f5f2ec","ui_tool":"#e8de6e","ui_warn":"#fbbf24"},"darkName":"dark-lemon","description":"Dark lemon, olive-yellow on near-black","gatewayDarkName":"theme-picker-dark-lemon-dark","gatewayLightName":"theme-picker-dark-lemon-light","label":"Lemon","lightColors":{"background":"#fbf6e2","banner_accent":"#826d14","banner_border":"#e4dca8","banner_dim":"#77703f","banner_text":"#3a3313","banner_title":"#3a3313","completion_menu_bg":"#ffffff","prompt":"#3a3313","session_border":"#e4dca8","status_bar_bg":"#f0e8c0","status_bar_text":"#3a3313","ui_accent":"#826d14","ui_border":"#e4dca8","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#3a3313","ui_tool":"#726012","ui_warn":"#a87a1f"},"lightName":"light-lemon","modeSupport":"dynamic","name":"dark-lemon","source":"user"},{"category":"Dynamic","colors":{"background":"#e8e4da","banner_accent":"#245a8e","banner_border":"#b8b3a8","banner_dim":"#656057","banner_text":"#1f1f24","banner_title":"#1f1f24","completion_menu_bg":"#f4f1e8","prompt":"#1f1f24","session_border":"#b8b3a8","status_bar_bg":"#d8d4c9","status_bar_text":"#1f1f24","ui_accent":"#245a8e","ui_border":"#b8b3a8","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#1f1f24","ui_tool":"#2e5f88","ui_warn":"#a87a1f"},"darkColors":{"background":"#1c1a16","banner_accent":"#6ea8d6","banner_border":"#35312b","banner_dim":"#9a958a","banner_text":"#f5f2ec","banner_title":"#f5f2ec","completion_menu_bg":"#1a1814","prompt":"#f5f2ec","session_border":"#35312b","status_bar_bg":"#1a1814","status_bar_text":"#f5f2ec","ui_accent":"#6ea8d6","ui_border":"#35312b","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#f5f2ec","ui_tool":"#9cc8ea","ui_warn":"#fbbf24"},"darkName":"dark-mac","description":"Dark Mac, charcoal platinum with blue","gatewayDarkName":"theme-picker-dark-mac-dark","gatewayLightName":"theme-picker-dark-mac-light","label":"Mac","lightColors":{"background":"#e8e4da","banner_accent":"#245a8e","banner_border":"#b8b3a8","banner_dim":"#656057","banner_text":"#1f1f24","banner_title":"#1f1f24","completion_menu_bg":"#f4f1e8","prompt":"#1f1f24","session_border":"#b8b3a8","status_bar_bg":"#d8d4c9","status_bar_text":"#1f1f24","ui_accent":"#245a8e","ui_border":"#b8b3a8","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#1f1f24","ui_tool":"#2e5f88","ui_warn":"#a87a1f"},"lightName":"retro-mac","modeSupport":"dynamic","name":"dark-mac","source":"user"},{"category":"Dynamic","colors":{"background":"#fafafa","banner_accent":"#007e71","banner_border":"#e0e0e0","banner_dim":"#60737d","banner_text":"#263238","banner_title":"#263238","completion_menu_bg":"#f0f0f0","prompt":"#263238","session_border":"#e0e0e0","status_bar_bg":"#f0f0f0","status_bar_text":"#263238","ui_accent":"#007e71","ui_border":"#e0e0e0","ui_error":"#b22424","ui_ok":"#29702d","ui_text":"#263238","ui_tool":"#00685e","ui_warn":"#936b09"},"darkColors":{"background":"#263238","banner_accent":"#82aaff","banner_border":"#37474f","banner_dim":"#b0bec5","banner_text":"#eceff1","banner_title":"#eceff1","completion_menu_bg":"#232e34","prompt":"#eceff1","session_border":"#37474f","status_bar_bg":"#232e34","status_bar_text":"#eceff1","ui_accent":"#82aaff","ui_border":"#37474f","ui_error":"#ef9a9a","ui_ok":"#a5d6a7","ui_text":"#eceff1","ui_tool":"#a9c4ff","ui_warn":"#ffe082"},"darkName":"dark-material","description":"Material, blue-gray developer dark","gatewayDarkName":"theme-picker-dark-material-dark","gatewayLightName":"theme-picker-dark-material-light","label":"Material","lightColors":{"background":"#fafafa","banner_accent":"#007e71","banner_border":"#e0e0e0","banner_dim":"#60737d","banner_text":"#263238","banner_title":"#263238","completion_menu_bg":"#f0f0f0","prompt":"#263238","session_border":"#e0e0e0","status_bar_bg":"#f0f0f0","status_bar_text":"#263238","ui_accent":"#007e71","ui_border":"#e0e0e0","ui_error":"#b22424","ui_ok":"#29702d","ui_text":"#263238","ui_tool":"#00685e","ui_warn":"#936b09"},"lightName":"light-material","modeSupport":"dynamic","name":"dark-material","source":"user"},{"category":"Dynamic","colors":{"background":"#e8f4fd","banner_accent":"#1a6fb5","banner_border":"#b8d4e8","banner_dim":"#4a6b85","banner_text":"#16324a","banner_title":"#16324a","completion_menu_bg":"#ffffff","prompt":"#16324a","session_border":"#b8d4e8","status_bar_bg":"#d8ebf7","status_bar_text":"#16324a","ui_accent":"#1a6fb5","ui_border":"#b8d4e8","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#16324a","ui_tool":"#1f5f8f","ui_warn":"#a87a1f"},"darkColors":{"background":"#0b1220","banner_accent":"#93c5fd","banner_border":"#1c2942","banner_dim":"#7c8aa5","banner_text":"#e2e8f0","banner_title":"#e2e8f0","completion_menu_bg":"#181f2c","prompt":"#e2e8f0","session_border":"#1c2942","status_bar_bg":"#0a101d","status_bar_text":"#e2e8f0","ui_accent":"#93c5fd","ui_border":"#1c2942","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#e2e8f0","ui_tool":"#3b82f6","ui_warn":"#fbbf24"},"darkName":"dark-navy","description":"Deep ocean navy with clear blue accents","gatewayDarkName":"theme-picker-dark-navy-dark","gatewayLightName":"theme-picker-dark-navy-light","label":"Navy","lightColors":{"background":"#e8f4fd","banner_accent":"#1a6fb5","banner_border":"#b8d4e8","banner_dim":"#4a6b85","banner_text":"#16324a","banner_title":"#16324a","completion_menu_bg":"#ffffff","prompt":"#16324a","session_border":"#b8d4e8","status_bar_bg":"#d8ebf7","status_bar_text":"#16324a","ui_accent":"#1a6fb5","ui_border":"#b8d4e8","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#16324a","ui_tool":"#1f5f8f","ui_warn":"#a87a1f"},"lightName":"light-sky","modeSupport":"dynamic","name":"dark-navy","source":"user"},{"category":"Dynamic","colors":{"background":"#eceff4","banner_accent":"#4f6c90","banner_border":"#d8dee9","banner_dim":"#4c566a","banner_text":"#2e3440","banner_title":"#2e3440","completion_menu_bg":"#e3e5ea","prompt":"#2e3440","session_border":"#d8dee9","status_bar_bg":"#e3e5ea","status_bar_text":"#2e3440","ui_accent":"#4f6c90","ui_border":"#d8dee9","ui_error":"#934646","ui_ok":"#547356","ui_text":"#2e3440","ui_tool":"#405a78","ui_warn":"#7b6632"},"darkColors":{"background":"#2e3440","banner_accent":"#88c0d0","banner_border":"#4c566a","banner_dim":"#81a1c1","banner_text":"#e5e9f0","banner_title":"#e5e9f0","completion_menu_bg":"#2a303b","prompt":"#e5e9f0","session_border":"#4c566a","status_bar_bg":"#2a303b","status_bar_text":"#e5e9f0","ui_accent":"#88c0d0","ui_border":"#4c566a","ui_error":"#bf616a","ui_ok":"#a3be8c","ui_text":"#e5e9f0","ui_tool":"#a6d4e0","ui_warn":"#ebcb8b"},"darkName":"dark-nord","description":"Nord, arctic bluish calm","gatewayDarkName":"theme-picker-dark-nord-dark","gatewayLightName":"theme-picker-dark-nord-light","label":"Nord","lightColors":{"background":"#eceff4","banner_accent":"#4f6c90","banner_border":"#d8dee9","banner_dim":"#4c566a","banner_text":"#2e3440","banner_title":"#2e3440","completion_menu_bg":"#e3e5ea","prompt":"#2e3440","session_border":"#d8dee9","status_bar_bg":"#e3e5ea","status_bar_text":"#2e3440","ui_accent":"#4f6c90","ui_border":"#d8dee9","ui_error":"#934646","ui_ok":"#547356","ui_text":"#2e3440","ui_tool":"#405a78","ui_warn":"#7b6632"},"lightName":"light-nord","modeSupport":"dynamic","name":"dark-nord","source":"user"},{"category":"Dynamic","colors":{"background":"#f8f9fa","banner_accent":"#3b6ea5","banner_border":"#c8cdd4","banner_dim":"#5a6270","banner_text":"#1f2328","banner_title":"#1f2328","completion_menu_bg":"#ffffff","prompt":"#1f2328","session_border":"#c8cdd4","status_bar_bg":"#e8eaed","status_bar_text":"#1f2328","ui_accent":"#3b6ea5","ui_border":"#c8cdd4","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#1f2328","ui_tool":"#2f5f8a","ui_warn":"#a87a1f"},"darkColors":{"background":"#0d0d12","banner_accent":"#b3a6ff","banner_border":"#232330","banner_dim":"#8a8699","banner_text":"#e8e6f2","banner_title":"#e8e6f2","completion_menu_bg":"#1a1a1f","prompt":"#e8e6f2","session_border":"#232330","status_bar_bg":"#0c0c10","status_bar_text":"#e8e6f2","ui_accent":"#b3a6ff","ui_border":"#232330","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#e8e6f2","ui_tool":"#6e5ce6","ui_warn":"#fbbf24"},"darkName":"dark-obsidian","description":"Near-black with violet-gray light","gatewayDarkName":"theme-picker-dark-obsidian-dark","gatewayLightName":"theme-picker-dark-obsidian-light","label":"Obsidian","lightColors":{"background":"#f8f9fa","banner_accent":"#3b6ea5","banner_border":"#c8cdd4","banner_dim":"#5a6270","banner_text":"#1f2328","banner_title":"#1f2328","completion_menu_bg":"#ffffff","prompt":"#1f2328","session_border":"#c8cdd4","status_bar_bg":"#e8eaed","status_bar_text":"#1f2328","ui_accent":"#3b6ea5","ui_border":"#c8cdd4","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#1f2328","ui_tool":"#2f5f8a","ui_warn":"#a87a1f"},"lightName":"light-porcelain","modeSupport":"dynamic","name":"dark-obsidian","source":"user"},{"category":"Dynamic","colors":{"background":"#fafafa","banner_accent":"#386ad5","banner_border":"#e5e5e6","banner_dim":"#6d6d72","banner_text":"#383a42","banner_title":"#383a42","completion_menu_bg":"#f0f0f0","prompt":"#383a42","session_border":"#e5e5e6","status_bar_bg":"#f0f0f0","status_bar_text":"#383a42","ui_accent":"#386ad5","ui_border":"#e5e5e6","ui_error":"#cd4d42","ui_ok":"#489147","ui_text":"#383a42","ui_tool":"#2f5ab3","ui_warn":"#9a6a01"},"darkColors":{"background":"#282c34","banner_accent":"#61afef","banner_border":"#3e4451","banner_dim":"#90959e","banner_text":"#abb2bf","banner_title":"#abb2bf","completion_menu_bg":"#252830","prompt":"#abb2bf","session_border":"#3e4451","status_bar_bg":"#252830","status_bar_text":"#abb2bf","ui_accent":"#61afef","ui_border":"#3e4451","ui_error":"#e06c75","ui_ok":"#98c379","ui_text":"#abb2bf","ui_tool":"#8ec7f5","ui_warn":"#e5c07b"},"darkName":"dark-one","description":"One Dark, Atom's default editor theme","gatewayDarkName":"theme-picker-dark-one-dark","gatewayLightName":"theme-picker-dark-one-light","label":"One","lightColors":{"background":"#fafafa","banner_accent":"#386ad5","banner_border":"#e5e5e6","banner_dim":"#6d6d72","banner_text":"#383a42","banner_title":"#383a42","completion_menu_bg":"#f0f0f0","prompt":"#383a42","session_border":"#e5e5e6","status_bar_bg":"#f0f0f0","status_bar_text":"#383a42","ui_accent":"#386ad5","ui_border":"#e5e5e6","ui_error":"#cd4d42","ui_ok":"#489147","ui_text":"#383a42","ui_tool":"#2f5ab3","ui_warn":"#9a6a01"},"lightName":"light-one","modeSupport":"dynamic","name":"dark-one","source":"user"},{"category":"Dynamic","colors":{"background":"#f6eff7","banner_accent":"#7d4a96","banner_border":"#dccce2","banner_dim":"#6d5280","banner_text":"#33203f","banner_title":"#33203f","completion_menu_bg":"#ffffff","prompt":"#33203f","session_border":"#dccce2","status_bar_bg":"#eae0ee","status_bar_text":"#33203f","ui_accent":"#7d4a96","ui_border":"#dccce2","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#33203f","ui_tool":"#6a3f82","ui_warn":"#a87a1f"},"darkColors":{"background":"#1a0f2e","banner_accent":"#a56ae0","banner_border":"#2f1f4a","banner_dim":"#9a8ab5","banner_text":"#f0e8f8","banner_title":"#f0e8f8","completion_menu_bg":"#251841","prompt":"#f0e8f8","session_border":"#2f1f4a","status_bar_bg":"#150c26","status_bar_text":"#f0e8f8","ui_accent":"#a56ae0","ui_border":"#2f1f4a","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#f0e8f8","ui_tool":"#8b4fc8","ui_warn":"#fbbf24"},"darkName":"dark-plum","description":"Deep royal purple with orchid","gatewayDarkName":"theme-picker-dark-plum-dark","gatewayLightName":"theme-picker-dark-plum-light","label":"Plum","lightColors":{"background":"#f6eff7","banner_accent":"#7d4a96","banner_border":"#dccce2","banner_dim":"#6d5280","banner_text":"#33203f","banner_title":"#33203f","completion_menu_bg":"#ffffff","prompt":"#33203f","session_border":"#dccce2","status_bar_bg":"#eae0ee","status_bar_text":"#33203f","ui_accent":"#7d4a96","ui_border":"#dccce2","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#33203f","ui_tool":"#6a3f82","ui_warn":"#a87a1f"},"lightName":"light-grape","modeSupport":"dynamic","name":"dark-plum","source":"user"},{"category":"Dynamic","colors":{"background":"#faf4ed","banner_accent":"#9b5e5b","banner_border":"#f2e9e1","banner_dim":"#6f6c87","banner_text":"#575279","banner_title":"#575279","completion_menu_bg":"#f0eae4","prompt":"#575279","session_border":"#f2e9e1","status_bar_bg":"#f0eae4","status_bar_text":"#575279","ui_accent":"#9b5e5b","ui_border":"#f2e9e1","ui_error":"#a2596e","ui_ok":"#4d858f","ui_text":"#575279","ui_tool":"#7e4a48","ui_warn":"#ac6865"},"darkColors":{"background":"#191724","banner_accent":"#ebbcba","banner_border":"#26233a","banner_dim":"#908caa","banner_text":"#e0def4","banner_title":"#e0def4","completion_menu_bg":"#171521","prompt":"#e0def4","session_border":"#26233a","status_bar_bg":"#171521","status_bar_text":"#e0def4","ui_accent":"#ebbcba","ui_border":"#26233a","ui_error":"#eb6f92","ui_ok":"#9ccfd8","ui_text":"#e0def4","ui_tool":"#f2cfcd","ui_warn":"#f6c177"},"darkName":"dark-rosepine","description":"Rosé Pine, rose-tinted dusk","gatewayDarkName":"theme-picker-dark-rosepine-dark","gatewayLightName":"theme-picker-dark-rosepine-light","label":"Rosepine","lightColors":{"background":"#faf4ed","banner_accent":"#9b5e5b","banner_border":"#f2e9e1","banner_dim":"#6f6c87","banner_text":"#575279","banner_title":"#575279","completion_menu_bg":"#f0eae4","prompt":"#575279","session_border":"#f2e9e1","status_bar_bg":"#f0eae4","status_bar_text":"#575279","ui_accent":"#9b5e5b","ui_border":"#f2e9e1","ui_error":"#a2596e","ui_ok":"#4d858f","ui_text":"#575279","ui_tool":"#7e4a48","ui_warn":"#ac6865"},"lightName":"light-rosepine","modeSupport":"dynamic","name":"dark-rosepine","source":"user"},{"category":"Dynamic","colors":{"background":"#f0f4ea","banner_accent":"#52703a","banner_border":"#d2dcc4","banner_dim":"#627054","banner_text":"#2c3a26","banner_title":"#2c3a26","completion_menu_bg":"#ffffff","prompt":"#2c3a26","session_border":"#d2dcc4","status_bar_bg":"#e2e9d8","status_bar_text":"#2c3a26","ui_accent":"#52703a","ui_border":"#d2dcc4","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#2c3a26","ui_tool":"#4a6634","ui_warn":"#a87a1f"},"darkColors":{"background":"#141812","banner_accent":"#8fae6a","banner_border":"#2a3223","banner_dim":"#7d8a70","banner_text":"#f5f2ec","banner_title":"#f5f2ec","completion_menu_bg":"#121611","prompt":"#f5f2ec","session_border":"#2a3223","status_bar_bg":"#121611","status_bar_text":"#f5f2ec","ui_accent":"#8fae6a","ui_border":"#2a3223","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#f5f2ec","ui_tool":"#b3cc8f","ui_warn":"#fbbf24"},"darkName":"dark-sage","description":"Dark sage, olive on near-black","gatewayDarkName":"theme-picker-dark-sage-dark","gatewayLightName":"theme-picker-dark-sage-light","label":"Sage","lightColors":{"background":"#f0f4ea","banner_accent":"#52703a","banner_border":"#d2dcc4","banner_dim":"#627054","banner_text":"#2c3a26","banner_title":"#2c3a26","completion_menu_bg":"#ffffff","prompt":"#2c3a26","session_border":"#d2dcc4","status_bar_bg":"#e2e9d8","status_bar_text":"#2c3a26","ui_accent":"#52703a","ui_border":"#d2dcc4","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#2c3a26","ui_tool":"#4a6634","ui_warn":"#a87a1f"},"lightName":"light-sage","modeSupport":"dynamic","name":"dark-sage","source":"user"},{"category":"Dynamic","colors":{"background":"#fdf6e3","banner_accent":"#2075b0","banner_border":"#eee8d5","banner_dim":"#647072","banner_text":"#4d6167","banner_title":"#4d6167","completion_menu_bg":"#f3ecda","prompt":"#4d6167","session_border":"#eee8d5","status_bar_bg":"#f3ecda","status_bar_text":"#4d6167","ui_accent":"#2075b0","ui_border":"#eee8d5","ui_error":"#9f3429","ui_ok":"#4f6e00","ui_text":"#4d6167","ui_tool":"#1a5e8a","ui_warn":"#6e5800"},"darkColors":{"background":"#002b36","banner_accent":"#3794d6","banner_border":"#073642","banner_dim":"#7e9097","banner_text":"#9ca9a9","banner_title":"#9ca9a9","completion_menu_bg":"#002832","prompt":"#9ca9a9","session_border":"#073642","status_bar_bg":"#002832","status_bar_text":"#9ca9a9","ui_accent":"#3794d6","ui_border":"#073642","ui_error":"#dc322f","ui_ok":"#859900","ui_text":"#9ca9a9","ui_tool":"#6db3e8","ui_warn":"#b58900"},"darkName":"dark-solarized","description":"Solarized dark, teal-black with cyan blue","gatewayDarkName":"theme-picker-dark-solarized-dark","gatewayLightName":"theme-picker-dark-solarized-light","label":"Solarized","lightColors":{"background":"#fdf6e3","banner_accent":"#2075b0","banner_border":"#eee8d5","banner_dim":"#647072","banner_text":"#4d6167","banner_title":"#4d6167","completion_menu_bg":"#f3ecda","prompt":"#4d6167","session_border":"#eee8d5","status_bar_bg":"#f3ecda","status_bar_text":"#4d6167","ui_accent":"#2075b0","ui_border":"#eee8d5","ui_error":"#9f3429","ui_ok":"#4f6e00","ui_text":"#4d6167","ui_tool":"#1a5e8a","ui_warn":"#6e5800"},"lightName":"light-solarized","modeSupport":"dynamic","name":"dark-solarized","source":"user"},{"category":"Dynamic","colors":{"background":"#e1e2e7","banner_accent":"#235fb1","banner_border":"#c4c8da","banner_dim":"#565a6e","banner_text":"#343b58","banner_title":"#343b58","completion_menu_bg":"#d8d9de","prompt":"#343b58","session_border":"#c4c8da","status_bar_bg":"#d8d9de","status_bar_text":"#343b58","ui_accent":"#235fb1","ui_border":"#c4c8da","ui_error":"#af3a46","ui_ok":"#2a6334","ui_text":"#343b58","ui_tool":"#1c4f8f","ui_warn":"#7b5519"},"darkColors":{"background":"#1a1b26","banner_accent":"#7aa2f7","banner_border":"#2f334d","banner_dim":"#7f85a5","banner_text":"#c0caf5","banner_title":"#c0caf5","completion_menu_bg":"#181923","prompt":"#c0caf5","session_border":"#2f334d","status_bar_bg":"#181923","status_bar_text":"#c0caf5","ui_accent":"#7aa2f7","ui_border":"#2f334d","ui_error":"#f7768e","ui_ok":"#9ece6a","ui_text":"#c0caf5","ui_tool":"#a9c2fb","ui_warn":"#e0af68"},"darkName":"dark-tokyo-night","description":"Tokyo Night, blue-purple dusk","gatewayDarkName":"theme-picker-dark-tokyo-night-dark","gatewayLightName":"theme-picker-dark-tokyo-night-light","label":"Tokyo Night","lightColors":{"background":"#e1e2e7","banner_accent":"#235fb1","banner_border":"#c4c8da","banner_dim":"#565a6e","banner_text":"#343b58","banner_title":"#343b58","completion_menu_bg":"#d8d9de","prompt":"#343b58","session_border":"#c4c8da","status_bar_bg":"#d8d9de","status_bar_text":"#343b58","ui_accent":"#235fb1","ui_border":"#c4c8da","ui_error":"#af3a46","ui_ok":"#2a6334","ui_text":"#343b58","ui_tool":"#1c4f8f","ui_warn":"#7b5519"},"lightName":"light-tokyo-day","modeSupport":"dynamic","name":"dark-tokyo-night","source":"user"},{"category":"Dynamic","colors":{"background":"#faf5ea","banner_accent":"#8a6a2f","banner_border":"#e3d9c2","banner_dim":"#7a6f58","banner_text":"#3c3323","banner_title":"#3c3323","completion_menu_bg":"#ffffff","prompt":"#3c3323","session_border":"#e3d9c2","status_bar_bg":"#f0e8d2","status_bar_text":"#3c3323","ui_accent":"#8a6a2f","ui_border":"#e3d9c2","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#3c3323","ui_tool":"#785e2a","ui_warn":"#a87a1f"},"darkColors":{"background":"#1c1711","banner_accent":"#d9a83c","banner_border":"#352b1c","banner_dim":"#9a8a6a","banner_text":"#f5f2ec","banner_title":"#f5f2ec","completion_menu_bg":"#1a1510","prompt":"#f5f2ec","session_border":"#352b1c","status_bar_bg":"#1a1510","status_bar_text":"#f5f2ec","ui_accent":"#d9a83c","ui_border":"#352b1c","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#f5f2ec","ui_tool":"#e8c06a","ui_warn":"#fbbf24"},"darkName":"dark-vanilla","description":"Dark vanilla, honey on warm dark","gatewayDarkName":"theme-picker-dark-vanilla-dark","gatewayLightName":"theme-picker-dark-vanilla-light","label":"Vanilla","lightColors":{"background":"#faf5ea","banner_accent":"#8a6a2f","banner_border":"#e3d9c2","banner_dim":"#7a6f58","banner_text":"#3c3323","banner_title":"#3c3323","completion_menu_bg":"#ffffff","prompt":"#3c3323","session_border":"#e3d9c2","status_bar_bg":"#f0e8d2","status_bar_text":"#3c3323","ui_accent":"#8a6a2f","ui_border":"#e3d9c2","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#3c3323","ui_tool":"#785e2a","ui_warn":"#a87a1f"},"lightName":"light-vanilla","modeSupport":"dynamic","name":"dark-vanilla","source":"user"},{"category":"Dynamic","colors":{"background":"#ffffff","banner_accent":"#0066b8","banner_border":"#e5e5e5","banner_dim":"#6a6a6a","banner_text":"#333333","banner_title":"#333333","completion_menu_bg":"#f5f5f5","prompt":"#333333","session_border":"#e5e5e5","status_bar_bg":"#f5f5f5","status_bar_text":"#333333","ui_accent":"#0066b8","ui_border":"#e5e5e5","ui_error":"#b82c2c","ui_ok":"#007300","ui_text":"#333333","ui_tool":"#00539a","ui_warn":"#614b1e"},"darkColors":{"background":"#1e1e1e","banner_accent":"#298fd4","banner_border":"#3a3a3a","banner_dim":"#8a8a8a","banner_text":"#d4d4d4","banner_title":"#d4d4d4","completion_menu_bg":"#1c1c1c","prompt":"#d4d4d4","session_border":"#3a3a3a","status_bar_bg":"#1c1c1c","status_bar_text":"#d4d4d4","ui_accent":"#298fd4","ui_border":"#3a3a3a","ui_error":"#f48771","ui_ok":"#4ec9b0","ui_text":"#d4d4d4","ui_tool":"#4fa8e0","ui_warn":"#dcdcaa"},"darkName":"dark-vscode","description":"VSCode Dark+, the most-used editor default","gatewayDarkName":"theme-picker-dark-vscode-dark","gatewayLightName":"theme-picker-dark-vscode-light","label":"Vscode","lightColors":{"background":"#ffffff","banner_accent":"#0066b8","banner_border":"#e5e5e5","banner_dim":"#6a6a6a","banner_text":"#333333","banner_title":"#333333","completion_menu_bg":"#f5f5f5","prompt":"#333333","session_border":"#e5e5e5","status_bar_bg":"#f5f5f5","status_bar_text":"#333333","ui_accent":"#0066b8","ui_border":"#e5e5e5","ui_error":"#b82c2c","ui_ok":"#007300","ui_text":"#333333","ui_tool":"#00539a","ui_warn":"#614b1e"},"lightName":"light-vscode","modeSupport":"dynamic","name":"dark-vscode","source":"user"},{"category":"Dynamic","colors":{"background":"#f4f5f7","banner_accent":"#5b6572","banner_border":"#c9cdd3","banner_dim":"#565d66","banner_text":"#2e3033","banner_title":"#2e3033","completion_menu_bg":"#ffffff","prompt":"#2e3033","session_border":"#c9cdd3","status_bar_bg":"#e6e8eb","status_bar_text":"#2e3033","ui_accent":"#5b6572","ui_border":"#c9cdd3","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#2e3033","ui_tool":"#6b7684","ui_warn":"#a87a1f"},"darkColors":{"background":"#17181a","banner_accent":"#c3cad2","banner_border":"#26272b","banner_dim":"#8f959c","banner_text":"#e8eaec","banner_title":"#e8eaec","completion_menu_bg":"#242527","prompt":"#e8eaec","session_border":"#26272b","status_bar_bg":"#151617","status_bar_text":"#e8eaec","ui_accent":"#c3cad2","ui_border":"#26272b","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#e8eaec","ui_tool":"#9aa3ad","ui_warn":"#fbbf24"},"darkName":"minimal-graphite","description":"Gray monochrome, quiet and precise","gatewayDarkName":"theme-picker-minimal-graphite-dark","gatewayLightName":"theme-picker-minimal-graphite-light","label":"Minimal Graphite","lightColors":{"background":"#f4f5f7","banner_accent":"#5b6572","banner_border":"#c9cdd3","banner_dim":"#565d66","banner_text":"#2e3033","banner_title":"#2e3033","completion_menu_bg":"#ffffff","prompt":"#2e3033","session_border":"#c9cdd3","status_bar_bg":"#e6e8eb","status_bar_text":"#2e3033","ui_accent":"#5b6572","ui_border":"#c9cdd3","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#2e3033","ui_tool":"#6b7684","ui_warn":"#a87a1f"},"lightName":"minimal-pearl","modeSupport":"dynamic","name":"minimal-graphite","source":"user"},{"category":"Dynamic","colors":{"background":"#fdf1e6","banner_accent":"#b04f22","banner_border":"#ecd2b8","banner_dim":"#8a624a","banner_text":"#43281c","banner_title":"#43281c","completion_menu_bg":"#ffffff","prompt":"#43281c","session_border":"#ecd2b8","status_bar_bg":"#f6e2cc","status_bar_text":"#43281c","ui_accent":"#b04f22","ui_border":"#ecd2b8","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#43281c","ui_tool":"#9a451e","ui_warn":"#a87a1f"},"darkColors":{"background":"#241510","banner_accent":"#e07b39","banner_border":"#3d2418","banner_dim":"#b89880","banner_text":"#f5e8d8","banner_title":"#f5e8d8","completion_menu_bg":"#2e1c13","prompt":"#f5e8d8","session_border":"#3d2418","status_bar_bg":"#1d110c","status_bar_text":"#f5e8d8","ui_accent":"#e07b39","ui_border":"#3d2418","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#f5e8d8","ui_tool":"#c25a24","ui_warn":"#fbbf24"},"darkName":"nature-autumn","description":"Rust and burnt orange on warm earth","gatewayDarkName":"theme-picker-nature-autumn-dark","gatewayLightName":"theme-picker-nature-autumn-light","label":"Nature Autumn","lightColors":{"background":"#fdf1e6","banner_accent":"#b04f22","banner_border":"#ecd2b8","banner_dim":"#8a624a","banner_text":"#43281c","banner_title":"#43281c","completion_menu_bg":"#ffffff","prompt":"#43281c","session_border":"#ecd2b8","status_bar_bg":"#f6e2cc","status_bar_text":"#43281c","ui_accent":"#b04f22","ui_border":"#ecd2b8","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#43281c","ui_tool":"#9a451e","ui_warn":"#a87a1f"},"lightName":"light-melon","modeSupport":"dynamic","name":"nature-autumn","source":"user"},{"category":"Dynamic","colors":{"background":"#f6f1e4","banner_accent":"#667433","banner_border":"#e0d8bf","banner_dim":"#716b54","banner_text":"#2e2a1e","banner_title":"#2e2a1e","completion_menu_bg":"#eae5d8","prompt":"#2e2a1e","session_border":"#e0d8bf","status_bar_bg":"#f7f2e6","status_bar_text":"#2e2a1e","ui_accent":"#667433","ui_border":"#e0d8bf","ui_error":"#c65a5a","ui_ok":"#2f8e52","ui_text":"#2e2a1e","ui_tool":"#7a8a3d","ui_warn":"#a17a17"},"darkColors":{"background":"#1d1710","banner_accent":"#f0c07a","banner_border":"#3a2c1c","banner_dim":"#a89072","banner_text":"#f0e6d8","banner_title":"#f0e6d8","completion_menu_bg":"#2a231c","prompt":"#f0e6d8","session_border":"#3a2c1c","status_bar_bg":"#1a150e","status_bar_text":"#f0e6d8","ui_accent":"#f0c07a","ui_border":"#3a2c1c","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#f0e6d8","ui_tool":"#d99a3d","ui_warn":"#fbbf24"},"darkName":"nature-desert","description":"Sand dune amber on warm dark","gatewayDarkName":"theme-picker-nature-desert-dark","gatewayLightName":"theme-picker-nature-desert-light","label":"Nature Desert","lightColors":{"background":"#f6f1e4","banner_accent":"#667433","banner_border":"#e0d8bf","banner_dim":"#716b54","banner_text":"#2e2a1e","banner_title":"#2e2a1e","completion_menu_bg":"#eae5d8","prompt":"#2e2a1e","session_border":"#e0d8bf","status_bar_bg":"#f7f2e6","status_bar_text":"#2e2a1e","ui_accent":"#667433","ui_border":"#e0d8bf","ui_error":"#c65a5a","ui_ok":"#2f8e52","ui_text":"#2e2a1e","ui_tool":"#7a8a3d","ui_warn":"#a17a17"},"lightName":"light-sand","modeSupport":"dynamic","name":"nature-desert","source":"user"},{"category":"Dynamic","colors":{"background":"#eff5ec","banner_accent":"#3f7a45","banner_border":"#d0dcc8","banner_dim":"#5f745f","banner_text":"#233a26","banner_title":"#233a26","completion_menu_bg":"#ffffff","prompt":"#233a26","session_border":"#d0dcc8","status_bar_bg":"#dfe8d8","status_bar_text":"#233a26","ui_accent":"#3f7a45","ui_border":"#d0dcc8","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#233a26","ui_tool":"#356a3a","ui_warn":"#a87a1f"},"darkColors":{"background":"#0f1a12","banner_accent":"#8fe08f","banner_border":"#24382a","banner_dim":"#86a086","banner_text":"#d9ead9","banner_title":"#d9ead9","completion_menu_bg":"#1b261e","prompt":"#d9ead9","session_border":"#24382a","status_bar_bg":"#0e1710","status_bar_text":"#d9ead9","ui_accent":"#8fe08f","ui_border":"#24382a","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#d9ead9","ui_tool":"#4caf50","ui_warn":"#fbbf24"},"darkName":"nature-forest","description":"Moss and pine, deep green calm","gatewayDarkName":"theme-picker-nature-forest-dark","gatewayLightName":"theme-picker-nature-forest-light","label":"Nature Forest","lightColors":{"background":"#eff5ec","banner_accent":"#3f7a45","banner_border":"#d0dcc8","banner_dim":"#5f745f","banner_text":"#233a26","banner_title":"#233a26","completion_menu_bg":"#ffffff","prompt":"#233a26","session_border":"#d0dcc8","status_bar_bg":"#dfe8d8","status_bar_text":"#233a26","ui_accent":"#3f7a45","ui_border":"#d0dcc8","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#233a26","ui_tool":"#356a3a","ui_warn":"#a87a1f"},"lightName":"light-fern","modeSupport":"dynamic","name":"nature-forest","source":"user"},{"category":"Dynamic","colors":{"background":"#eef4f8","banner_accent":"#2f6f9f","banner_border":"#d3e0ea","banner_dim":"#5b6f80","banner_text":"#22303b","banner_title":"#22303b","completion_menu_bg":"#e2e8ed","prompt":"#22303b","session_border":"#d3e0ea","status_bar_bg":"#eff5f9","status_bar_text":"#22303b","ui_accent":"#2f6f9f","ui_border":"#d3e0ea","ui_error":"#c65a5a","ui_ok":"#2f8e52","ui_text":"#22303b","ui_tool":"#2f6f9f","ui_warn":"#a17a17"},"darkColors":{"background":"#121a20","banner_accent":"#b7dbe8","banner_border":"#26343e","banner_dim":"#8ba0ad","banner_text":"#dfe8ee","banner_title":"#dfe8ee","completion_menu_bg":"#1e262c","prompt":"#dfe8ee","session_border":"#26343e","status_bar_bg":"#10171d","status_bar_text":"#dfe8ee","ui_accent":"#b7dbe8","ui_border":"#26343e","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#dfe8ee","ui_tool":"#7fb2c5","ui_warn":"#fbbf24"},"darkName":"nature-nordic","description":"Frosted fjord blue-gray","gatewayDarkName":"theme-picker-nature-nordic-dark","gatewayLightName":"theme-picker-nature-nordic-light","label":"Nature Nordic","lightColors":{"background":"#eef4f8","banner_accent":"#2f6f9f","banner_border":"#d3e0ea","banner_dim":"#5b6f80","banner_text":"#22303b","banner_title":"#22303b","completion_menu_bg":"#e2e8ed","prompt":"#22303b","session_border":"#d3e0ea","status_bar_bg":"#eff5f9","status_bar_text":"#22303b","ui_accent":"#2f6f9f","ui_border":"#d3e0ea","ui_error":"#c65a5a","ui_ok":"#2f8e52","ui_text":"#22303b","ui_tool":"#2f6f9f","ui_warn":"#a17a17"},"lightName":"light-frost","modeSupport":"dynamic","name":"nature-nordic","source":"user"},{"category":"Dynamic","colors":{"background":"#e9f5f2","banner_accent":"#127a7a","banner_border":"#bcd8d4","banner_dim":"#3f6666","banner_text":"#143838","banner_title":"#143838","completion_menu_bg":"#ffffff","prompt":"#143838","session_border":"#bcd8d4","status_bar_bg":"#d4e8e4","status_bar_text":"#143838","ui_accent":"#127a7a","ui_border":"#bcd8d4","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#143838","ui_tool":"#106666","ui_warn":"#a87a1f"},"darkColors":{"background":"#0a1a24","banner_accent":"#4dd8d8","banner_border":"#14303f","banner_dim":"#7fa8b5","banner_text":"#d8f0f5","banner_title":"#d8f0f5","completion_menu_bg":"#122630","prompt":"#d8f0f5","session_border":"#14303f","status_bar_bg":"#081520","status_bar_text":"#d8f0f5","ui_accent":"#4dd8d8","ui_border":"#14303f","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#d8f0f5","ui_tool":"#2db4b4","ui_warn":"#fbbf24"},"darkName":"nature-ocean","description":"Deep sea teal with foam white","gatewayDarkName":"theme-picker-nature-ocean-dark","gatewayLightName":"theme-picker-nature-ocean-light","label":"Nature Ocean","lightColors":{"background":"#e9f5f2","banner_accent":"#127a7a","banner_border":"#bcd8d4","banner_dim":"#3f6666","banner_text":"#143838","banner_title":"#143838","completion_menu_bg":"#ffffff","prompt":"#143838","session_border":"#bcd8d4","status_bar_bg":"#d4e8e4","status_bar_text":"#143838","ui_accent":"#127a7a","ui_border":"#bcd8d4","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#143838","ui_tool":"#106666","ui_warn":"#a87a1f"},"lightName":"light-tide","modeSupport":"dynamic","name":"nature-ocean","source":"user"},{"category":"Dynamic","colors":{"background":"#f7f4ec","banner_accent":"#8e623a","banner_border":"#ded7c9","banner_dim":"#6f675c","banner_text":"#2b2620","banner_title":"#2b2620","completion_menu_bg":"#ebe8e0","prompt":"#2b2620","session_border":"#ded7c9","status_bar_bg":"#f8f5ee","status_bar_text":"#2b2620","ui_accent":"#8e623a","ui_border":"#ded7c9","ui_error":"#c65a5a","ui_ok":"#2f8e52","ui_text":"#2b2620","ui_tool":"#9a6b3f","ui_warn":"#a17a17"},"darkColors":{"background":"#101012","banner_accent":"#787890","banner_border":"#505870","banner_dim":"#808090","banner_text":"#d8d8e0","banner_title":"#d0d0d8","completion_menu_bg":"#101012","prompt":"#d8d8e0","session_border":"#383848","status_bar_bg":"#08080a","status_bar_text":"#888898","ui_accent":"#84849c","ui_border":"#505870","ui_error":"#b05850","ui_ok":"#60a070","ui_text":"#d8d8e0","ui_tool":"#6090a0","ui_warn":"#c0a860"},"darkName":"newsprint-noir","description":"1940s detective film — stark off-white text on ink-black, with muted navy and rust accents","gatewayDarkName":"theme-picker-newsprint-noir-dark","gatewayLightName":"theme-picker-newsprint-noir-light","label":"Newsprint Noir","lightColors":{"background":"#f7f4ec","banner_accent":"#8e623a","banner_border":"#ded7c9","banner_dim":"#6f675c","banner_text":"#2b2620","banner_title":"#2b2620","completion_menu_bg":"#ebe8e0","prompt":"#2b2620","session_border":"#ded7c9","status_bar_bg":"#f8f5ee","status_bar_text":"#2b2620","ui_accent":"#8e623a","ui_border":"#ded7c9","ui_error":"#c65a5a","ui_ok":"#2f8e52","ui_text":"#2b2620","ui_tool":"#9a6b3f","ui_warn":"#a17a17"},"lightName":"light-paper","modeSupport":"dynamic","name":"newsprint-noir","source":"user"},{"category":"Dynamic","colors":{"background":"#fdf1ea","banner_accent":"#b84c24","banner_border":"#e8cdbd","banner_dim":"#8a5f4e","banner_text":"#4a2418","banner_title":"#4a2418","completion_menu_bg":"#ffffff","prompt":"#4a2418","session_border":"#e8cdbd","status_bar_bg":"#f7e5d8","status_bar_text":"#4a2418","ui_accent":"#b84c24","ui_border":"#e8cdbd","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#4a2418","ui_tool":"#a84a2a","ui_warn":"#a87a1f"},"darkColors":{"background":"#201c18","banner_accent":"#e0a080","banner_border":"#d89070","banner_dim":"#948474","banner_text":"#e8d8c8","banner_title":"#f0c8a8","completion_menu_bg":"#201c18","prompt":"#e8d8c8","session_border":"#584838","status_bar_bg":"#141210","status_bar_text":"#a89080","ui_accent":"#e0a080","ui_border":"#d89070","ui_error":"#d07068","ui_ok":"#90c090","ui_text":"#e8d8c8","ui_tool":"#90b8c0","ui_warn":"#e0b870"},"darkName":"peach-fuzz","description":"Pantone Color of the Year 2024 — soft peach, warm coral, and gentle cream on dark taupe","gatewayDarkName":"theme-picker-peach-fuzz-dark","gatewayLightName":"theme-picker-peach-fuzz-light","label":"Peach Fuzz","lightColors":{"background":"#fdf1ea","banner_accent":"#b84c24","banner_border":"#e8cdbd","banner_dim":"#8a5f4e","banner_text":"#4a2418","banner_title":"#4a2418","completion_menu_bg":"#ffffff","prompt":"#4a2418","session_border":"#e8cdbd","status_bar_bg":"#f7e5d8","status_bar_text":"#4a2418","ui_accent":"#b84c24","ui_border":"#e8cdbd","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#4a2418","ui_tool":"#a84a2a","ui_warn":"#a87a1f"},"lightName":"light-peach","modeSupport":"dynamic","name":"peach-fuzz","source":"user"},{"category":"Dynamic","colors":{"background":"#faf6ef","banner_accent":"#b15435","banner_border":"#e5dccb","banner_dim":"#7d6f5e","banner_text":"#33291f","banner_title":"#33291f","completion_menu_bg":"#eeeae3","prompt":"#33291f","session_border":"#e5dccb","status_bar_bg":"#faf7f0","status_bar_text":"#33291f","ui_accent":"#b15435","ui_border":"#e5dccb","ui_error":"#d05f5f","ui_ok":"#2f8e52","ui_text":"#33291f","ui_tool":"#c05b3a","ui_warn":"#a17a17"},"darkColors":{"background":"#1e1814","banner_accent":"#8a7050","banner_border":"#6b8a5a","banner_dim":"#928070","banner_text":"#d8d0c0","banner_title":"#a0c080","completion_menu_bg":"#1e1814","prompt":"#d8d0c0","session_border":"#4a3828","status_bar_bg":"#14100c","status_bar_text":"#a09880","ui_accent":"#a28868","ui_border":"#6b8a5a","ui_error":"#b87050","ui_ok":"#90b870","ui_text":"#d8d0c0","ui_tool":"#80a868","ui_warn":"#c8a050"},"darkName":"redwood","description":"Ancient forest floor — deep bark brown, moss green, and dappled amber light","gatewayDarkName":"theme-picker-redwood-dark","gatewayLightName":"theme-picker-redwood-light","label":"Redwood","lightColors":{"background":"#faf6ef","banner_accent":"#b15435","banner_border":"#e5dccb","banner_dim":"#7d6f5e","banner_text":"#33291f","banner_title":"#33291f","completion_menu_bg":"#eeeae3","prompt":"#33291f","session_border":"#e5dccb","status_bar_bg":"#faf7f0","status_bar_text":"#33291f","ui_accent":"#b15435","ui_border":"#e5dccb","ui_error":"#d05f5f","ui_ok":"#2f8e52","ui_text":"#33291f","ui_tool":"#c05b3a","ui_warn":"#a17a17"},"lightName":"light-cream","modeSupport":"dynamic","name":"redwood","source":"user"},{"category":"Dynamic","colors":{"background":"#faf5e8","banner_accent":"#8a5f0c","banner_border":"#ddd0b4","banner_dim":"#7a6a4a","banner_text":"#4a3a1e","banner_title":"#4a3a1e","completion_menu_bg":"#ffffff","prompt":"#4a3a1e","session_border":"#ddd0b4","status_bar_bg":"#f0e8d2","status_bar_text":"#4a3a1e","ui_accent":"#8a5f0c","ui_border":"#ddd0b4","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#4a3a1e","ui_tool":"#7a5a10","ui_warn":"#a87a1f"},"darkColors":{"background":"#150d04","banner_accent":"#ffc37d","banner_border":"#3a2810","banner_dim":"#a07c45","banner_text":"#ffe8c8","banner_title":"#ffe8c8","completion_menu_bg":"#231a10","prompt":"#ffe8c8","session_border":"#3a2810","status_bar_bg":"#130c04","status_bar_text":"#ffe8c8","ui_accent":"#ffc37d","ui_border":"#3a2810","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#ffe8c8","ui_tool":"#ff9d2e","ui_warn":"#fbbf24"},"darkName":"retro-amber","description":"Amber CRT glow on near-black","gatewayDarkName":"theme-picker-retro-amber-dark","gatewayLightName":"theme-picker-retro-amber-light","label":"Retro Amber","lightColors":{"background":"#faf5e8","banner_accent":"#8a5f0c","banner_border":"#ddd0b4","banner_dim":"#7a6a4a","banner_text":"#4a3a1e","banner_title":"#4a3a1e","completion_menu_bg":"#ffffff","prompt":"#4a3a1e","session_border":"#ddd0b4","status_bar_bg":"#f0e8d2","status_bar_text":"#4a3a1e","ui_accent":"#8a5f0c","ui_border":"#ddd0b4","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#4a3a1e","ui_tool":"#7a5a10","ui_warn":"#a87a1f"},"lightName":"light-honey","modeSupport":"dynamic","name":"retro-amber","source":"user"},{"category":"Dynamic","colors":{"background":"#e7edf5","banner_accent":"#3a5f8a","banner_border":"#c2d0de","banner_dim":"#52637a","banner_text":"#1e2f47","banner_title":"#1e2f47","completion_menu_bg":"#ffffff","prompt":"#1e2f47","session_border":"#c2d0de","status_bar_bg":"#d6e0ec","status_bar_text":"#1e2f47","ui_accent":"#3a5f8a","ui_border":"#c2d0de","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#1e2f47","ui_tool":"#2f5078","ui_warn":"#a87a1f"},"darkColors":{"background":"#04081a","banner_accent":"#8ccaff","banner_border":"#122452","banner_dim":"#6a86b0","banner_text":"#d6e6ff","banner_title":"#d6e6ff","completion_menu_bg":"#111528","prompt":"#d6e6ff","session_border":"#122452","status_bar_bg":"#040717","status_bar_text":"#d6e6ff","ui_accent":"#8ccaff","ui_border":"#122452","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#d6e6ff","ui_tool":"#44aaff","ui_warn":"#fbbf24"},"darkName":"retro-blue","description":"Commodore-style bright blue","gatewayDarkName":"theme-picker-retro-blue-dark","gatewayLightName":"theme-picker-retro-blue-light","label":"Retro Blue","lightColors":{"background":"#e7edf5","banner_accent":"#3a5f8a","banner_border":"#c2d0de","banner_dim":"#52637a","banner_text":"#1e2f47","banner_title":"#1e2f47","completion_menu_bg":"#ffffff","prompt":"#1e2f47","session_border":"#c2d0de","status_bar_bg":"#d6e0ec","status_bar_text":"#1e2f47","ui_accent":"#3a5f8a","ui_border":"#c2d0de","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#1e2f47","ui_tool":"#2f5078","ui_warn":"#a87a1f"},"lightName":"light-denim","modeSupport":"dynamic","name":"retro-blue","source":"user"},{"category":"Dynamic","colors":{"background":"#f2faf5","banner_accent":"#267e58","banner_border":"#d3e8dd","banner_dim":"#5b7569","banner_text":"#1e2b25","banner_title":"#1e2b25","completion_menu_bg":"#e5eee9","prompt":"#1e2b25","session_border":"#d3e8dd","status_bar_bg":"#f3faf6","status_bar_text":"#1e2b25","ui_accent":"#267e58","ui_border":"#d3e8dd","ui_error":"#d05f5f","ui_ok":"#2f8e52","ui_text":"#1e2b25","ui_tool":"#2f9e6e","ui_warn":"#a17a17"},"darkColors":{"background":"#0a1208","banner_accent":"#7dffa8","banner_border":"#17331c","banner_dim":"#5f8f6a","banner_text":"#c8ffd5","banner_title":"#c8ffd5","completion_menu_bg":"#152014","prompt":"#c8ffd5","session_border":"#17331c","status_bar_bg":"#091007","status_bar_text":"#c8ffd5","ui_accent":"#7dffa8","ui_border":"#17331c","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#c8ffd5","ui_tool":"#33ff66","ui_warn":"#fbbf24"},"darkName":"retro-terminal","description":"Classic green phosphor terminal","gatewayDarkName":"theme-picker-retro-terminal-dark","gatewayLightName":"theme-picker-retro-terminal-light","label":"Retro Terminal","lightColors":{"background":"#f2faf5","banner_accent":"#267e58","banner_border":"#d3e8dd","banner_dim":"#5b7569","banner_text":"#1e2b25","banner_title":"#1e2b25","completion_menu_bg":"#e5eee9","prompt":"#1e2b25","session_border":"#d3e8dd","status_bar_bg":"#f3faf6","status_bar_text":"#1e2b25","ui_accent":"#267e58","ui_border":"#d3e8dd","ui_error":"#d05f5f","ui_ok":"#2f8e52","ui_text":"#1e2b25","ui_tool":"#2f9e6e","ui_warn":"#a17a17"},"lightName":"light-mint","modeSupport":"dynamic","name":"retro-terminal","source":"user"},{"category":"Dynamic","colors":{"background":"#eef2f6","banner_accent":"#4a6a85","banner_border":"#ccd6de","banner_dim":"#5a6a7a","banner_text":"#24313d","banner_title":"#24313d","completion_menu_bg":"#ffffff","prompt":"#24313d","session_border":"#ccd6de","status_bar_bg":"#dbe2e8","status_bar_text":"#24313d","ui_accent":"#4a6a85","ui_border":"#ccd6de","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#24313d","ui_tool":"#3e5a72","ui_warn":"#a87a1f"},"darkColors":{"background":"#1c1e22","banner_accent":"#687488","banner_border":"#444a54","banner_dim":"#888e98","banner_text":"#c0c4cc","banner_title":"#a0a8b4","completion_menu_bg":"#1c1e22","prompt":"#c0c4cc","session_border":"#343a44","status_bar_bg":"#121418","status_bar_text":"#808488","ui_accent":"#808ca0","ui_border":"#444a54","ui_error":"#907a7a","ui_ok":"#7a907a","ui_text":"#c0c4cc","ui_tool":"#687488","ui_warn":"#908a70"},"darkName":"slate-mist","description":"Fogged window — soft blue-gray monochrome with barely-there contrast, calm and quiet","gatewayDarkName":"theme-picker-slate-mist-dark","gatewayLightName":"theme-picker-slate-mist-light","label":"Slate Mist","lightColors":{"background":"#eef2f6","banner_accent":"#4a6a85","banner_border":"#ccd6de","banner_dim":"#5a6a7a","banner_text":"#24313d","banner_title":"#24313d","completion_menu_bg":"#ffffff","prompt":"#24313d","session_border":"#ccd6de","status_bar_bg":"#dbe2e8","status_bar_text":"#24313d","ui_accent":"#4a6a85","ui_border":"#ccd6de","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#24313d","ui_tool":"#3e5a72","ui_warn":"#a87a1f"},"lightName":"light-mist","modeSupport":"dynamic","name":"slate-mist","source":"user"},{"category":"Dynamic","colors":{"background":"#f7f3ee","banner_accent":"#2a5da8","banner_border":"#d8d0c4","banner_dim":"#6b6b78","banner_text":"#141414","banner_title":"#141414","completion_menu_bg":"#ede9e4","prompt":"#141414","session_border":"#d8d0c4","status_bar_bg":"#ede9e4","status_bar_text":"#141414","ui_accent":"#2a5da8","ui_border":"#d8d0c4","ui_error":"#d36060","ui_ok":"#3fbd6d","ui_text":"#141414","ui_tool":"#1f4a86","ui_warn":"#bc8f1b"},"darkColors":{"background":"#141420","banner_accent":"#50a0d0","banner_border":"#c0a050","banner_dim":"#808090","banner_text":"#d8d0c8","banner_title":"#e07050","completion_menu_bg":"#141420","prompt":"#d8d0c8","session_border":"#383848","status_bar_bg":"#0a0a14","status_bar_text":"#908878","ui_accent":"#50a0d0","ui_border":"#c0a050","ui_error":"#c05050","ui_ok":"#60b870","ui_text":"#d8d0c8","ui_tool":"#50a0d0","ui_warn":"#c0a050"},"darkName":"stained-glass","description":"Cathedral window — jewel tones of sapphire, ruby, emerald, and amber on dark lead","gatewayDarkName":"theme-picker-stained-glass-dark","gatewayLightName":"theme-picker-stained-glass-light","label":"Stained Glass","lightColors":{"background":"#f7f3ee","banner_accent":"#2a5da8","banner_border":"#d8d0c4","banner_dim":"#6b6b78","banner_text":"#141414","banner_title":"#141414","completion_menu_bg":"#ede9e4","prompt":"#141414","session_border":"#d8d0c4","status_bar_bg":"#ede9e4","status_bar_text":"#141414","ui_accent":"#2a5da8","ui_border":"#d8d0c4","ui_error":"#d36060","ui_ok":"#3fbd6d","ui_text":"#141414","ui_tool":"#1f4a86","ui_warn":"#bc8f1b"},"lightName":"light-stained-glass","modeSupport":"dynamic","name":"stained-glass","source":"user"},{"category":"Dynamic","colors":{"background":"#f2f2f0","banner_accent":"#6e6e68","banner_border":"#d2d2cc","banner_dim":"#5f5f5a","banner_text":"#2c2c2a","banner_title":"#2c2c2a","completion_menu_bg":"#ffffff","prompt":"#2c2c2a","session_border":"#d2d2cc","status_bar_bg":"#e2e2dc","status_bar_text":"#2c2c2a","ui_accent":"#6e6e68","ui_border":"#d2d2cc","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#2c2c2a","ui_tool":"#5e5e58","ui_warn":"#a87a1f"},"darkColors":{"background":"#18181a","banner_accent":"#707078","banner_border":"#4a4a50","banner_dim":"#88888c","banner_text":"#c0c0c8","banner_title":"#a0a0a8","completion_menu_bg":"#18181a","prompt":"#c0c0c8","session_border":"#343438","status_bar_bg":"#0e0e10","status_bar_text":"#808088","ui_accent":"#888890","ui_border":"#4a4a50","ui_error":"#a07070","ui_ok":"#78a078","ui_text":"#c0c0c8","ui_tool":"#7088a0","ui_warn":"#a09860"},"darkName":"steel-thread","description":"Machined metal — cool, precise silver on dark gunmetal with zero warmth","gatewayDarkName":"theme-picker-steel-thread-dark","gatewayLightName":"theme-picker-steel-thread-light","label":"Steel Thread","lightColors":{"background":"#f2f2f0","banner_accent":"#6e6e68","banner_border":"#d2d2cc","banner_dim":"#5f5f5a","banner_text":"#2c2c2a","banner_title":"#2c2c2a","completion_menu_bg":"#ffffff","prompt":"#2c2c2a","session_border":"#d2d2cc","status_bar_bg":"#e2e2dc","status_bar_text":"#2c2c2a","ui_accent":"#6e6e68","ui_border":"#d2d2cc","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#2c2c2a","ui_tool":"#5e5e58","ui_warn":"#a87a1f"},"lightName":"light-ash","modeSupport":"dynamic","name":"steel-thread","source":"user"},{"category":"Dynamic","colors":{"background":"#e7f7f4","banner_accent":"#0b7171","banner_border":"#b8ded8","banner_dim":"#3f6b6b","banner_text":"#123c3c","banner_title":"#123c3c","completion_menu_bg":"#ffffff","prompt":"#123c3c","session_border":"#b8ded8","status_bar_bg":"#d4eeea","status_bar_text":"#123c3c","ui_accent":"#0b7171","ui_border":"#b8ded8","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#123c3c","ui_tool":"#0f5f5f","ui_warn":"#a87a1f"},"darkColors":{"background":"#1a1a28","banner_accent":"#ff6ac1","banner_border":"#ff6ac1","banner_dim":"#9686b6","banner_text":"#d8d8f0","banner_title":"#66d9ef","completion_menu_bg":"#1a1a28","prompt":"#d8d8f0","session_border":"#5a4a7a","status_bar_bg":"#101018","status_bar_text":"#9898b0","ui_accent":"#ff6ac1","ui_border":"#ff6ac1","ui_error":"#f92672","ui_ok":"#a6e22e","ui_text":"#d8d8f0","ui_tool":"#66d9ef","ui_warn":"#e6db74"},"darkName":"vaporwave-mall","description":"Abandoned 90s shopping mall — seafoam, mauve, and chrome on checkerboard dark","gatewayDarkName":"theme-picker-vaporwave-mall-dark","gatewayLightName":"theme-picker-vaporwave-mall-light","label":"Vaporwave Mall","lightColors":{"background":"#e7f7f4","banner_accent":"#0b7171","banner_border":"#b8ded8","banner_dim":"#3f6b6b","banner_text":"#123c3c","banner_title":"#123c3c","completion_menu_bg":"#ffffff","prompt":"#123c3c","session_border":"#b8ded8","status_bar_bg":"#d4eeea","status_bar_text":"#123c3c","ui_accent":"#0b7171","ui_border":"#b8ded8","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#123c3c","ui_tool":"#0f5f5f","ui_warn":"#a87a1f"},"lightName":"light-aqua","modeSupport":"dynamic","name":"vaporwave-mall","source":"user"},{"category":"Dynamic","colors":{"background":"#f0faf6","banner_accent":"#0d7a4e","banner_border":"#cfe8dd","banner_dim":"#3f6b5c","banner_text":"#141414","banner_title":"#141414","completion_menu_bg":"#e6f0ec","prompt":"#141414","session_border":"#cfe8dd","status_bar_bg":"#e6f0ec","status_bar_text":"#141414","ui_accent":"#0d7a4e","ui_border":"#cfe8dd","ui_error":"#d36060","ui_ok":"#3fbd6d","ui_text":"#141414","ui_tool":"#0a5c3c","ui_warn":"#bc8f1b"},"darkColors":{"background":"#081420","banner_accent":"#6dffce","banner_border":"#123044","banner_dim":"#7fa3c9","banner_text":"#e0f7ef","banner_title":"#e0f7ef","completion_menu_bg":"#15222c","prompt":"#e0f7ef","session_border":"#123044","status_bar_bg":"#07121d","status_bar_text":"#e0f7ef","ui_accent":"#6dffce","ui_border":"#123044","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#e0f7ef","ui_tool":"#00e5a0","ui_warn":"#fbbf24"},"darkName":"vibrant-neon","description":"Electric green on deep teal-black","gatewayDarkName":"theme-picker-vibrant-neon-dark","gatewayLightName":"theme-picker-vibrant-neon-light","label":"Vibrant Neon","lightColors":{"background":"#f0faf6","banner_accent":"#0d7a4e","banner_border":"#cfe8dd","banner_dim":"#3f6b5c","banner_text":"#141414","banner_title":"#141414","completion_menu_bg":"#e6f0ec","prompt":"#141414","session_border":"#cfe8dd","status_bar_bg":"#e6f0ec","status_bar_text":"#141414","ui_accent":"#0d7a4e","ui_border":"#cfe8dd","ui_error":"#d36060","ui_ok":"#3fbd6d","ui_text":"#141414","ui_tool":"#0a5c3c","ui_warn":"#bc8f1b"},"lightName":"light-neon","modeSupport":"dynamic","name":"vibrant-neon","source":"user"},{"category":"Dynamic","colors":{"background":"#eef9fd","banner_accent":"#0b6e8f","banner_border":"#c9e4ef","banner_dim":"#40707f","banner_text":"#141414","banner_title":"#141414","completion_menu_bg":"#e4eff3","prompt":"#141414","session_border":"#c9e4ef","status_bar_bg":"#e4eff3","status_bar_text":"#141414","ui_accent":"#0b6e8f","ui_border":"#c9e4ef","ui_error":"#d36060","ui_ok":"#3fbd6d","ui_text":"#141414","ui_tool":"#0a5873","ui_warn":"#bc8f1b"},"darkColors":{"background":"#06202b","banner_accent":"#66e0ff","banner_border":"#0f3a4a","banner_dim":"#7fb4c4","banner_text":"#d9f4ff","banner_title":"#d9f4ff","completion_menu_bg":"#132d38","prompt":"#d9f4ff","session_border":"#0f3a4a","status_bar_bg":"#051d27","status_bar_text":"#d9f4ff","ui_accent":"#66e0ff","ui_border":"#0f3a4a","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#d9f4ff","ui_tool":"#00b4d8","ui_warn":"#fbbf24"},"darkName":"vibrant-pacific","description":"Tropical lagoon cyan on deep sea","gatewayDarkName":"theme-picker-vibrant-pacific-dark","gatewayLightName":"theme-picker-vibrant-pacific-light","label":"Vibrant Pacific","lightColors":{"background":"#eef9fd","banner_accent":"#0b6e8f","banner_border":"#c9e4ef","banner_dim":"#40707f","banner_text":"#141414","banner_title":"#141414","completion_menu_bg":"#e4eff3","prompt":"#141414","session_border":"#c9e4ef","status_bar_bg":"#e4eff3","status_bar_text":"#141414","ui_accent":"#0b6e8f","ui_border":"#c9e4ef","ui_error":"#d36060","ui_ok":"#3fbd6d","ui_text":"#141414","ui_tool":"#0a5873","ui_warn":"#bc8f1b"},"lightName":"light-pacific","modeSupport":"dynamic","name":"vibrant-pacific","source":"user"},{"category":"Dynamic","colors":{"background":"#fdf0f2","banner_accent":"#b04a62","banner_border":"#e6c8cf","banner_dim":"#8a5a68","banner_text":"#46222c","banner_title":"#46222c","completion_menu_bg":"#ffffff","prompt":"#46222c","session_border":"#e6c8cf","status_bar_bg":"#f6e2e7","status_bar_text":"#46222c","ui_accent":"#b04a62","ui_border":"#e6c8cf","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#46222c","ui_tool":"#9a3f55","ui_warn":"#a87a1f"},"darkColors":{"background":"#1e0f1f","banner_accent":"#ffb37d","banner_border":"#43283a","banner_dim":"#c08a8a","banner_text":"#ffe9e0","banner_title":"#ffe9e0","completion_menu_bg":"#2c1c2b","prompt":"#ffe9e0","session_border":"#43283a","status_bar_bg":"#1b0e1c","status_bar_text":"#ffe9e0","ui_accent":"#ffb37d","ui_border":"#43283a","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#ffe9e0","ui_tool":"#ff6b35","ui_warn":"#fbbf24"},"darkName":"vibrant-sunset","description":"Burnt orange and rose dusk","gatewayDarkName":"theme-picker-vibrant-sunset-dark","gatewayLightName":"theme-picker-vibrant-sunset-light","label":"Vibrant Sunset","lightColors":{"background":"#fdf0f2","banner_accent":"#b04a62","banner_border":"#e6c8cf","banner_dim":"#8a5a68","banner_text":"#46222c","banner_title":"#46222c","completion_menu_bg":"#ffffff","prompt":"#46222c","session_border":"#e6c8cf","status_bar_bg":"#f6e2e7","status_bar_text":"#46222c","ui_accent":"#b04a62","ui_border":"#e6c8cf","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#46222c","ui_tool":"#9a3f55","ui_warn":"#a87a1f"},"lightName":"light-blush","modeSupport":"dynamic","name":"vibrant-sunset","source":"user"},{"category":"Dynamic","colors":{"background":"#fdf2f9","banner_accent":"#b23a7d","banner_border":"#e8cadd","banner_dim":"#7d5a72","banner_text":"#141414","banner_title":"#141414","completion_menu_bg":"#f3e8ef","prompt":"#141414","session_border":"#e8cadd","status_bar_bg":"#f3e8ef","status_bar_text":"#141414","ui_accent":"#b23a7d","ui_border":"#e8cadd","ui_error":"#d36060","ui_ok":"#3fbd6d","ui_text":"#141414","ui_tool":"#8f2c63","ui_warn":"#bc8f1b"},"darkColors":{"background":"#1a0b2e","banner_accent":"#ff8ac0","banner_border":"#3c1f5c","banner_dim":"#b78fd4","banner_text":"#f5e9ff","banner_title":"#f5e9ff","completion_menu_bg":"#27183b","prompt":"#f5e9ff","session_border":"#3c1f5c","status_bar_bg":"#170a29","status_bar_text":"#f5e9ff","ui_accent":"#ff8ac0","ui_border":"#3c1f5c","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#f5e9ff","ui_tool":"#ff2e88","ui_warn":"#fbbf24"},"darkName":"vibrant-synthwave","description":"Retro synthwave, hot pink on violet","gatewayDarkName":"theme-picker-vibrant-synthwave-dark","gatewayLightName":"theme-picker-vibrant-synthwave-light","label":"Vibrant Synthwave","lightColors":{"background":"#fdf2f9","banner_accent":"#b23a7d","banner_border":"#e8cadd","banner_dim":"#7d5a72","banner_text":"#141414","banner_title":"#141414","completion_menu_bg":"#f3e8ef","prompt":"#141414","session_border":"#e8cadd","status_bar_bg":"#f3e8ef","status_bar_text":"#141414","ui_accent":"#b23a7d","ui_border":"#e8cadd","ui_error":"#d36060","ui_ok":"#3fbd6d","ui_text":"#141414","ui_tool":"#8f2c63","ui_warn":"#bc8f1b"},"lightName":"light-synthwave","modeSupport":"dynamic","name":"vibrant-synthwave","source":"user"},{"category":"Dynamic","colors":{"background":"#fdf4ee","banner_accent":"#b04f2c","banner_border":"#e6d2c8","banner_dim":"#7d5a5c","banner_text":"#141414","banner_title":"#141414","completion_menu_bg":"#f3eae4","prompt":"#141414","session_border":"#e6d2c8","status_bar_bg":"#f3eae4","status_bar_text":"#141414","ui_accent":"#b04f2c","ui_border":"#e6d2c8","ui_error":"#d36060","ui_ok":"#3fbd6d","ui_text":"#141414","ui_tool":"#8c3d21","ui_warn":"#bc8f1b"},"darkColors":{"background":"#1a1030","banner_accent":"#ff5fd2","banner_border":"#ff5fd2","banner_dim":"#9277b8","banner_text":"#e6d8f0","banner_title":"#ffb870","completion_menu_bg":"#1a1030","prompt":"#e6d8f0","session_border":"#7a5fa0","status_bar_bg":"#0f0820","status_bar_text":"#c8b8d8","ui_accent":"#ff5fd2","ui_border":"#ffb870","ui_error":"#ff5fd2","ui_ok":"#5af7b0","ui_text":"#e6d8f0","ui_tool":"#5af7b0","ui_warn":"#ffb870"},"darkName":"void-sunset","description":"Neon sunset bleeding into a dead channel — violet, tangerine, and seafoam on bruised plum","gatewayDarkName":"theme-picker-void-sunset-dark","gatewayLightName":"theme-picker-void-sunset-light","label":"Void Sunset","lightColors":{"background":"#fdf4ee","banner_accent":"#b04f2c","banner_border":"#e6d2c8","banner_dim":"#7d5a5c","banner_text":"#141414","banner_title":"#141414","completion_menu_bg":"#f3eae4","prompt":"#141414","session_border":"#e6d2c8","status_bar_bg":"#f3eae4","status_bar_text":"#141414","ui_accent":"#b04f2c","ui_border":"#e6d2c8","ui_error":"#d36060","ui_ok":"#3fbd6d","ui_text":"#141414","ui_tool":"#8c3d21","ui_warn":"#bc8f1b"},"lightName":"light-sunset","modeSupport":"dynamic","name":"void-sunset","source":"user"},{"category":"Dynamic","colors":{"background":"#f4f1ea","banner_accent":"#6e6250","banner_border":"#d8d2c2","banner_dim":"#6d675c","banner_text":"#332f28","banner_title":"#332f28","completion_menu_bg":"#ffffff","prompt":"#332f28","session_border":"#d8d2c2","status_bar_bg":"#e6e0d2","status_bar_text":"#332f28","ui_accent":"#6e6250","ui_border":"#d8d2c2","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#332f28","ui_tool":"#5e5544","ui_warn":"#a87a1f"},"darkColors":{"background":"#1e1c18","banner_accent":"#786858","banner_border":"#504840","banner_dim":"#8e8884","banner_text":"#c8c0b8","banner_title":"#b0a898","completion_menu_bg":"#1e1c18","prompt":"#c8c0b8","session_border":"#3a3430","status_bar_bg":"#141210","status_bar_text":"#888070","ui_accent":"#9c8c7c","ui_border":"#504840","ui_error":"#987060","ui_ok":"#809868","ui_text":"#c8c0b8","ui_tool":"#7098a0","ui_warn":"#988850"},"darkName":"warm-ash","description":"Fireplace embers gone cold — a warm gray monochrome with the faintest amber memory","gatewayDarkName":"theme-picker-warm-ash-dark","gatewayLightName":"theme-picker-warm-ash-light","label":"Warm Ash","lightColors":{"background":"#f4f1ea","banner_accent":"#6e6250","banner_border":"#d8d2c2","banner_dim":"#6d675c","banner_text":"#332f28","banner_title":"#332f28","completion_menu_bg":"#ffffff","prompt":"#332f28","session_border":"#d8d2c2","status_bar_bg":"#e6e0d2","status_bar_text":"#332f28","ui_accent":"#6e6250","ui_border":"#d8d2c2","ui_error":"#b23a3a","ui_ok":"#3f7d4e","ui_text":"#332f28","ui_tool":"#5e5544","ui_warn":"#a87a1f"},"lightName":"light-oat","modeSupport":"dynamic","name":"warm-ash","source":"user"},{"category":"Other","colors":{"background":"#fdfdfa","banner_accent":"#3858b0","banner_border":"#909090","banner_dim":"#b0b0b0","banner_text":"#1a1a1a","banner_title":"#1a1a1a","completion_menu_bg":"#fdfdfa","prompt":"#1a1a1a","session_border":"#b0b0b0","shell_dollar":"#3858b0","status_bar_bg":"#f0f0e8","status_bar_text":"#606060","ui_accent":"#3858b0","ui_border":"#909090","ui_error":"#b03838","ui_ok":"#388040","ui_text":"#1a1a1a","ui_tool":"#3858b0","ui_warn":"#b08020"},"darkColors":null,"darkName":null,"description":"Pure white stone — almost-white canvas with charcoal text and a single cobalt thread","isDark":false,"label":"Alabaster","lightColors":{"background":"#fdfdfa","banner_accent":"#3858b0","banner_border":"#909090","banner_dim":"#b0b0b0","banner_text":"#1a1a1a","banner_title":"#1a1a1a","completion_menu_bg":"#fdfdfa","prompt":"#1a1a1a","session_border":"#b0b0b0","shell_dollar":"#3858b0","status_bar_bg":"#f0f0e8","status_bar_text":"#606060","ui_accent":"#3858b0","ui_border":"#909090","ui_error":"#b03838","ui_ok":"#388040","ui_text":"#1a1a1a","ui_tool":"#3858b0","ui_warn":"#b08020"},"lightName":"alabaster","modeSupport":"light","name":"alabaster","source":"user"},{"category":"Other","colors":{"background":"#0c0804","banner_accent":"#c89030","banner_border":"#b08020","banner_dim":"#604818","banner_text":"#e0c088","banner_title":"#e0b040","completion_menu_bg":"#0c0804","prompt":"#e0c088","session_border":"#604818","shell_dollar":"#e0b040","status_bar_bg":"#060402","status_bar_text":"#a08048","ui_accent":"#c89030","ui_border":"#b08020","ui_error":"#e05030","ui_ok":"#c0b040","ui_text":"#e0c088","ui_tool":"#e0b040","ui_warn":"#e0b040"},"darkColors":{"background":"#0c0804","banner_accent":"#c89030","banner_border":"#b08020","banner_dim":"#604818","banner_text":"#e0c088","banner_title":"#e0b040","completion_menu_bg":"#0c0804","prompt":"#e0c088","session_border":"#604818","shell_dollar":"#e0b040","status_bar_bg":"#060402","status_bar_text":"#a08048","ui_accent":"#c89030","ui_border":"#b08020","ui_error":"#e05030","ui_ok":"#c0b040","ui_text":"#e0c088","ui_tool":"#e0b040","ui_warn":"#e0b040"},"darkName":"amber-terminal","description":"Classic CRT phosphor — warm amber text on a deep burnt-black tube with scanline vibes","isDark":true,"label":"Amber Terminal","lightColors":null,"lightName":null,"modeSupport":"dark","name":"amber-terminal","source":"user"},{"category":"Other","colors":{"background":"#161022","banner_accent":"#c0a040","banner_border":"#7a58a8","banner_dim":"#3a2858","banner_text":"#c8c0e0","banner_title":"#70b8f0","completion_menu_bg":"#161022","prompt":"#c8c0e0","session_border":"#3a2858","shell_dollar":"#70b8f0","status_bar_bg":"#0c0816","status_bar_text":"#8878a0","ui_accent":"#c0a040","ui_border":"#7a58a8","ui_error":"#c05060","ui_ok":"#50c080","ui_text":"#c8c0e0","ui_tool":"#70b8f0","ui_warn":"#c0a040"},"darkColors":{"background":"#161022","banner_accent":"#c0a040","banner_border":"#7a58a8","banner_dim":"#3a2858","banner_text":"#c8c0e0","banner_title":"#70b8f0","completion_menu_bg":"#161022","prompt":"#c8c0e0","session_border":"#3a2858","shell_dollar":"#70b8f0","status_bar_bg":"#0c0816","status_bar_text":"#8878a0","ui_accent":"#c0a040","ui_border":"#7a58a8","ui_error":"#c05060","ui_ok":"#50c080","ui_text":"#c8c0e0","ui_tool":"#70b8f0","ui_warn":"#c0a040"},"darkName":"arcane-tome","description":"Wizard's spellbook — deep violet leather, glowing arcane blue, and aged gold foil","isDark":true,"label":"Arcane Tome","lightColors":null,"lightName":null,"modeSupport":"dark","name":"arcane-tome","source":"user"},{"category":"Other","colors":{"background":"#0a1820","banner_accent":"#6090d0","banner_border":"#40b090","banner_dim":"#284860","banner_text":"#c8e8f0","banner_title":"#80e8c0","completion_menu_bg":"#0a1820","prompt":"#c8e8f0","session_border":"#284860","shell_dollar":"#80e8c0","status_bar_bg":"#061014","status_bar_text":"#88b8c8","ui_accent":"#6090d0","ui_border":"#40b090","ui_error":"#e06070","ui_ok":"#60e0a0","ui_text":"#c8e8f0","ui_tool":"#80e8c0","ui_warn":"#e0b040"},"darkColors":{"background":"#0a1820","banner_accent":"#6090d0","banner_border":"#40b090","banner_dim":"#284860","banner_text":"#c8e8f0","banner_title":"#80e8c0","completion_menu_bg":"#0a1820","prompt":"#c8e8f0","session_border":"#284860","shell_dollar":"#80e8c0","status_bar_bg":"#061014","status_bar_text":"#88b8c8","ui_accent":"#6090d0","ui_border":"#40b090","ui_error":"#e06070","ui_ok":"#60e0a0","ui_text":"#c8e8f0","ui_tool":"#80e8c0","ui_warn":"#e0b040"},"darkName":"aurora-boreal","description":"Northern lights over frozen tundra — emerald, violet, and ice blue shimmer on darkest teal","isDark":true,"label":"Aurora Boreal","lightColors":null,"lightName":null,"modeSupport":"dark","name":"aurora-boreal","source":"user"},{"category":"Other","colors":{"background":"#181c24","banner_accent":"#80a0c0","banner_border":"#6888a8","banner_dim":"#384858","banner_text":"#d0dce8","banner_title":"#a0c0e0","completion_menu_bg":"#181c24","prompt":"#d0dce8","session_border":"#384858","shell_dollar":"#a0c0e0","status_bar_bg":"#0e1218","status_bar_text":"#8898a8","ui_accent":"#80a0c0","ui_border":"#6888a8","ui_error":"#c88888","ui_ok":"#88c098","ui_text":"#d0dce8","ui_tool":"#a0c0e0","ui_warn":"#c8b060"},"darkColors":{"background":"#181c24","banner_accent":"#80a0c0","banner_border":"#6888a8","banner_dim":"#384858","banner_text":"#d0dce8","banner_title":"#a0c0e0","completion_menu_bg":"#181c24","prompt":"#d0dce8","session_border":"#384858","shell_dollar":"#a0c0e0","status_bar_bg":"#0e1218","status_bar_text":"#8898a8","ui_accent":"#80a0c0","ui_border":"#6888a8","ui_error":"#c88888","ui_ok":"#88c098","ui_text":"#d0dce8","ui_tool":"#a0c0e0","ui_warn":"#c8b060"},"darkName":"baby-blue","description":"Calm nursery tones — powder blue, soft cream, and gentle coral on muted navy, soothing","isDark":true,"label":"Baby Blue","lightColors":null,"lightName":null,"modeSupport":"dark","name":"baby-blue","source":"user"},{"category":"Other","colors":{"background":"#101010","banner_accent":"#ffd700","banner_border":"#ffd700","banner_dim":"#606060","banner_text":"#f0f0f0","banner_title":"#ffffff","completion_menu_bg":"#101010","prompt":"#f0f0f0","session_border":"#606060","shell_dollar":"#40b0ff","status_bar_bg":"#080808","status_bar_text":"#b0b0b0","ui_accent":"#ffd700","ui_border":"#ffd700","ui_error":"#ff3030","ui_ok":"#00e070","ui_text":"#f0f0f0","ui_tool":"#40b0ff","ui_warn":"#ffd700"},"darkColors":{"background":"#101010","banner_accent":"#ffd700","banner_border":"#ffd700","banner_dim":"#606060","banner_text":"#f0f0f0","banner_title":"#ffffff","completion_menu_bg":"#101010","prompt":"#f0f0f0","session_border":"#606060","shell_dollar":"#40b0ff","status_bar_bg":"#080808","status_bar_text":"#b0b0b0","ui_accent":"#ffd700","ui_border":"#ffd700","ui_error":"#ff3030","ui_ok":"#00e070","ui_text":"#f0f0f0","ui_tool":"#40b0ff","ui_warn":"#ffd700"},"darkName":"black-canary","description":"Aviation cockpit — bright yellow on matte black with crisp white signals, zero ambiguity","isDark":true,"label":"Black Canary","lightColors":null,"lightName":null,"modeSupport":"dark","name":"black-canary","source":"user"},{"category":"Other","colors":{"background":"#d8e4f0","banner_accent":"#2858a0","banner_border":"#3a6090","banner_dim":"#8098b8","banner_text":"#102848","banner_title":"#102848","completion_menu_bg":"#d8e4f0","prompt":"#102848","session_border":"#8098b8","shell_dollar":"#2858a0","status_bar_bg":"#c8d8e8","status_bar_text":"#405870","ui_accent":"#2858a0","ui_border":"#3a6090","ui_error":"#902820","ui_ok":"#307050","ui_text":"#102848","ui_tool":"#2858a0","ui_warn":"#906020"},"darkColors":null,"darkName":null,"description":"Architectural cyanotype — white lines on Prussian blue, crisp and technical","isDark":false,"label":"Blueprint","lightColors":{"background":"#d8e4f0","banner_accent":"#2858a0","banner_border":"#3a6090","banner_dim":"#8098b8","banner_text":"#102848","banner_title":"#102848","completion_menu_bg":"#d8e4f0","prompt":"#102848","session_border":"#8098b8","shell_dollar":"#2858a0","status_bar_bg":"#c8d8e8","status_bar_text":"#405870","ui_accent":"#2858a0","ui_border":"#3a6090","ui_error":"#902820","ui_ok":"#307050","ui_text":"#102848","ui_tool":"#2858a0","ui_warn":"#906020"},"lightName":"blueprint","modeSupport":"light","name":"blueprint","source":"user"},{"category":"Other","colors":{"background":"#1a1a1a","banner_accent":"#608088","banner_border":"#444a50","banner_dim":"#383838","banner_text":"#d8d8d8","banner_title":"#c8d0d8","completion_menu_bg":"#1a1a1a","prompt":"#d8d8d8","session_border":"#383838","shell_dollar":"#608088","status_bar_bg":"#101010","status_bar_text":"#909090","ui_accent":"#608088","ui_border":"#444a50","ui_error":"#987878","ui_ok":"#789880","ui_text":"#d8d8d8","ui_tool":"#608088","ui_warn":"#989078"},"darkColors":{"background":"#1a1a1a","banner_accent":"#608088","banner_border":"#444a50","banner_dim":"#383838","banner_text":"#d8d8d8","banner_title":"#c8d0d8","completion_menu_bg":"#1a1a1a","prompt":"#d8d8d8","session_border":"#383838","shell_dollar":"#608088","status_bar_bg":"#101010","status_bar_text":"#909090","ui_accent":"#608088","ui_border":"#444a50","ui_error":"#987878","ui_ok":"#789880","ui_text":"#d8d8d8","ui_tool":"#608088","ui_warn":"#989078"},"darkName":"bone-white","description":"Pure minimalism — off-white text on soft black, with one muted teal accent","isDark":true,"label":"Bone White","lightColors":null,"lightName":null,"modeSupport":"dark","name":"bone-white","source":"user"},{"category":"Other","colors":{"background":"#202020","banner_accent":"#ff5500","banner_border":"#505050","banner_dim":"#383838","banner_text":"#c0c0c0","banner_title":"#a0a0a0","completion_menu_bg":"#202020","prompt":"#c0c0c0","session_border":"#383838","shell_dollar":"#ff5500","status_bar_bg":"#141414","status_bar_text":"#787878","ui_accent":"#ff5500","ui_border":"#505050","ui_error":"#e04030","ui_ok":"#60a060","ui_text":"#c0c0c0","ui_tool":"#ff5500","ui_warn":"#ff8800"},"darkColors":{"background":"#202020","banner_accent":"#ff5500","banner_border":"#505050","banner_dim":"#383838","banner_text":"#c0c0c0","banner_title":"#a0a0a0","completion_menu_bg":"#202020","prompt":"#c0c0c0","session_border":"#383838","shell_dollar":"#ff5500","status_bar_bg":"#141414","status_bar_text":"#787878","ui_accent":"#ff5500","ui_border":"#505050","ui_error":"#e04030","ui_ok":"#60a060","ui_text":"#c0c0c0","ui_tool":"#ff5500","ui_warn":"#ff8800"},"darkName":"brutalist-concrete","description":"Raw architectural concrete — unflinching gray on gray with one fluorescent orange signal","isDark":true,"label":"Brutalist Concrete","lightColors":null,"lightName":null,"modeSupport":"dark","name":"brutalist-concrete","source":"user"},{"category":"Other","colors":{"background":"#120c2e","banner_accent":"#e6398c","banner_border":"#e6398c","banner_dim":"#6b5fa0","banner_text":"#e8def8","banner_title":"#4dc9f6","completion_menu_bg":"#120c2e","prompt":"#e8def8","session_border":"#6b5fa0","shell_dollar":"#4dc9f6","status_bar_bg":"#0a081c","status_bar_text":"#c8c0d8","ui_accent":"#e6398c","ui_border":"#4dc9f6","ui_error":"#e74c3c","ui_ok":"#2ecc71","ui_text":"#e8def8","ui_tool":"#4dc9f6","ui_warn":"#f4d03f"},"darkColors":{"background":"#120c2e","banner_accent":"#e6398c","banner_border":"#e6398c","banner_dim":"#6b5fa0","banner_text":"#e8def8","banner_title":"#4dc9f6","completion_menu_bg":"#120c2e","prompt":"#e8def8","session_border":"#6b5fa0","shell_dollar":"#4dc9f6","status_bar_bg":"#0a081c","status_bar_text":"#c8c0d8","ui_accent":"#e6398c","ui_border":"#4dc9f6","ui_error":"#e74c3c","ui_ok":"#2ecc71","ui_text":"#e8def8","ui_tool":"#4dc9f6","ui_warn":"#f4d03f"},"darkName":"chrome-rain","description":"Wet chrome streets at midnight — electric blue, hot pink, and acid yellow on deep indigo","isDark":true,"label":"Chrome Rain","lightColors":null,"lightName":null,"modeSupport":"dark","name":"chrome-rain","source":"user"},{"category":"Other","colors":{"background":"#202840","banner_accent":"#9070d0","banner_border":"#8068c0","banner_dim":"#483868","banner_text":"#c8c8e8","banner_title":"#a088e0","completion_menu_bg":"#202840","prompt":"#c8c8e8","session_border":"#483868","shell_dollar":"#a088e0","status_bar_bg":"#141828","status_bar_text":"#8888a8","ui_accent":"#9070d0","ui_border":"#8068c0","ui_error":"#d06060","ui_ok":"#70d070","ui_text":"#c8c8e8","ui_tool":"#a088e0","ui_warn":"#d0c050"},"darkColors":{"background":"#202840","banner_accent":"#9070d0","banner_border":"#8068c0","banner_dim":"#483868","banner_text":"#c8c8e8","banner_title":"#a088e0","completion_menu_bg":"#202840","prompt":"#c8c8e8","session_border":"#483868","shell_dollar":"#a088e0","status_bar_bg":"#141828","status_bar_text":"#8888a8","ui_accent":"#9070d0","ui_border":"#8068c0","ui_error":"#d06060","ui_ok":"#70d070","ui_text":"#c8c8e8","ui_tool":"#a088e0","ui_warn":"#d0c050"},"darkName":"commodore-64","description":"1980s home computer — that specific washed-out blue background with purple-magenta titles","isDark":true,"label":"Commodore 64","lightColors":null,"lightName":null,"modeSupport":"dark","name":"commodore-64","source":"user"},{"category":"Other","colors":{"background":"#0a1a20","banner_accent":"#3098a8","banner_border":"#206880","banner_dim":"#1a4858","banner_text":"#c0e8e8","banner_title":"#50c8d0","completion_menu_bg":"#0a1a20","prompt":"#c0e8e8","session_border":"#1a4858","shell_dollar":"#50c8d0","status_bar_bg":"#061014","status_bar_text":"#80b0b0","ui_accent":"#3098a8","ui_border":"#206880","ui_error":"#d05060","ui_ok":"#50d0a0","ui_text":"#c0e8e8","ui_tool":"#50c8d0","ui_warn":"#d0a840"},"darkColors":{"background":"#0a1a20","banner_accent":"#3098a8","banner_border":"#206880","banner_dim":"#1a4858","banner_text":"#c0e8e8","banner_title":"#50c8d0","completion_menu_bg":"#0a1a20","prompt":"#c0e8e8","session_border":"#1a4858","shell_dollar":"#50c8d0","status_bar_bg":"#061014","status_bar_text":"#80b0b0","ui_accent":"#3098a8","ui_border":"#206880","ui_error":"#d05060","ui_ok":"#50d0a0","ui_text":"#c0e8e8","ui_tool":"#50c8d0","ui_warn":"#d0a840"},"darkName":"deep-ocean","description":"Abyssal trench — darkest teal, bioluminescent blue-green, and pale sea-foam highlights","isDark":true,"label":"Deep Ocean","lightColors":null,"lightName":null,"modeSupport":"dark","name":"deep-ocean","source":"user"},{"category":"Other","colors":{"background":"#000000","banner_accent":"#7060a0","banner_border":"#3a3050","banner_dim":"#2a2040","banner_text":"#b0a0c0","banner_title":"#9080c0","completion_menu_bg":"#050508","prompt":"#b0a0c0","session_border":"#2a2040","shell_dollar":"#6070a0","status_bar_bg":"#000000","status_bar_text":"#807090","ui_accent":"#7060a0","ui_border":"#3a3050","ui_error":"#904040","ui_ok":"#508050","ui_text":"#b0a0c0","ui_tool":"#6070a0","ui_warn":"#908050"},"darkColors":{"background":"#000000","banner_accent":"#7060a0","banner_border":"#3a3050","banner_dim":"#2a2040","banner_text":"#b0a0c0","banner_title":"#9080c0","completion_menu_bg":"#050508","prompt":"#b0a0c0","session_border":"#2a2040","shell_dollar":"#6070a0","status_bar_bg":"#000000","status_bar_text":"#807090","ui_accent":"#7060a0","ui_border":"#3a3050","ui_error":"#904040","ui_ok":"#508050","ui_text":"#b0a0c0","ui_tool":"#6070a0","ui_warn":"#908050"},"darkName":"deep-void","description":"True AMOLED black with barely-there violet undertones — the darkest readable theme possible","isDark":true,"label":"Deep Void","lightColors":null,"lightName":null,"modeSupport":"dark","name":"deep-void","source":"user"},{"category":"Other","colors":{"background":"#14100c","banner_accent":"#ffb800","banner_border":"#ff4088","banner_dim":"#443020","banner_text":"#e8d8c8","banner_title":"#00e8e8","completion_menu_bg":"#14100c","prompt":"#e8d8c8","session_border":"#443020","shell_dollar":"#00e8e8","status_bar_bg":"#0a0804","status_bar_text":"#a89080","ui_accent":"#ffb800","ui_border":"#ff4088","ui_error":"#ff4088","ui_ok":"#40e880","ui_text":"#e8d8c8","ui_tool":"#00e8e8","ui_warn":"#ffb800"},"darkColors":{"background":"#14100c","banner_accent":"#ffb800","banner_border":"#ff4088","banner_dim":"#443020","banner_text":"#e8d8c8","banner_title":"#00e8e8","completion_menu_bg":"#14100c","prompt":"#e8d8c8","session_border":"#443020","shell_dollar":"#00e8e8","status_bar_bg":"#0a0804","status_bar_text":"#a89080","ui_accent":"#ffb800","ui_border":"#ff4088","ui_error":"#ff4088","ui_ok":"#40e880","ui_text":"#e8d8c8","ui_tool":"#00e8e8","ui_warn":"#ffb800"},"darkName":"desert-neon","description":"Vegas motel sign at 3am — hot turquoise, flamingo pink, and desert gold on baked black","isDark":true,"label":"Desert Neon","lightColors":null,"lightName":null,"modeSupport":"dark","name":"desert-neon","source":"user"},{"category":"Other","colors":{"background":"#141010","banner_accent":"#d04040","banner_border":"#b83030","banner_dim":"#582828","banner_text":"#e0d0c0","banner_title":"#f0c840","completion_menu_bg":"#141010","prompt":"#e0d0c0","session_border":"#582828","shell_dollar":"#f0c840","status_bar_bg":"#0a0808","status_bar_text":"#a08070","ui_accent":"#d04040","ui_border":"#b83030","ui_error":"#e03030","ui_ok":"#50a050","ui_text":"#e0d0c0","ui_tool":"#f0c840","ui_warn":"#f0c840"},"darkColors":{"background":"#141010","banner_accent":"#d04040","banner_border":"#b83030","banner_dim":"#582828","banner_text":"#e0d0c0","banner_title":"#f0c840","completion_menu_bg":"#141010","prompt":"#e0d0c0","session_border":"#582828","shell_dollar":"#f0c840","status_bar_bg":"#0a0808","status_bar_text":"#a08070","ui_accent":"#d04040","ui_border":"#b83030","ui_error":"#e03030","ui_ok":"#50a050","ui_text":"#e0d0c0","ui_tool":"#f0c840","ui_warn":"#f0c840"},"darkName":"dragon-blood","description":"Ancient wyrm — dark crimson, molten gold, and charcoal black, forged in fire","isDark":true,"label":"Dragon Blood","lightColors":null,"lightName":null,"modeSupport":"dark","name":"dragon-blood","source":"user"},{"category":"Other","colors":{"background":"#1c181a","banner_accent":"#b88898","banner_border":"#a87088","banner_dim":"#483840","banner_text":"#d8d0d4","banner_title":"#d0a0b8","completion_menu_bg":"#1c181a","prompt":"#d8d0d4","session_border":"#483840","shell_dollar":"#88a0b8","status_bar_bg":"#120e10","status_bar_text":"#988890","ui_accent":"#b88898","ui_border":"#a87088","ui_error":"#c87070","ui_ok":"#88b898","ui_text":"#d8d0d4","ui_tool":"#88a0b8","ui_warn":"#c8a870"},"darkColors":{"background":"#1c181a","banner_accent":"#b88898","banner_border":"#a87088","banner_dim":"#483840","banner_text":"#d8d0d4","banner_title":"#d0a0b8","completion_menu_bg":"#1c181a","prompt":"#d8d0d4","session_border":"#483840","shell_dollar":"#88a0b8","status_bar_bg":"#120e10","status_bar_text":"#988890","ui_accent":"#b88898","ui_border":"#a87088","ui_error":"#c87070","ui_ok":"#88b898","ui_text":"#d8d0d4","ui_tool":"#88a0b8","ui_warn":"#c8a870"},"darkName":"dusty-rose","description":"Antique velvet — muted rose, dusty mauve, and faded sage on warm charcoal","isDark":true,"label":"Dusty Rose","lightColors":null,"lightName":null,"modeSupport":"dark","name":"dusty-rose","source":"user"},{"category":"Other","colors":{"background":"#18181a","banner_accent":"#9a88c0","banner_border":"#6a5a8a","banner_dim":"#3a3050","banner_text":"#d0d0d8","banner_title":"#c8b8e8","completion_menu_bg":"#18181a","prompt":"#d0d0d8","session_border":"#3a3050","shell_dollar":"#7890b8","status_bar_bg":"#101012","status_bar_text":"#9898a0","ui_accent":"#9a88c0","ui_border":"#6a5a8a","ui_error":"#b86868","ui_ok":"#78a878","ui_text":"#d0d0d8","ui_tool":"#7890b8","ui_warn":"#c8a870"},"darkColors":{"background":"#18181a","banner_accent":"#9a88c0","banner_border":"#6a5a8a","banner_dim":"#3a3050","banner_text":"#d0d0d8","banner_title":"#c8b8e8","completion_menu_bg":"#18181a","prompt":"#d0d0d8","session_border":"#3a3050","shell_dollar":"#7890b8","status_bar_bg":"#101012","status_bar_text":"#9898a0","ui_accent":"#9a88c0","ui_border":"#6a5a8a","ui_error":"#b86868","ui_ok":"#78a878","ui_text":"#d0d0d8","ui_tool":"#7890b8","ui_warn":"#c8a870"},"darkName":"eclipse","description":"Total solar eclipse — charcoal field with a corona ring of soft lilac and electric white","isDark":true,"label":"Eclipse","lightColors":null,"lightName":null,"modeSupport":"dark","name":"eclipse","source":"user"},{"category":"Other","colors":{"background":"#0e1814","banner_accent":"#c8b040","banner_border":"#388060","banner_dim":"#284838","banner_text":"#c0e0d0","banner_title":"#60d8a0","completion_menu_bg":"#0e1814","prompt":"#c0e0d0","session_border":"#284838","shell_dollar":"#60d8a0","status_bar_bg":"#08100c","status_bar_text":"#80a090","ui_accent":"#c8b040","ui_border":"#388060","ui_error":"#d06060","ui_ok":"#60d8a0","ui_text":"#c0e0d0","ui_tool":"#60d8a0","ui_warn":"#c8b040"},"darkColors":{"background":"#0e1814","banner_accent":"#c8b040","banner_border":"#388060","banner_dim":"#284838","banner_text":"#c0e0d0","banner_title":"#60d8a0","completion_menu_bg":"#0e1814","prompt":"#c0e0d0","session_border":"#284838","shell_dollar":"#60d8a0","status_bar_bg":"#08100c","status_bar_text":"#80a090","ui_accent":"#c8b040","ui_border":"#388060","ui_error":"#d06060","ui_ok":"#60d8a0","ui_text":"#c0e0d0","ui_tool":"#60d8a0","ui_warn":"#c8b040"},"darkName":"enchanted-forest","description":"Feywild glade — deep viridian, bioluminescent teal, pale gold motes on woodland shadow","isDark":true,"label":"Enchanted Forest","lightColors":null,"lightName":null,"modeSupport":"dark","name":"enchanted-forest","source":"user"},{"category":"Other","colors":{"background":"#141210","banner_accent":"#6888a8","banner_border":"#c86030","banner_dim":"#483020","banner_text":"#d0c8b8","banner_title":"#f0a050","completion_menu_bg":"#141210","prompt":"#d0c8b8","session_border":"#483020","shell_dollar":"#6888a8","status_bar_bg":"#0a0808","status_bar_text":"#908870","ui_accent":"#6888a8","ui_border":"#c86030","ui_error":"#d04030","ui_ok":"#60a860","ui_text":"#d0c8b8","ui_tool":"#6888a8","ui_warn":"#f0a050"},"darkColors":{"background":"#141210","banner_accent":"#6888a8","banner_border":"#c86030","banner_dim":"#483020","banner_text":"#d0c8b8","banner_title":"#f0a050","completion_menu_bg":"#141210","prompt":"#d0c8b8","session_border":"#483020","shell_dollar":"#6888a8","status_bar_bg":"#0a0808","status_bar_text":"#908870","ui_accent":"#6888a8","ui_border":"#c86030","ui_error":"#d04030","ui_ok":"#60a860","ui_text":"#d0c8b8","ui_tool":"#6888a8","ui_warn":"#f0a050"},"darkName":"forge-master","description":"Dwarven smithy — hot ember orange, cooling steel blue, and soot black, hammer on anvil","isDark":true,"label":"Forge Master","lightColors":null,"lightName":null,"modeSupport":"dark","name":"forge-master","source":"user"},{"category":"Other","colors":{"background":"#0d0d0d","banner_accent":"#ff003c","banner_border":"#39ff14","banner_dim":"#3a7a30","banner_text":"#c0ffc0","banner_title":"#39ff14","completion_menu_bg":"#0d0d0d","prompt":"#c0ffc0","session_border":"#3a7a30","shell_dollar":"#39ff14","status_bar_bg":"#050505","status_bar_text":"#a0d0a0","ui_accent":"#ff003c","ui_border":"#39ff14","ui_error":"#ff003c","ui_ok":"#39ff14","ui_text":"#c0ffc0","ui_tool":"#39ff14","ui_warn":"#ff8800"},"darkColors":{"background":"#0d0d0d","banner_accent":"#ff003c","banner_border":"#39ff14","banner_dim":"#3a7a30","banner_text":"#c0ffc0","banner_title":"#39ff14","completion_menu_bg":"#0d0d0d","prompt":"#c0ffc0","session_border":"#3a7a30","shell_dollar":"#39ff14","status_bar_bg":"#050505","status_bar_text":"#a0d0a0","ui_accent":"#ff003c","ui_border":"#39ff14","ui_error":"#ff003c","ui_ok":"#39ff14","ui_text":"#c0ffc0","ui_tool":"#39ff14","ui_warn":"#ff8800"},"darkName":"glitch-punk","description":"Broken signal aesthetic — toxic green on corrupted black with flickering red accents","isDark":true,"label":"Glitch Punk","lightColors":null,"lightName":null,"modeSupport":"dark","name":"glitch-punk","source":"user"},{"category":"Other","colors":{"background":"#1e1e1e","banner_accent":"#608080","banner_border":"#4a4a4a","banner_dim":"#3a3a3a","banner_text":"#c8c8c8","banner_title":"#809090","completion_menu_bg":"#1e1e1e","prompt":"#c8c8c8","session_border":"#3a3a3a","shell_dollar":"#607888","status_bar_bg":"#141414","status_bar_text":"#909090","ui_accent":"#608080","ui_border":"#4a4a4a","ui_error":"#886060","ui_ok":"#608860","ui_text":"#c8c8c8","ui_tool":"#607888","ui_warn":"#888060"},"darkColors":{"background":"#1e1e1e","banner_accent":"#608080","banner_border":"#4a4a4a","banner_dim":"#3a3a3a","banner_text":"#c8c8c8","banner_title":"#809090","completion_menu_bg":"#1e1e1e","prompt":"#c8c8c8","session_border":"#3a3a3a","shell_dollar":"#607888","status_bar_bg":"#141414","status_bar_text":"#909090","ui_accent":"#608080","ui_border":"#4a4a4a","ui_error":"#886060","ui_ok":"#608860","ui_text":"#c8c8c8","ui_tool":"#607888","ui_warn":"#888060"},"darkName":"graphite","description":"Dark pencil-lead tones — warm graphite grays with subtle blue-green accent, no harsh contrast","isDark":true,"label":"Graphite","lightColors":null,"lightName":null,"modeSupport":"dark","name":"graphite","source":"user"},{"category":"Other","colors":{"background":"#0a0e08","banner_accent":"#40b840","banner_border":"#308830","banner_dim":"#1a5018","banner_text":"#b0e8b0","banner_title":"#50e050","completion_menu_bg":"#0a0e08","prompt":"#b0e8b0","session_border":"#1a5018","shell_dollar":"#50e050","status_bar_bg":"#050804","status_bar_text":"#70a070","ui_accent":"#40b840","ui_border":"#308830","ui_error":"#e05050","ui_ok":"#50e050","ui_text":"#b0e8b0","ui_tool":"#50e050","ui_warn":"#e0e050"},"darkColors":{"background":"#0a0e08","banner_accent":"#40b840","banner_border":"#308830","banner_dim":"#1a5018","banner_text":"#b0e8b0","banner_title":"#50e050","completion_menu_bg":"#0a0e08","prompt":"#b0e8b0","session_border":"#1a5018","shell_dollar":"#50e050","status_bar_bg":"#050804","status_bar_text":"#70a070","ui_accent":"#40b840","ui_border":"#308830","ui_error":"#e05050","ui_ok":"#50e050","ui_text":"#b0e8b0","ui_tool":"#50e050","ui_warn":"#e0e050"},"darkName":"green-screen","description":"Vintage IBM monochrome — phosphor green on dark tube glass, with a slight glow bloom","isDark":true,"label":"Green Screen","lightColors":null,"lightName":null,"modeSupport":"dark","name":"green-screen","source":"user"},{"category":"Other","colors":{"background":"#f5f5f0","banner_accent":"#3366aa","banner_border":"#335588","banner_dim":"#8898a8","banner_text":"#1a2a44","banner_title":"#1a2a44","completion_menu_bg":"#f5f5f0","prompt":"#1a2a44","session_border":"#8898a8","shell_dollar":"#3366aa","status_bar_bg":"#e8e8e0","status_bar_text":"#445566","ui_accent":"#3366aa","ui_border":"#335588","ui_error":"#aa2222","ui_ok":"#227744","ui_text":"#1a2a44","ui_tool":"#3366aa","ui_warn":"#aa6622"},"darkColors":null,"darkName":null,"description":"Bright terminal for daylight — dark navy text on soft white, readable in direct sun","isDark":false,"label":"High Noon","lightColors":{"background":"#f5f5f0","banner_accent":"#3366aa","banner_border":"#335588","banner_dim":"#8898a8","banner_text":"#1a2a44","banner_title":"#1a2a44","completion_menu_bg":"#f5f5f0","prompt":"#1a2a44","session_border":"#8898a8","shell_dollar":"#3366aa","status_bar_bg":"#e8e8e0","status_bar_text":"#445566","ui_accent":"#3366aa","ui_border":"#335588","ui_error":"#aa2222","ui_ok":"#227744","ui_text":"#1a2a44","ui_tool":"#3366aa","ui_warn":"#aa6622"},"lightName":"high-noon","modeSupport":"light","name":"high-noon","source":"user"},{"category":"Other","colors":{"background":"#1e1a2a","banner_accent":"#a088c8","banner_border":"#8870a8","banner_dim":"#483858","banner_text":"#d8d0e8","banner_title":"#c0a8e0","completion_menu_bg":"#1e1a2a","prompt":"#d8d0e8","session_border":"#483858","shell_dollar":"#88b8d0","status_bar_bg":"#141020","status_bar_text":"#9888a8","ui_accent":"#a088c8","ui_border":"#8870a8","ui_error":"#c87078","ui_ok":"#88c898","ui_text":"#d8d0e8","ui_tool":"#88b8d0","ui_warn":"#c8a878"},"darkColors":{"background":"#1e1a2a","banner_accent":"#a088c8","banner_border":"#8870a8","banner_dim":"#483858","banner_text":"#d8d0e8","banner_title":"#c0a8e0","completion_menu_bg":"#1e1a2a","prompt":"#d8d0e8","session_border":"#483858","shell_dollar":"#88b8d0","status_bar_bg":"#141020","status_bar_text":"#9888a8","ui_accent":"#a088c8","ui_border":"#8870a8","ui_error":"#c87078","ui_ok":"#88c898","ui_text":"#d8d0e8","ui_tool":"#88b8d0","ui_warn":"#c8a878"},"darkName":"lavender-dream","description":"Soft purple twilight — gentle lavender, blush pink, and mint on deep plum, no eye strain","isDark":true,"label":"Lavender Dream","lightColors":null,"lightName":null,"modeSupport":"dark","name":"lavender-dream","source":"user"},{"category":"Other","colors":{"background":"#f4f0e8","banner_accent":"#687858","banner_border":"#889878","banner_dim":"#a8b098","banner_text":"#384830","banner_title":"#384830","completion_menu_bg":"#f4f0e8","prompt":"#384830","session_border":"#a8b098","shell_dollar":"#587088","status_bar_bg":"#e8e4d8","status_bar_text":"#585848","ui_accent":"#687858","ui_border":"#889878","ui_error":"#905048","ui_ok":"#588050","ui_text":"#384830","ui_tool":"#587088","ui_warn":"#907048"},"darkColors":null,"darkName":null,"description":"Linen fabric — natural flax background with muted sage green and soft clay accents","isDark":false,"label":"Linen Sage","lightColors":{"background":"#f4f0e8","banner_accent":"#687858","banner_border":"#889878","banner_dim":"#a8b098","banner_text":"#384830","banner_title":"#384830","completion_menu_bg":"#f4f0e8","prompt":"#384830","session_border":"#a8b098","shell_dollar":"#587088","status_bar_bg":"#e8e4d8","status_bar_text":"#585848","ui_accent":"#687858","ui_border":"#889878","ui_error":"#905048","ui_ok":"#588050","ui_text":"#384830","ui_tool":"#587088","ui_warn":"#907048"},"lightName":"linen-sage","modeSupport":"light","name":"linen-sage","source":"user"},{"category":"Other","colors":{"background":"#121216","banner_accent":"#9090a8","banner_border":"#707080","banner_dim":"#383840","banner_text":"#d0d0d8","banner_title":"#c0c0d0","completion_menu_bg":"#121216","prompt":"#d0d0d8","session_border":"#383840","shell_dollar":"#78a0c0","status_bar_bg":"#08080c","status_bar_text":"#888898","ui_accent":"#9090a8","ui_border":"#707080","ui_error":"#b07080","ui_ok":"#78b090","ui_text":"#d0d0d8","ui_tool":"#78a0c0","ui_warn":"#b0a070"},"darkColors":{"background":"#121216","banner_accent":"#9090a8","banner_border":"#707080","banner_dim":"#383840","banner_text":"#d0d0d8","banner_title":"#c0c0d0","completion_menu_bg":"#121216","prompt":"#d0d0d8","session_border":"#383840","shell_dollar":"#78a0c0","status_bar_bg":"#08080c","status_bar_text":"#888898","ui_accent":"#9090a8","ui_border":"#707080","ui_error":"#b07080","ui_ok":"#78b090","ui_text":"#d0d0d8","ui_tool":"#78a0c0","ui_warn":"#b0a070"},"darkName":"liquid-silver","description":"Mercury runoff — reflective silver, liquid chrome gradients, and deep void black accents","isDark":true,"label":"Liquid Silver","lightColors":null,"lightName":null,"modeSupport":"dark","name":"liquid-silver","source":"user"},{"category":"Other","colors":{"background":"#1a1a2e","banner_accent":"#c8a050","banner_border":"#c8a050","banner_dim":"#504868","banner_text":"#d8d0c8","banner_title":"#e8d080","completion_menu_bg":"#1a1a2e","prompt":"#d8d0c8","session_border":"#504868","shell_dollar":"#7088b0","status_bar_bg":"#121224","status_bar_text":"#a09888","ui_accent":"#c8a050","ui_border":"#504868","ui_error":"#b05850","ui_ok":"#80a870","ui_text":"#d8d0c8","ui_tool":"#7088b0","ui_warn":"#d8a040"},"darkColors":{"background":"#1a1a2e","banner_accent":"#c8a050","banner_border":"#c8a050","banner_dim":"#504868","banner_text":"#d8d0c8","banner_title":"#e8d080","completion_menu_bg":"#1a1a2e","prompt":"#d8d0c8","session_border":"#504868","shell_dollar":"#7088b0","status_bar_bg":"#121224","status_bar_text":"#a09888","ui_accent":"#c8a050","ui_border":"#504868","ui_error":"#b05850","ui_ok":"#80a870","ui_text":"#d8d0c8","ui_tool":"#7088b0","ui_warn":"#d8a040"},"darkName":"midnight-studio","description":"Late-night coding den — dark indigo, warm gold accents, and soft amber glow","isDark":true,"label":"Midnight Studio","lightColors":null,"lightName":null,"modeSupport":"dark","name":"midnight-studio","source":"user"},{"category":"Other","colors":{"background":"#1c2018","banner_accent":"#788860","banner_border":"#6a7a5a","banner_dim":"#3a4430","banner_text":"#c8d0b8","banner_title":"#90a878","completion_menu_bg":"#1c2018","prompt":"#c8d0b8","session_border":"#3a4430","shell_dollar":"#7098a0","status_bar_bg":"#121610","status_bar_text":"#909880","ui_accent":"#788860","ui_border":"#6a7a5a","ui_error":"#b87060","ui_ok":"#80b870","ui_text":"#c8d0b8","ui_tool":"#7098a0","ui_warn":"#c0a860"},"darkColors":{"background":"#1c2018","banner_accent":"#788860","banner_border":"#6a7a5a","banner_dim":"#3a4430","banner_text":"#c8d0b8","banner_title":"#90a878","completion_menu_bg":"#1c2018","prompt":"#c8d0b8","session_border":"#3a4430","shell_dollar":"#7098a0","status_bar_bg":"#121610","status_bar_text":"#909880","ui_accent":"#788860","ui_border":"#6a7a5a","ui_error":"#b87060","ui_ok":"#80b870","ui_text":"#c8d0b8","ui_tool":"#7098a0","ui_warn":"#c0a860"},"darkName":"moss-stone","description":"Cool forest stone — gray-green granite, soft olive, and earthy brown warmth","isDark":true,"label":"Moss Stone","lightColors":null,"lightName":null,"modeSupport":"dark","name":"moss-stone","source":"user"},{"category":"Other","colors":{"background":"#0a0a0f","banner_accent":"#ff00ff","banner_border":"#ff00ff","banner_dim":"#7d3c98","banner_text":"#e0e0ff","banner_title":"#00ffff","completion_menu_bg":"#0a0a0f","prompt":"#e0e0ff","session_border":"#7d3c98","shell_dollar":"#00ffff","status_bar_bg":"#05050a","status_bar_text":"#c0c0d0","ui_accent":"#ff00ff","ui_border":"#ff00ff","ui_error":"#ff3366","ui_ok":"#00ff88","ui_text":"#e0e0ff","ui_tool":"#00ffff","ui_warn":"#ffaa00"},"darkColors":{"background":"#0a0a0f","banner_accent":"#ff00ff","banner_border":"#ff00ff","banner_dim":"#7d3c98","banner_text":"#e0e0ff","banner_title":"#00ffff","completion_menu_bg":"#0a0a0f","prompt":"#e0e0ff","session_border":"#7d3c98","shell_dollar":"#00ffff","status_bar_bg":"#05050a","status_bar_text":"#c0c0d0","ui_accent":"#ff00ff","ui_border":"#ff00ff","ui_error":"#ff3366","ui_ok":"#00ff88","ui_text":"#e0e0ff","ui_tool":"#00ffff","ui_warn":"#ffaa00"},"darkName":"neon-ghost","description":"Electric ghost in the machine — hot magenta on void black with cyan whispers","isDark":true,"label":"Neon Ghost","lightColors":null,"lightName":null,"modeSupport":"dark","name":"neon-ghost","source":"user"},{"category":"Other","colors":{"background":"#0a1628","banner_accent":"#ffb000","banner_border":"#ffb000","banner_dim":"#4a6a8a","banner_text":"#d0e0f0","banner_title":"#00d4aa","completion_menu_bg":"#0a1628","prompt":"#d0e0f0","session_border":"#4a6a8a","shell_dollar":"#00d4aa","status_bar_bg":"#050e1a","status_bar_text":"#a8b8c8","ui_accent":"#ffb000","ui_border":"#ffb000","ui_error":"#ff3344","ui_ok":"#00d4aa","ui_text":"#d0e0f0","ui_tool":"#00d4aa","ui_warn":"#ffb000"},"darkColors":{"background":"#0a1628","banner_accent":"#ffb000","banner_border":"#ffb000","banner_dim":"#4a6a8a","banner_text":"#d0e0f0","banner_title":"#00d4aa","completion_menu_bg":"#0a1628","prompt":"#d0e0f0","session_border":"#4a6a8a","shell_dollar":"#00d4aa","status_bar_bg":"#050e1a","status_bar_text":"#a8b8c8","ui_accent":"#ffb000","ui_border":"#ffb000","ui_error":"#ff3344","ui_ok":"#00d4aa","ui_text":"#d0e0f0","ui_tool":"#00d4aa","ui_warn":"#ffb000"},"darkName":"netrunner","description":"Jacked into the mainframe — phosphor amber, digital teal, and alert red on deep navy","isDark":true,"label":"Netrunner","lightColors":null,"lightName":null,"modeSupport":"dark","name":"netrunner","source":"user"},{"category":"Other","colors":{"background":"#0f0f0f","banner_accent":"#787878","banner_border":"#555555","banner_dim":"#444444","banner_text":"#d0d0d0","banner_title":"#a0a0a0","completion_menu_bg":"#0f0f0f","prompt":"#d0d0d0","session_border":"#444444","shell_dollar":"#6088c0","status_bar_bg":"#080808","status_bar_text":"#a0a0a0","ui_accent":"#787878","ui_border":"#555555","ui_error":"#c05050","ui_ok":"#6aaa64","ui_text":"#d0d0d0","ui_tool":"#6088c0","ui_warn":"#c8a050"},"darkColors":{"background":"#0f0f0f","banner_accent":"#787878","banner_border":"#555555","banner_dim":"#444444","banner_text":"#d0d0d0","banner_title":"#a0a0a0","completion_menu_bg":"#0f0f0f","prompt":"#d0d0d0","session_border":"#444444","shell_dollar":"#6088c0","status_bar_bg":"#080808","status_bar_text":"#a0a0a0","ui_accent":"#787878","ui_border":"#555555","ui_error":"#c05050","ui_ok":"#6aaa64","ui_text":"#d0d0d0","ui_tool":"#6088c0","ui_warn":"#c8a050"},"darkName":"obsidian","description":"Polished black glass — cool silver text, slate borders, and crimson alerts on pure darkness","isDark":true,"label":"Obsidian","lightColors":null,"lightName":null,"modeSupport":"dark","name":"obsidian","source":"user"},{"category":"Other","colors":{"background":"#0a0a0a","banner_accent":"#ff4400","banner_border":"#cc2222","banner_dim":"#662222","banner_text":"#e8e0e0","banner_title":"#ffffff","completion_menu_bg":"#0a0a0a","prompt":"#e8e0e0","session_border":"#662222","shell_dollar":"#ff6644","status_bar_bg":"#050505","status_bar_text":"#a88888","ui_accent":"#ff4400","ui_border":"#cc2222","ui_error":"#ff2222","ui_ok":"#44cc44","ui_text":"#e8e0e0","ui_tool":"#ff6644","ui_warn":"#ff8800"},"darkColors":{"background":"#0a0a0a","banner_accent":"#ff4400","banner_border":"#cc2222","banner_dim":"#662222","banner_text":"#e8e0e0","banner_title":"#ffffff","completion_menu_bg":"#0a0a0a","prompt":"#e8e0e0","session_border":"#662222","shell_dollar":"#ff6644","status_bar_bg":"#050505","status_bar_text":"#a88888","ui_accent":"#ff4400","ui_border":"#cc2222","ui_error":"#ff2222","ui_ok":"#44cc44","ui_text":"#e8e0e0","ui_tool":"#ff6644","ui_warn":"#ff8800"},"darkName":"red-alert","description":"Klaxon warning — deep crimson, hazard orange, and cold white on near-black, urgent but clean","isDark":true,"label":"Red Alert","lightColors":null,"lightName":null,"modeSupport":"dark","name":"red-alert","source":"user"},{"category":"Other","colors":{"background":"#fafaf5","banner_accent":"#cc3333","banner_border":"#888888","banner_dim":"#aaaaaa","banner_text":"#1a1a1a","banner_title":"#1a1a1a","completion_menu_bg":"#fafaf5","prompt":"#1a1a1a","session_border":"#aaaaaa","shell_dollar":"#336688","status_bar_bg":"#efefe8","status_bar_text":"#555555","ui_accent":"#cc3333","ui_border":"#888888","ui_error":"#cc3333","ui_ok":"#408040","ui_text":"#1a1a1a","ui_tool":"#336688","ui_warn":"#aa6622"},"darkColors":null,"darkName":null,"description":"Japanese washi — off-white paper, sumi ink black, and a single vermilion accent","isDark":false,"label":"Rice Paper","lightColors":{"background":"#fafaf5","banner_accent":"#cc3333","banner_border":"#888888","banner_dim":"#aaaaaa","banner_text":"#1a1a1a","banner_title":"#1a1a1a","completion_menu_bg":"#fafaf5","prompt":"#1a1a1a","session_border":"#aaaaaa","shell_dollar":"#336688","status_bar_bg":"#efefe8","status_bar_text":"#555555","ui_accent":"#cc3333","ui_border":"#888888","ui_error":"#cc3333","ui_ok":"#408040","ui_text":"#1a1a1a","ui_tool":"#336688","ui_warn":"#aa6622"},"lightName":"rice-paper","modeSupport":"light","name":"rice-paper","source":"user"},{"category":"Other","colors":{"background":"#1e1a14","banner_accent":"#c87840","banner_border":"#b89060","banner_dim":"#5a4030","banner_text":"#e8dcc8","banner_title":"#d8b880","completion_menu_bg":"#1e1a14","prompt":"#e8dcc8","session_border":"#5a4030","shell_dollar":"#80a0c0","status_bar_bg":"#14100c","status_bar_text":"#b0a080","ui_accent":"#c87840","ui_border":"#b89060","ui_error":"#b05838","ui_ok":"#80a860","ui_text":"#e8dcc8","ui_tool":"#80a0c0","ui_warn":"#d8a040"},"darkColors":{"background":"#1e1a14","banner_accent":"#c87840","banner_border":"#b89060","banner_dim":"#5a4030","banner_text":"#e8dcc8","banner_title":"#d8b880","completion_menu_bg":"#1e1a14","prompt":"#e8dcc8","session_border":"#5a4030","shell_dollar":"#80a0c0","status_bar_bg":"#14100c","status_bar_text":"#b0a080","ui_accent":"#c87840","ui_border":"#b89060","ui_error":"#b05838","ui_ok":"#80a860","ui_text":"#e8dcc8","ui_tool":"#80a0c0","ui_warn":"#d8a040"},"darkName":"sandstone","description":"Desert canyon at golden hour — warm terracotta, pale sand, and deep shadowed rust","isDark":true,"label":"Sandstone","lightColors":null,"lightName":null,"modeSupport":"dark","name":"sandstone","source":"user"},{"category":"Other","colors":{"background":"#1a201e","banner_accent":"#78b898","banner_border":"#68a890","banner_dim":"#385848","banner_text":"#c8e0d8","banner_title":"#90d0b8","completion_menu_bg":"#1a201e","prompt":"#c8e0d8","session_border":"#385848","shell_dollar":"#80b8c8","status_bar_bg":"#101614","status_bar_text":"#88a098","ui_accent":"#78b898","ui_border":"#68a890","ui_error":"#d08880","ui_ok":"#90d0a0","ui_text":"#c8e0d8","ui_tool":"#80b8c8","ui_warn":"#d0b880"},"darkColors":{"background":"#1a201e","banner_accent":"#78b898","banner_border":"#68a890","banner_dim":"#385848","banner_text":"#c8e0d8","banner_title":"#90d0b8","completion_menu_bg":"#1a201e","prompt":"#c8e0d8","session_border":"#385848","shell_dollar":"#80b8c8","status_bar_bg":"#101614","status_bar_text":"#88a098","ui_accent":"#78b898","ui_border":"#68a890","ui_error":"#d08880","ui_ok":"#90d0a0","ui_text":"#c8e0d8","ui_tool":"#80b8c8","ui_warn":"#d0b880"},"darkName":"seafoam-silk","description":"Tide pool at dawn — soft seafoam green, pale sand, and gentle coral on dark teal-gray","isDark":true,"label":"Seafoam Silk","lightColors":null,"lightName":null,"modeSupport":"dark","name":"seafoam-silk","source":"user"},{"category":"Other","colors":{"background":"#1a1410","banner_accent":"#907040","banner_border":"#705830","banner_dim":"#3a2818","banner_text":"#d0c0a0","banner_title":"#c09860","completion_menu_bg":"#1a1410","prompt":"#d0c0a0","session_border":"#3a2818","shell_dollar":"#80a090","status_bar_bg":"#0e0a08","status_bar_text":"#907850","ui_accent":"#907040","ui_border":"#705830","ui_error":"#a06040","ui_ok":"#80a060","ui_text":"#d0c0a0","ui_tool":"#80a090","ui_warn":"#c09860"},"darkColors":{"background":"#1a1410","banner_accent":"#907040","banner_border":"#705830","banner_dim":"#3a2818","banner_text":"#d0c0a0","banner_title":"#c09860","completion_menu_bg":"#1a1410","prompt":"#d0c0a0","session_border":"#3a2818","shell_dollar":"#80a090","status_bar_bg":"#0e0a08","status_bar_text":"#907850","ui_accent":"#907040","ui_border":"#705830","ui_error":"#a06040","ui_ok":"#80a060","ui_text":"#d0c0a0","ui_tool":"#80a090","ui_warn":"#c09860"},"darkName":"single-malt","description":"Warm whiskey in a dark room — amber on deep brown-black, one color, perfectly restrained","isDark":true,"label":"Single Malt","lightColors":null,"lightName":null,"modeSupport":"dark","name":"single-malt","source":"user"},{"category":"Other","colors":{"background":"#002b36","banner_accent":"#cb4b16","banner_border":"#b58900","banner_dim":"#586e75","banner_text":"#eee8d5","banner_title":"#fdf6e3","completion_menu_bg":"#002b36","prompt":"#eee8d5","session_border":"#586e75","shell_dollar":"#268bd2","status_bar_bg":"#001b24","status_bar_text":"#839496","ui_accent":"#cb4b16","ui_border":"#b58900","ui_error":"#dc322f","ui_ok":"#859900","ui_text":"#eee8d5","ui_tool":"#268bd2","ui_warn":"#b58900"},"darkColors":{"background":"#002b36","banner_accent":"#cb4b16","banner_border":"#b58900","banner_dim":"#586e75","banner_text":"#eee8d5","banner_title":"#fdf6e3","completion_menu_bg":"#002b36","prompt":"#eee8d5","session_border":"#586e75","shell_dollar":"#268bd2","status_bar_bg":"#001b24","status_bar_text":"#839496","ui_accent":"#cb4b16","ui_border":"#b58900","ui_error":"#dc322f","ui_ok":"#859900","ui_text":"#eee8d5","ui_tool":"#268bd2","ui_warn":"#b58900"},"darkName":"solar-flare","description":"Intense dark solarized — deep navy background with blazing amber, cyan, and magenta signals","isDark":true,"label":"Solar Flare","lightColors":null,"lightName":null,"modeSupport":"dark","name":"solar-flare","source":"user"},{"category":"Other","colors":{"background":"#2a2418","banner_accent":"#a08860","banner_border":"#8a7850","banner_dim":"#5a4a30","banner_text":"#e0d8c0","banner_title":"#c8b890","completion_menu_bg":"#2a2418","prompt":"#e0d8c0","session_border":"#5a4a30","shell_dollar":"#80a090","status_bar_bg":"#1a1810","status_bar_text":"#a09870","ui_accent":"#a08860","ui_border":"#8a7850","ui_error":"#b05840","ui_ok":"#80a060","ui_text":"#e0d8c0","ui_tool":"#80a090","ui_warn":"#c0a050"},"darkColors":{"background":"#2a2418","banner_accent":"#a08860","banner_border":"#8a7850","banner_dim":"#5a4a30","banner_text":"#e0d8c0","banner_title":"#c8b890","completion_menu_bg":"#2a2418","prompt":"#e0d8c0","session_border":"#5a4a30","shell_dollar":"#80a090","status_bar_bg":"#1a1810","status_bar_text":"#a09870","ui_accent":"#a08860","ui_border":"#8a7850","ui_error":"#b05840","ui_ok":"#80a060","ui_text":"#e0d8c0","ui_tool":"#80a090","ui_warn":"#c0a050"},"darkName":"typewriter-cream","description":"Aged manuscript — warm cream paper background with faded ink, sepia accents, and soft rust","isDark":true,"label":"Typewriter Cream","lightColors":null,"lightName":null,"modeSupport":"dark","name":"typewriter-cream","source":"user"},{"category":"Other","colors":{"background":"#f8f0e0","banner_accent":"#5a4040","banner_border":"#8a7058","banner_dim":"#a89880","banner_text":"#3a2818","banner_title":"#3a2818","completion_menu_bg":"#f8f0e0","prompt":"#3a2818","session_border":"#a89880","shell_dollar":"#486880","status_bar_bg":"#efe4d0","status_bar_text":"#5a4838","ui_accent":"#5a4040","ui_border":"#8a7058","ui_error":"#883838","ui_ok":"#406840","ui_text":"#3a2818","ui_tool":"#486880","ui_warn":"#886838"},"darkColors":null,"darkName":null,"description":"Old book page — warm cream background with dark sepia text and faded indigo accents","isDark":false,"label":"Warm Parchment","lightColors":{"background":"#f8f0e0","banner_accent":"#5a4040","banner_border":"#8a7058","banner_dim":"#a89880","banner_text":"#3a2818","banner_title":"#3a2818","completion_menu_bg":"#f8f0e0","prompt":"#3a2818","session_border":"#a89880","shell_dollar":"#486880","status_bar_bg":"#efe4d0","status_bar_text":"#5a4838","ui_accent":"#5a4040","ui_border":"#8a7058","ui_error":"#883838","ui_ok":"#406840","ui_text":"#3a2818","ui_tool":"#486880","ui_warn":"#886838"},"lightName":"warm-parchment","modeSupport":"light","name":"warm-parchment","source":"user"},{"category":"Other","colors":{"background":"#000000","banner_accent":"#ffff00","banner_border":"#ffffff","banner_dim":"#888888","banner_text":"#ffffff","banner_title":"#ffffff","completion_menu_bg":"#080808","prompt":"#ffffff","session_border":"#888888","shell_dollar":"#00ffff","status_bar_bg":"#000000","status_bar_text":"#cccccc","ui_accent":"#ffff00","ui_border":"#ffffff","ui_error":"#ff0000","ui_ok":"#00ff00","ui_text":"#ffffff","ui_tool":"#00ffff","ui_warn":"#ffff00"},"darkColors":{"background":"#000000","banner_accent":"#ffff00","banner_border":"#ffffff","banner_dim":"#888888","banner_text":"#ffffff","banner_title":"#ffffff","completion_menu_bg":"#080808","prompt":"#ffffff","session_border":"#888888","shell_dollar":"#00ffff","status_bar_bg":"#000000","status_bar_text":"#cccccc","ui_accent":"#ffff00","ui_border":"#ffffff","ui_error":"#ff0000","ui_ok":"#00ff00","ui_text":"#ffffff","ui_tool":"#00ffff","ui_warn":"#ffff00"},"darkName":"white-flash","description":"Maximum readability — pure white text on pure black, with electric yellow and cyan signals","isDark":true,"label":"White Flash","lightColors":null,"lightName":null,"modeSupport":"dark","name":"white-flash","source":"user"},{"category":"Built-in","colors":{"banner_accent":"#DD4A3A","banner_border":"#A93333","banner_dim":"#905151","banner_text":"#F1E6CF","banner_title":"#C7A96B","completion_menu_bg":"#2A1212","prompt":"#F1E6CF","session_border":"#6E584B","shell_dollar":"#DD4A3A","status_bar_bg":"#2A1212","status_bar_text":"#F1E6CF","ui_accent":"#DD4A3A","ui_error":"#ef5350","ui_ok":"#4caf50","ui_warn":"#ffa726"},"darkColors":{"banner_accent":"#DD4A3A","banner_border":"#A93333","banner_dim":"#905151","banner_text":"#F1E6CF","banner_title":"#C7A96B","completion_menu_bg":"#2A1212","prompt":"#F1E6CF","session_border":"#6E584B","shell_dollar":"#DD4A3A","status_bar_bg":"#2A1212","status_bar_text":"#F1E6CF","ui_accent":"#DD4A3A","ui_error":"#ef5350","ui_ok":"#4caf50","ui_warn":"#ffa726"},"darkName":"ares","description":"War-god theme — crimson and bronze","isDark":true,"label":"Ares","lightColors":null,"lightName":null,"modeSupport":"dark","name":"ares","source":"builtin"},{"category":"Built-in","colors":{"banner_accent":"#8EA8FF","banner_border":"#4169e1","banner_dim":"#545E6B","banner_text":"#c9d1d9","banner_title":"#7eb8f6","completion_menu_bg":"#151C2F","prompt":"#c9d1d9","session_border":"#545E6B","shell_dollar":"#7eb8f6","status_bar_bg":"#151C2F","status_bar_text":"#C9D1D9","ui_accent":"#7eb8f6","ui_error":"#F7A072","ui_ok":"#63D0A6","ui_warn":"#e6a855"},"darkColors":{"banner_accent":"#8EA8FF","banner_border":"#4169e1","banner_dim":"#545E6B","banner_text":"#c9d1d9","banner_title":"#7eb8f6","completion_menu_bg":"#151C2F","prompt":"#c9d1d9","session_border":"#545E6B","shell_dollar":"#7eb8f6","status_bar_bg":"#151C2F","status_bar_text":"#C9D1D9","ui_accent":"#7eb8f6","ui_error":"#F7A072","ui_ok":"#63D0A6","ui_warn":"#e6a855"},"darkName":"slate","description":"Cool blue — developer-focused","isDark":true,"label":"Slate","lightColors":null,"lightName":null,"modeSupport":"dark","name":"slate","source":"builtin"},{"category":"Built-in","colors":{"banner_accent":"#1D4ED8","banner_border":"#2563EB","banner_dim":"#475569","banner_text":"#111827","banner_title":"#0F172A","completion_menu_bg":"#F8FAFC","prompt":"#111827","session_border":"#64748B","shell_dollar":"#2563EB","status_bar_bg":"#E5EDF8","status_bar_text":"#111827","ui_accent":"#2563EB","ui_error":"#B91C1C","ui_ok":"#15803D","ui_warn":"#B45309"},"darkColors":null,"darkName":null,"description":"Light theme for bright terminals with dark text and cool blue accents","isDark":false,"label":"Daylight","lightColors":{"banner_accent":"#1D4ED8","banner_border":"#2563EB","banner_dim":"#475569","banner_text":"#111827","banner_title":"#0F172A","completion_menu_bg":"#F8FAFC","prompt":"#111827","session_border":"#64748B","shell_dollar":"#2563EB","status_bar_bg":"#E5EDF8","status_bar_text":"#111827","ui_accent":"#2563EB","ui_error":"#B91C1C","ui_ok":"#15803D","ui_warn":"#B45309"},"lightName":"daylight","modeSupport":"light","name":"daylight","source":"builtin"},{"category":"Built-in","colors":{"banner_accent":"#8B4513","banner_border":"#8B6914","banner_dim":"#8B7355","banner_text":"#2C1810","banner_title":"#5C3D11","completion_menu_bg":"#F5EFE0","prompt":"#2C1810","session_border":"#A0845C","shell_dollar":"#8B4513","status_bar_bg":"#F5F0E8","status_bar_text":"#2C1810","ui_accent":"#8B4513","ui_error":"#C62828","ui_ok":"#2E7D32","ui_warn":"#E65100"},"darkColors":null,"darkName":null,"description":"Warm light mode — dark brown/gold text for light terminal backgrounds","isDark":false,"label":"Warm Lightmode","lightColors":{"banner_accent":"#8B4513","banner_border":"#8B6914","banner_dim":"#8B7355","banner_text":"#2C1810","banner_title":"#5C3D11","completion_menu_bg":"#F5EFE0","prompt":"#2C1810","session_border":"#A0845C","shell_dollar":"#8B4513","status_bar_bg":"#F5F0E8","status_bar_text":"#2C1810","ui_accent":"#8B4513","ui_error":"#C62828","ui_ok":"#2E7D32","ui_warn":"#E65100"},"lightName":"warm-lightmode","modeSupport":"light","name":"warm-lightmode","source":"builtin"},{"category":"Built-in","colors":{"banner_accent":"#5DB8F5","banner_border":"#2A6FB9","banner_dim":"#44638F","banner_text":"#EAF7FF","banner_title":"#A9DFFF","completion_menu_bg":"#0F2440","prompt":"#EAF7FF","session_border":"#496884","shell_dollar":"#5DB8F5","status_bar_bg":"#0F2440","status_bar_text":"#EAF7FF","ui_accent":"#5DB8F5","ui_error":"#ef5350","ui_ok":"#4caf50","ui_warn":"#ffa726"},"darkColors":{"banner_accent":"#5DB8F5","banner_border":"#2A6FB9","banner_dim":"#44638F","banner_text":"#EAF7FF","banner_title":"#A9DFFF","completion_menu_bg":"#0F2440","prompt":"#EAF7FF","session_border":"#496884","shell_dollar":"#5DB8F5","status_bar_bg":"#0F2440","status_bar_text":"#EAF7FF","ui_accent":"#5DB8F5","ui_error":"#ef5350","ui_ok":"#4caf50","ui_warn":"#ffa726"},"darkName":"poseidon","description":"Ocean-god theme — deep blue and seafoam","isDark":true,"label":"Poseidon","lightColors":null,"lightName":null,"modeSupport":"dark","name":"poseidon","source":"builtin"},{"category":"Built-in","colors":{"banner_accent":"#E7E7E7","banner_border":"#B7B7B7","banner_dim":"#5C5C5C","banner_text":"#D3D3D3","banner_title":"#F5F5F5","completion_menu_bg":"#202020","prompt":"#F5F5F5","session_border":"#656565","shell_dollar":"#E7E7E7","status_bar_bg":"#202020","status_bar_text":"#D3D3D3","ui_accent":"#E7E7E7","ui_error":"#E7E7E7","ui_ok":"#919191","ui_warn":"#B7B7B7"},"darkColors":{"banner_accent":"#E7E7E7","banner_border":"#B7B7B7","banner_dim":"#5C5C5C","banner_text":"#D3D3D3","banner_title":"#F5F5F5","completion_menu_bg":"#202020","prompt":"#F5F5F5","session_border":"#656565","shell_dollar":"#E7E7E7","status_bar_bg":"#202020","status_bar_text":"#D3D3D3","ui_accent":"#E7E7E7","ui_error":"#E7E7E7","ui_ok":"#919191","ui_warn":"#B7B7B7"},"darkName":"sisyphus","description":"Sisyphean theme — austere grayscale with persistence","isDark":true,"label":"Sisyphus","lightColors":null,"lightName":null,"modeSupport":"dark","name":"sisyphus","source":"builtin"},{"category":"Built-in","colors":{"banner_accent":"#F29C38","banner_border":"#C75B1D","banner_dim":"#C58A45","banner_text":"#FFF0D4","banner_title":"#FFD39A","completion_menu_bg":"#0B0503","prompt":"#FFF0D4","session_border":"#7B593A","shell_dollar":"#F29C38","status_bar_bg":"#2B160E","status_bar_text":"#FFF0D4","ui_accent":"#F29C38","ui_error":"#ef5350","ui_ok":"#4caf50","ui_warn":"#ffa726"},"darkColors":{"banner_accent":"#F29C38","banner_border":"#C75B1D","banner_dim":"#C58A45","banner_text":"#FFF0D4","banner_title":"#FFD39A","completion_menu_bg":"#0B0503","prompt":"#FFF0D4","session_border":"#7B593A","shell_dollar":"#F29C38","status_bar_bg":"#2B160E","status_bar_text":"#FFF0D4","ui_accent":"#F29C38","ui_error":"#ef5350","ui_ok":"#4caf50","ui_warn":"#ffa726"},"darkName":"charizard","description":"Volcanic theme — burnt orange and ember","isDark":true,"label":"Charizard","lightColors":null,"lightName":null,"modeSupport":"dark","name":"charizard","source":"builtin"}]

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
