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

const SKINS = [{"category":"Other","colors":{"background":"#fdfdfa","banner_accent":"#3858b0","banner_border":"#909090","banner_dim":"#b0b0b0","banner_text":"#1a1a1a","banner_title":"#1a1a1a","completion_menu_bg":"#fdfdfa","prompt":"#1a1a1a","session_border":"#b0b0b0","shell_dollar":"#3858b0","status_bar_bg":"#f0f0e8","status_bar_text":"#606060","ui_accent":"#3858b0","ui_border":"#909090","ui_error":"#b03838","ui_ok":"#388040","ui_text":"#1a1a1a","ui_tool":"#3858b0","ui_warn":"#b08020"},"description":"Pure white stone — almost-white canvas with charcoal text and a single cobalt thread","isDark":false,"name":"alabaster","source":"user"},{"category":"Other","colors":{"background":"#0c0804","banner_accent":"#c89030","banner_border":"#b08020","banner_dim":"#604818","banner_text":"#e0c088","banner_title":"#e0b040","completion_menu_bg":"#0c0804","prompt":"#e0c088","session_border":"#604818","shell_dollar":"#e0b040","status_bar_bg":"#060402","status_bar_text":"#a08048","ui_accent":"#c89030","ui_border":"#b08020","ui_error":"#e05030","ui_ok":"#c0b040","ui_text":"#e0c088","ui_tool":"#e0b040","ui_warn":"#e0b040"},"description":"Classic CRT phosphor — warm amber text on a deep burnt-black tube with scanline vibes","isDark":true,"name":"amber-terminal","source":"user"},{"category":"Other","colors":{"background":"#161022","banner_accent":"#c0a040","banner_border":"#7a58a8","banner_dim":"#3a2858","banner_text":"#c8c0e0","banner_title":"#70b8f0","completion_menu_bg":"#161022","prompt":"#c8c0e0","session_border":"#3a2858","shell_dollar":"#70b8f0","status_bar_bg":"#0c0816","status_bar_text":"#8878a0","ui_accent":"#c0a040","ui_border":"#7a58a8","ui_error":"#c05060","ui_ok":"#50c080","ui_text":"#c8c0e0","ui_tool":"#70b8f0","ui_warn":"#c0a040"},"description":"Wizard's spellbook — deep violet leather, glowing arcane blue, and aged gold foil","isDark":true,"name":"arcane-tome","source":"user"},{"category":"Other","colors":{"background":"#0a1820","banner_accent":"#6090d0","banner_border":"#40b090","banner_dim":"#284860","banner_text":"#c8e8f0","banner_title":"#80e8c0","completion_menu_bg":"#0a1820","prompt":"#c8e8f0","session_border":"#284860","shell_dollar":"#80e8c0","status_bar_bg":"#061014","status_bar_text":"#88b8c8","ui_accent":"#6090d0","ui_border":"#40b090","ui_error":"#e06070","ui_ok":"#60e0a0","ui_text":"#c8e8f0","ui_tool":"#80e8c0","ui_warn":"#e0b040"},"description":"Northern lights over frozen tundra — emerald, violet, and ice blue shimmer on darkest teal","isDark":true,"name":"aurora-boreal","source":"user"},{"category":"Other","colors":{"background":"#181c24","banner_accent":"#80a0c0","banner_border":"#6888a8","banner_dim":"#384858","banner_text":"#d0dce8","banner_title":"#a0c0e0","completion_menu_bg":"#181c24","prompt":"#d0dce8","session_border":"#384858","shell_dollar":"#a0c0e0","status_bar_bg":"#0e1218","status_bar_text":"#8898a8","ui_accent":"#80a0c0","ui_border":"#6888a8","ui_error":"#c88888","ui_ok":"#88c098","ui_text":"#d0dce8","ui_tool":"#a0c0e0","ui_warn":"#c8b060"},"description":"Calm nursery tones — powder blue, soft cream, and gentle coral on muted navy, soothing","isDark":true,"name":"baby-blue","source":"user"},{"category":"Other","colors":{"background":"#101010","banner_accent":"#ffd700","banner_border":"#ffd700","banner_dim":"#606060","banner_text":"#f0f0f0","banner_title":"#ffffff","completion_menu_bg":"#101010","prompt":"#f0f0f0","session_border":"#606060","shell_dollar":"#40b0ff","status_bar_bg":"#080808","status_bar_text":"#b0b0b0","ui_accent":"#ffd700","ui_border":"#ffd700","ui_error":"#ff3030","ui_ok":"#00e070","ui_text":"#f0f0f0","ui_tool":"#40b0ff","ui_warn":"#ffd700"},"description":"Aviation cockpit — bright yellow on matte black with crisp white signals, zero ambiguity","isDark":true,"name":"black-canary","source":"user"},{"category":"Other","colors":{"background":"#d8e4f0","banner_accent":"#2858a0","banner_border":"#3a6090","banner_dim":"#8098b8","banner_text":"#102848","banner_title":"#102848","completion_menu_bg":"#d8e4f0","prompt":"#102848","session_border":"#8098b8","shell_dollar":"#2858a0","status_bar_bg":"#c8d8e8","status_bar_text":"#405870","ui_accent":"#2858a0","ui_border":"#3a6090","ui_error":"#902820","ui_ok":"#307050","ui_text":"#102848","ui_tool":"#2858a0","ui_warn":"#906020"},"description":"Architectural cyanotype — white lines on Prussian blue, crisp and technical","isDark":false,"name":"blueprint","source":"user"},{"category":"Other","colors":{"background":"#1a1a1a","banner_accent":"#608088","banner_border":"#444a50","banner_dim":"#383838","banner_text":"#d8d8d8","banner_title":"#c8d0d8","completion_menu_bg":"#1a1a1a","prompt":"#d8d8d8","session_border":"#383838","shell_dollar":"#608088","status_bar_bg":"#101010","status_bar_text":"#909090","ui_accent":"#608088","ui_border":"#444a50","ui_error":"#987878","ui_ok":"#789880","ui_text":"#d8d8d8","ui_tool":"#608088","ui_warn":"#989078"},"description":"Pure minimalism — off-white text on soft black, with one muted teal accent","isDark":true,"name":"bone-white","source":"user"},{"category":"Other","colors":{"background":"#202020","banner_accent":"#ff5500","banner_border":"#505050","banner_dim":"#383838","banner_text":"#c0c0c0","banner_title":"#a0a0a0","completion_menu_bg":"#202020","prompt":"#c0c0c0","session_border":"#383838","shell_dollar":"#ff5500","status_bar_bg":"#141414","status_bar_text":"#787878","ui_accent":"#ff5500","ui_border":"#505050","ui_error":"#e04030","ui_ok":"#60a060","ui_text":"#c0c0c0","ui_tool":"#ff5500","ui_warn":"#ff8800"},"description":"Raw architectural concrete — unflinching gray on gray with one fluorescent orange signal","isDark":true,"name":"brutalist-concrete","source":"user"},{"category":"Other","colors":{"background":"#120c2e","banner_accent":"#e6398c","banner_border":"#e6398c","banner_dim":"#6b5fa0","banner_text":"#e8def8","banner_title":"#4dc9f6","completion_menu_bg":"#120c2e","prompt":"#e8def8","session_border":"#6b5fa0","shell_dollar":"#4dc9f6","status_bar_bg":"#0a081c","status_bar_text":"#c8c0d8","ui_accent":"#e6398c","ui_border":"#4dc9f6","ui_error":"#e74c3c","ui_ok":"#2ecc71","ui_text":"#e8def8","ui_tool":"#4dc9f6","ui_warn":"#f4d03f"},"description":"Wet chrome streets at midnight — electric blue, hot pink, and acid yellow on deep indigo","isDark":true,"name":"chrome-rain","source":"user"},{"category":"Other","colors":{"background":"#202840","banner_accent":"#9070d0","banner_border":"#8068c0","banner_dim":"#483868","banner_text":"#c8c8e8","banner_title":"#a088e0","completion_menu_bg":"#202840","prompt":"#c8c8e8","session_border":"#483868","shell_dollar":"#a088e0","status_bar_bg":"#141828","status_bar_text":"#8888a8","ui_accent":"#9070d0","ui_border":"#8068c0","ui_error":"#d06060","ui_ok":"#70d070","ui_text":"#c8c8e8","ui_tool":"#a088e0","ui_warn":"#d0c050"},"description":"1980s home computer — that specific washed-out blue background with purple-magenta titles","isDark":true,"name":"commodore-64","source":"user"},{"category":"Dark","colors":{"background":"#150d22","banner_accent":"#c084fc","banner_border":"#3c2a55","banner_dim":"#8f7ab0","banner_text":"#f3e8ff","banner_title":"#f3e8ff","completion_menu_bg":"#221a2f","prompt":"#f3e8ff","session_border":"#3c2a55","status_bar_bg":"#130c1f","status_bar_text":"#f3e8ff","ui_accent":"#c084fc","ui_border":"#3c2a55","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#f3e8ff","ui_tool":"#7B2D8E","ui_warn":"#fbbf24"},"description":"Deep aubergine with violet accents","isDark":true,"name":"dark-aubergine","source":"user"},{"category":"Dark","colors":{"background":"#16181d","banner_accent":"#8ec5ff","banner_border":"#262a33","banner_dim":"#8b919c","banner_text":"#e6e9ef","banner_title":"#e6e9ef","completion_menu_bg":"#22252a","prompt":"#e6e9ef","session_border":"#262a33","status_bar_bg":"#14161a","status_bar_text":"#e6e9ef","ui_accent":"#8ec5ff","ui_border":"#262a33","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#e6e9ef","ui_tool":"#4f9cf0","ui_warn":"#fbbf24"},"description":"Steel gray-blue, calm and neutral","isDark":true,"name":"dark-charcoal","source":"user"},{"category":"Dark","colors":{"background":"#0b1220","banner_accent":"#93c5fd","banner_border":"#1c2942","banner_dim":"#7c8aa5","banner_text":"#e2e8f0","banner_title":"#e2e8f0","completion_menu_bg":"#181f2c","prompt":"#e2e8f0","session_border":"#1c2942","status_bar_bg":"#0a101d","status_bar_text":"#e2e8f0","ui_accent":"#93c5fd","ui_border":"#1c2942","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#e2e8f0","ui_tool":"#3b82f6","ui_warn":"#fbbf24"},"description":"Deep ocean navy with clear blue accents","isDark":true,"name":"dark-navy","source":"user"},{"category":"Dark","colors":{"background":"#0d0d12","banner_accent":"#b3a6ff","banner_border":"#232330","banner_dim":"#8a8699","banner_text":"#e8e6f2","banner_title":"#e8e6f2","completion_menu_bg":"#1a1a1f","prompt":"#e8e6f2","session_border":"#232330","status_bar_bg":"#0c0c10","status_bar_text":"#e8e6f2","ui_accent":"#b3a6ff","ui_border":"#232330","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#e8e6f2","ui_tool":"#6e5ce6","ui_warn":"#fbbf24"},"description":"Near-black with violet-gray light","isDark":true,"name":"dark-obsidian","source":"user"},{"category":"Other","colors":{"background":"#0a1a20","banner_accent":"#3098a8","banner_border":"#206880","banner_dim":"#1a4858","banner_text":"#c0e8e8","banner_title":"#50c8d0","completion_menu_bg":"#0a1a20","prompt":"#c0e8e8","session_border":"#1a4858","shell_dollar":"#50c8d0","status_bar_bg":"#061014","status_bar_text":"#80b0b0","ui_accent":"#3098a8","ui_border":"#206880","ui_error":"#d05060","ui_ok":"#50d0a0","ui_text":"#c0e8e8","ui_tool":"#50c8d0","ui_warn":"#d0a840"},"description":"Abyssal trench — darkest teal, bioluminescent blue-green, and pale sea-foam highlights","isDark":true,"name":"deep-ocean","source":"user"},{"category":"Other","colors":{"background":"#000000","banner_accent":"#7060a0","banner_border":"#3a3050","banner_dim":"#2a2040","banner_text":"#b0a0c0","banner_title":"#9080c0","completion_menu_bg":"#050508","prompt":"#b0a0c0","session_border":"#2a2040","shell_dollar":"#6070a0","status_bar_bg":"#000000","status_bar_text":"#807090","ui_accent":"#7060a0","ui_border":"#3a3050","ui_error":"#904040","ui_ok":"#508050","ui_text":"#b0a0c0","ui_tool":"#6070a0","ui_warn":"#908050"},"description":"True AMOLED black with barely-there violet undertones — the darkest readable theme possible","isDark":true,"name":"deep-void","source":"user"},{"category":"Other","colors":{"background":"#14100c","banner_accent":"#ffb800","banner_border":"#ff4088","banner_dim":"#443020","banner_text":"#e8d8c8","banner_title":"#00e8e8","completion_menu_bg":"#14100c","prompt":"#e8d8c8","session_border":"#443020","shell_dollar":"#00e8e8","status_bar_bg":"#0a0804","status_bar_text":"#a89080","ui_accent":"#ffb800","ui_border":"#ff4088","ui_error":"#ff4088","ui_ok":"#40e880","ui_text":"#e8d8c8","ui_tool":"#00e8e8","ui_warn":"#ffb800"},"description":"Vegas motel sign at 3am — hot turquoise, flamingo pink, and desert gold on baked black","isDark":true,"name":"desert-neon","source":"user"},{"category":"Other","colors":{"background":"#141010","banner_accent":"#d04040","banner_border":"#b83030","banner_dim":"#582828","banner_text":"#e0d0c0","banner_title":"#f0c840","completion_menu_bg":"#141010","prompt":"#e0d0c0","session_border":"#582828","shell_dollar":"#f0c840","status_bar_bg":"#0a0808","status_bar_text":"#a08070","ui_accent":"#d04040","ui_border":"#b83030","ui_error":"#e03030","ui_ok":"#50a050","ui_text":"#e0d0c0","ui_tool":"#f0c840","ui_warn":"#f0c840"},"description":"Ancient wyrm — dark crimson, molten gold, and charcoal black, forged in fire","isDark":true,"name":"dragon-blood","source":"user"},{"category":"Other","colors":{"background":"#1c181a","banner_accent":"#b88898","banner_border":"#a87088","banner_dim":"#483840","banner_text":"#d8d0d4","banner_title":"#d0a0b8","completion_menu_bg":"#1c181a","prompt":"#d8d0d4","session_border":"#483840","shell_dollar":"#88a0b8","status_bar_bg":"#120e10","status_bar_text":"#988890","ui_accent":"#b88898","ui_border":"#a87088","ui_error":"#c87070","ui_ok":"#88b898","ui_text":"#d8d0d4","ui_tool":"#88a0b8","ui_warn":"#c8a870"},"description":"Antique velvet — muted rose, dusty mauve, and faded sage on warm charcoal","isDark":true,"name":"dusty-rose","source":"user"},{"category":"Other","colors":{"background":"#18181a","banner_accent":"#9a88c0","banner_border":"#6a5a8a","banner_dim":"#3a3050","banner_text":"#d0d0d8","banner_title":"#c8b8e8","completion_menu_bg":"#18181a","prompt":"#d0d0d8","session_border":"#3a3050","shell_dollar":"#7890b8","status_bar_bg":"#101012","status_bar_text":"#9898a0","ui_accent":"#9a88c0","ui_border":"#6a5a8a","ui_error":"#b86868","ui_ok":"#78a878","ui_text":"#d0d0d8","ui_tool":"#7890b8","ui_warn":"#c8a870"},"description":"Total solar eclipse — charcoal field with a corona ring of soft lilac and electric white","isDark":true,"name":"eclipse","source":"user"},{"category":"Other","colors":{"background":"#0e1814","banner_accent":"#c8b040","banner_border":"#388060","banner_dim":"#284838","banner_text":"#c0e0d0","banner_title":"#60d8a0","completion_menu_bg":"#0e1814","prompt":"#c0e0d0","session_border":"#284838","shell_dollar":"#60d8a0","status_bar_bg":"#08100c","status_bar_text":"#80a090","ui_accent":"#c8b040","ui_border":"#388060","ui_error":"#d06060","ui_ok":"#60d8a0","ui_text":"#c0e0d0","ui_tool":"#60d8a0","ui_warn":"#c8b040"},"description":"Feywild glade — deep viridian, bioluminescent teal, pale gold motes on woodland shadow","isDark":true,"name":"enchanted-forest","source":"user"},{"category":"Other","colors":{"background":"#141210","banner_accent":"#6888a8","banner_border":"#c86030","banner_dim":"#483020","banner_text":"#d0c8b8","banner_title":"#f0a050","completion_menu_bg":"#141210","prompt":"#d0c8b8","session_border":"#483020","shell_dollar":"#6888a8","status_bar_bg":"#0a0808","status_bar_text":"#908870","ui_accent":"#6888a8","ui_border":"#c86030","ui_error":"#d04030","ui_ok":"#60a860","ui_text":"#d0c8b8","ui_tool":"#6888a8","ui_warn":"#f0a050"},"description":"Dwarven smithy — hot ember orange, cooling steel blue, and soot black, hammer on anvil","isDark":true,"name":"forge-master","source":"user"},{"category":"Other","colors":{"background":"#0d0d0d","banner_accent":"#ff003c","banner_border":"#39ff14","banner_dim":"#3a7a30","banner_text":"#c0ffc0","banner_title":"#39ff14","completion_menu_bg":"#0d0d0d","prompt":"#c0ffc0","session_border":"#3a7a30","shell_dollar":"#39ff14","status_bar_bg":"#050505","status_bar_text":"#a0d0a0","ui_accent":"#ff003c","ui_border":"#39ff14","ui_error":"#ff003c","ui_ok":"#39ff14","ui_text":"#c0ffc0","ui_tool":"#39ff14","ui_warn":"#ff8800"},"description":"Broken signal aesthetic — toxic green on corrupted black with flickering red accents","isDark":true,"name":"glitch-punk","source":"user"},{"category":"Other","colors":{"background":"#1e1e1e","banner_accent":"#608080","banner_border":"#4a4a4a","banner_dim":"#3a3a3a","banner_text":"#c8c8c8","banner_title":"#809090","completion_menu_bg":"#1e1e1e","prompt":"#c8c8c8","session_border":"#3a3a3a","shell_dollar":"#607888","status_bar_bg":"#141414","status_bar_text":"#909090","ui_accent":"#608080","ui_border":"#4a4a4a","ui_error":"#886060","ui_ok":"#608860","ui_text":"#c8c8c8","ui_tool":"#607888","ui_warn":"#888060"},"description":"Dark pencil-lead tones — warm graphite grays with subtle blue-green accent, no harsh contrast","isDark":true,"name":"graphite","source":"user"},{"category":"Other","colors":{"background":"#0a0e08","banner_accent":"#40b840","banner_border":"#308830","banner_dim":"#1a5018","banner_text":"#b0e8b0","banner_title":"#50e050","completion_menu_bg":"#0a0e08","prompt":"#b0e8b0","session_border":"#1a5018","shell_dollar":"#50e050","status_bar_bg":"#050804","status_bar_text":"#70a070","ui_accent":"#40b840","ui_border":"#308830","ui_error":"#e05050","ui_ok":"#50e050","ui_text":"#b0e8b0","ui_tool":"#50e050","ui_warn":"#e0e050"},"description":"Vintage IBM monochrome — phosphor green on dark tube glass, with a slight glow bloom","isDark":true,"name":"green-screen","source":"user"},{"category":"Other","colors":{"background":"#f5f5f0","banner_accent":"#3366aa","banner_border":"#335588","banner_dim":"#8898a8","banner_text":"#1a2a44","banner_title":"#1a2a44","completion_menu_bg":"#f5f5f0","prompt":"#1a2a44","session_border":"#8898a8","shell_dollar":"#3366aa","status_bar_bg":"#e8e8e0","status_bar_text":"#445566","ui_accent":"#3366aa","ui_border":"#335588","ui_error":"#aa2222","ui_ok":"#227744","ui_text":"#1a2a44","ui_tool":"#3366aa","ui_warn":"#aa6622"},"description":"Bright terminal for daylight — dark navy text on soft white, readable in direct sun","isDark":false,"name":"high-noon","source":"user"},{"category":"Other","colors":{"background":"#1e1a2a","banner_accent":"#a088c8","banner_border":"#8870a8","banner_dim":"#483858","banner_text":"#d8d0e8","banner_title":"#c0a8e0","completion_menu_bg":"#1e1a2a","prompt":"#d8d0e8","session_border":"#483858","shell_dollar":"#88b8d0","status_bar_bg":"#141020","status_bar_text":"#9888a8","ui_accent":"#a088c8","ui_border":"#8870a8","ui_error":"#c87078","ui_ok":"#88c898","ui_text":"#d8d0e8","ui_tool":"#88b8d0","ui_warn":"#c8a878"},"description":"Soft purple twilight — gentle lavender, blush pink, and mint on deep plum, no eye strain","isDark":true,"name":"lavender-dream","source":"user"},{"category":"Light","colors":{"background":"#f5f7fa","banner_accent":"#3b6ea8","banner_border":"#d9e0e8","banner_dim":"#5c6b7d","banner_text":"#1c2430","banner_title":"#1c2430","completion_menu_bg":"#e8eaee","prompt":"#1c2430","session_border":"#d9e0e8","status_bar_bg":"#f6f8fa","status_bar_text":"#1c2430","ui_accent":"#3b6ea8","ui_border":"#d9e0e8","ui_error":"#d05f5f","ui_ok":"#2f8e52","ui_text":"#1c2430","ui_tool":"#3b6ea8","ui_warn":"#a17a17"},"description":"Bright neutral white with steel blue","isDark":false,"name":"light-cloud","source":"user"},{"category":"Light","colors":{"background":"#faf6ef","banner_accent":"#b15435","banner_border":"#e5dccb","banner_dim":"#7d6f5e","banner_text":"#33291f","banner_title":"#33291f","completion_menu_bg":"#eeeae3","prompt":"#33291f","session_border":"#e5dccb","status_bar_bg":"#faf7f0","status_bar_text":"#33291f","ui_accent":"#b15435","ui_border":"#e5dccb","ui_error":"#d05f5f","ui_ok":"#2f8e52","ui_text":"#33291f","ui_tool":"#c05b3a","ui_warn":"#a17a17"},"description":"Warm cream with terracotta","isDark":false,"name":"light-cream","source":"user"},{"category":"Light","colors":{"background":"#eef4f8","banner_accent":"#2f6f9f","banner_border":"#d3e0ea","banner_dim":"#5b6f80","banner_text":"#22303b","banner_title":"#22303b","completion_menu_bg":"#e2e8ed","prompt":"#22303b","session_border":"#d3e0ea","status_bar_bg":"#eff5f9","status_bar_text":"#22303b","ui_accent":"#2f6f9f","ui_border":"#d3e0ea","ui_error":"#c65a5a","ui_ok":"#2f8e52","ui_text":"#22303b","ui_tool":"#2f6f9f","ui_warn":"#a17a17"},"description":"Cool frost white with slate blue","isDark":false,"name":"light-frost","source":"user"},{"category":"Light","colors":{"background":"#f6f3fb","banner_accent":"#7a5fc0","banner_border":"#ddd5ec","banner_dim":"#6f6590","banner_text":"#2a2438","banner_title":"#2a2438","completion_menu_bg":"#eae7ef","prompt":"#2a2438","session_border":"#ddd5ec","status_bar_bg":"#f7f4fb","status_bar_text":"#2a2438","ui_accent":"#7a5fc0","ui_border":"#ddd5ec","ui_error":"#c65a5a","ui_ok":"#2f8e52","ui_text":"#2a2438","ui_tool":"#7a5fc0","ui_warn":"#a17a17"},"description":"Pale lavender with violet","isDark":false,"name":"light-lavender","source":"user"},{"category":"Light","colors":{"background":"#f2faf5","banner_accent":"#267e58","banner_border":"#d3e8dd","banner_dim":"#5b7569","banner_text":"#1e2b25","banner_title":"#1e2b25","completion_menu_bg":"#e5eee9","prompt":"#1e2b25","session_border":"#d3e8dd","status_bar_bg":"#f3faf6","status_bar_text":"#1e2b25","ui_accent":"#267e58","ui_border":"#d3e8dd","ui_error":"#d05f5f","ui_ok":"#2f8e52","ui_text":"#1e2b25","ui_tool":"#2f9e6e","ui_warn":"#a17a17"},"description":"Fresh white with soft mint green","isDark":false,"name":"light-mint","source":"user"},{"category":"Light","colors":{"background":"#f7f4ec","banner_accent":"#8e623a","banner_border":"#ded7c9","banner_dim":"#6f675c","banner_text":"#2b2620","banner_title":"#2b2620","completion_menu_bg":"#ebe8e0","prompt":"#2b2620","session_border":"#ded7c9","status_bar_bg":"#f8f5ee","status_bar_text":"#2b2620","ui_accent":"#8e623a","ui_border":"#ded7c9","ui_error":"#c65a5a","ui_ok":"#2f8e52","ui_text":"#2b2620","ui_tool":"#9a6b3f","ui_warn":"#a17a17"},"description":"Warm paper with soft leather brown","isDark":false,"name":"light-paper","source":"user"},{"category":"Light","colors":{"background":"#faf4f5","banner_accent":"#a2556d","banner_border":"#ead7dc","banner_dim":"#7d646d","banner_text":"#33262b","banner_title":"#33262b","completion_menu_bg":"#eee8e9","prompt":"#33262b","session_border":"#ead7dc","status_bar_bg":"#faf5f6","status_bar_text":"#33262b","ui_accent":"#a2556d","ui_border":"#ead7dc","ui_error":"#d05f5f","ui_ok":"#2f8e52","ui_text":"#33262b","ui_tool":"#b05c77","ui_warn":"#a17a17"},"description":"Blush white with dusty rose","isDark":false,"name":"light-rose","source":"user"},{"category":"Light","colors":{"background":"#f6f1e4","banner_accent":"#667433","banner_border":"#e0d8bf","banner_dim":"#716b54","banner_text":"#2e2a1e","banner_title":"#2e2a1e","completion_menu_bg":"#eae5d8","prompt":"#2e2a1e","session_border":"#e0d8bf","status_bar_bg":"#f7f2e6","status_bar_text":"#2e2a1e","ui_accent":"#667433","ui_border":"#e0d8bf","ui_error":"#c65a5a","ui_ok":"#2f8e52","ui_text":"#2e2a1e","ui_tool":"#7a8a3d","ui_warn":"#a17a17"},"description":"Warm sand with olive green","isDark":false,"name":"light-sand","source":"user"},{"category":"Other","colors":{"background":"#f4f0e8","banner_accent":"#687858","banner_border":"#889878","banner_dim":"#a8b098","banner_text":"#384830","banner_title":"#384830","completion_menu_bg":"#f4f0e8","prompt":"#384830","session_border":"#a8b098","shell_dollar":"#587088","status_bar_bg":"#e8e4d8","status_bar_text":"#585848","ui_accent":"#687858","ui_border":"#889878","ui_error":"#905048","ui_ok":"#588050","ui_text":"#384830","ui_tool":"#587088","ui_warn":"#907048"},"description":"Linen fabric — natural flax background with muted sage green and soft clay accents","isDark":false,"name":"linen-sage","source":"user"},{"category":"Other","colors":{"background":"#121216","banner_accent":"#9090a8","banner_border":"#707080","banner_dim":"#383840","banner_text":"#d0d0d8","banner_title":"#c0c0d0","completion_menu_bg":"#121216","prompt":"#d0d0d8","session_border":"#383840","shell_dollar":"#78a0c0","status_bar_bg":"#08080c","status_bar_text":"#888898","ui_accent":"#9090a8","ui_border":"#707080","ui_error":"#b07080","ui_ok":"#78b090","ui_text":"#d0d0d8","ui_tool":"#78a0c0","ui_warn":"#b0a070"},"description":"Mercury runoff — reflective silver, liquid chrome gradients, and deep void black accents","isDark":true,"name":"liquid-silver","source":"user"},{"category":"Other","colors":{"background":"#1a1a2e","banner_accent":"#c8a050","banner_border":"#c8a050","banner_dim":"#504868","banner_text":"#d8d0c8","banner_title":"#e8d080","completion_menu_bg":"#1a1a2e","prompt":"#d8d0c8","session_border":"#504868","shell_dollar":"#7088b0","status_bar_bg":"#121224","status_bar_text":"#a09888","ui_accent":"#c8a050","ui_border":"#504868","ui_error":"#b05850","ui_ok":"#80a870","ui_text":"#d8d0c8","ui_tool":"#7088b0","ui_warn":"#d8a040"},"description":"Late-night coding den — dark indigo, warm gold accents, and soft amber glow","isDark":true,"name":"midnight-studio","source":"user"},{"category":"Minimal","colors":{"background":"#eae6dc","banner_accent":"#696458","banner_border":"#d4cebf","banner_dim":"#6b665c","banner_text":"#2e2b24","banner_title":"#2e2b24","completion_menu_bg":"#dfdbd1","prompt":"#2e2b24","session_border":"#d4cebf","status_bar_bg":"#ece8df","status_bar_text":"#2e2b24","ui_accent":"#696458","ui_border":"#d4cebf","ui_error":"#bc5656","ui_ok":"#2c854d","ui_text":"#2e2b24","ui_tool":"#8a8374","ui_warn":"#977316"},"description":"Warm bone white with stone gray","isDark":false,"name":"minimal-bone","source":"user"},{"category":"Minimal","colors":{"background":"#17181a","banner_accent":"#c3cad2","banner_border":"#26272b","banner_dim":"#8f959c","banner_text":"#e8eaec","banner_title":"#e8eaec","completion_menu_bg":"#242527","prompt":"#e8eaec","session_border":"#26272b","status_bar_bg":"#151617","status_bar_text":"#e8eaec","ui_accent":"#c3cad2","ui_border":"#26272b","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#e8eaec","ui_tool":"#9aa3ad","ui_warn":"#fbbf24"},"description":"Gray monochrome, quiet and precise","isDark":true,"name":"minimal-graphite","source":"user"},{"category":"Other","colors":{"background":"#1c2018","banner_accent":"#788860","banner_border":"#6a7a5a","banner_dim":"#3a4430","banner_text":"#c8d0b8","banner_title":"#90a878","completion_menu_bg":"#1c2018","prompt":"#c8d0b8","session_border":"#3a4430","shell_dollar":"#7098a0","status_bar_bg":"#121610","status_bar_text":"#909880","ui_accent":"#788860","ui_border":"#6a7a5a","ui_error":"#b87060","ui_ok":"#80b870","ui_text":"#c8d0b8","ui_tool":"#7098a0","ui_warn":"#c0a860"},"description":"Cool forest stone — gray-green granite, soft olive, and earthy brown warmth","isDark":true,"name":"moss-stone","source":"user"},{"category":"Nature","colors":{"background":"#1d1710","banner_accent":"#f0c07a","banner_border":"#3a2c1c","banner_dim":"#a89072","banner_text":"#f0e6d8","banner_title":"#f0e6d8","completion_menu_bg":"#2a231c","prompt":"#f0e6d8","session_border":"#3a2c1c","status_bar_bg":"#1a150e","status_bar_text":"#f0e6d8","ui_accent":"#f0c07a","ui_border":"#3a2c1c","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#f0e6d8","ui_tool":"#d99a3d","ui_warn":"#fbbf24"},"description":"Sand dune amber on warm dark","isDark":true,"name":"nature-desert","source":"user"},{"category":"Nature","colors":{"background":"#0f1a12","banner_accent":"#8fe08f","banner_border":"#24382a","banner_dim":"#86a086","banner_text":"#d9ead9","banner_title":"#d9ead9","completion_menu_bg":"#1b261e","prompt":"#d9ead9","session_border":"#24382a","status_bar_bg":"#0e1710","status_bar_text":"#d9ead9","ui_accent":"#8fe08f","ui_border":"#24382a","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#d9ead9","ui_tool":"#4caf50","ui_warn":"#fbbf24"},"description":"Moss and pine, deep green calm","isDark":true,"name":"nature-forest","source":"user"},{"category":"Nature","colors":{"background":"#121a20","banner_accent":"#b7dbe8","banner_border":"#26343e","banner_dim":"#8ba0ad","banner_text":"#dfe8ee","banner_title":"#dfe8ee","completion_menu_bg":"#1e262c","prompt":"#dfe8ee","session_border":"#26343e","status_bar_bg":"#10171d","status_bar_text":"#dfe8ee","ui_accent":"#b7dbe8","ui_border":"#26343e","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#dfe8ee","ui_tool":"#7fb2c5","ui_warn":"#fbbf24"},"description":"Frosted fjord blue-gray","isDark":true,"name":"nature-nordic","source":"user"},{"category":"Other","colors":{"background":"#0a0a0f","banner_accent":"#ff00ff","banner_border":"#ff00ff","banner_dim":"#7d3c98","banner_text":"#e0e0ff","banner_title":"#00ffff","completion_menu_bg":"#0a0a0f","prompt":"#e0e0ff","session_border":"#7d3c98","shell_dollar":"#00ffff","status_bar_bg":"#05050a","status_bar_text":"#c0c0d0","ui_accent":"#ff00ff","ui_border":"#ff00ff","ui_error":"#ff3366","ui_ok":"#00ff88","ui_text":"#e0e0ff","ui_tool":"#00ffff","ui_warn":"#ffaa00"},"description":"Electric ghost in the machine — hot magenta on void black with cyan whispers","isDark":true,"name":"neon-ghost","source":"user"},{"category":"Other","colors":{"background":"#0a1628","banner_accent":"#ffb000","banner_border":"#ffb000","banner_dim":"#4a6a8a","banner_text":"#d0e0f0","banner_title":"#00d4aa","completion_menu_bg":"#0a1628","prompt":"#d0e0f0","session_border":"#4a6a8a","shell_dollar":"#00d4aa","status_bar_bg":"#050e1a","status_bar_text":"#a8b8c8","ui_accent":"#ffb000","ui_border":"#ffb000","ui_error":"#ff3344","ui_ok":"#00d4aa","ui_text":"#d0e0f0","ui_tool":"#00d4aa","ui_warn":"#ffb000"},"description":"Jacked into the mainframe — phosphor amber, digital teal, and alert red on deep navy","isDark":true,"name":"netrunner","source":"user"},{"category":"Other","colors":{"background":"#101012","banner_accent":"#787890","banner_border":"#505870","banner_dim":"#383848","banner_text":"#d8d8e0","banner_title":"#d0d0d8","completion_menu_bg":"#101012","prompt":"#d8d8e0","session_border":"#383848","shell_dollar":"#6090a0","status_bar_bg":"#08080a","status_bar_text":"#888898","ui_accent":"#787890","ui_border":"#505870","ui_error":"#b05850","ui_ok":"#60a070","ui_text":"#d8d8e0","ui_tool":"#6090a0","ui_warn":"#c0a860"},"description":"1940s detective film — stark off-white text on ink-black, with muted navy and rust accents","isDark":true,"name":"newsprint-noir","source":"user"},{"category":"Other","colors":{"background":"#0f0f0f","banner_accent":"#787878","banner_border":"#555555","banner_dim":"#444444","banner_text":"#d0d0d0","banner_title":"#a0a0a0","completion_menu_bg":"#0f0f0f","prompt":"#d0d0d0","session_border":"#444444","shell_dollar":"#6088c0","status_bar_bg":"#080808","status_bar_text":"#a0a0a0","ui_accent":"#787878","ui_border":"#555555","ui_error":"#c05050","ui_ok":"#6aaa64","ui_text":"#d0d0d0","ui_tool":"#6088c0","ui_warn":"#c8a050"},"description":"Polished black glass — cool silver text, slate borders, and crimson alerts on pure darkness","isDark":true,"name":"obsidian","source":"user"},{"category":"Other","colors":{"background":"#201c18","banner_accent":"#e0a080","banner_border":"#d89070","banner_dim":"#584838","banner_text":"#e8d8c8","banner_title":"#f0c8a8","completion_menu_bg":"#201c18","prompt":"#e8d8c8","session_border":"#584838","shell_dollar":"#90b8c0","status_bar_bg":"#141210","status_bar_text":"#a89080","ui_accent":"#e0a080","ui_border":"#d89070","ui_error":"#d07068","ui_ok":"#90c090","ui_text":"#e8d8c8","ui_tool":"#90b8c0","ui_warn":"#e0b870"},"description":"Pantone Color of the Year 2024 — soft peach, warm coral, and gentle cream on dark taupe","isDark":true,"name":"peach-fuzz","source":"user"},{"category":"Other","colors":{"background":"#0a0a0a","banner_accent":"#ff4400","banner_border":"#cc2222","banner_dim":"#662222","banner_text":"#e8e0e0","banner_title":"#ffffff","completion_menu_bg":"#0a0a0a","prompt":"#e8e0e0","session_border":"#662222","shell_dollar":"#ff6644","status_bar_bg":"#050505","status_bar_text":"#a88888","ui_accent":"#ff4400","ui_border":"#cc2222","ui_error":"#ff2222","ui_ok":"#44cc44","ui_text":"#e8e0e0","ui_tool":"#ff6644","ui_warn":"#ff8800"},"description":"Klaxon warning — deep crimson, hazard orange, and cold white on near-black, urgent but clean","isDark":true,"name":"red-alert","source":"user"},{"category":"Other","colors":{"background":"#1e1814","banner_accent":"#8a7050","banner_border":"#6b8a5a","banner_dim":"#4a3828","banner_text":"#d8d0c0","banner_title":"#a0c080","completion_menu_bg":"#1e1814","prompt":"#d8d0c0","session_border":"#4a3828","shell_dollar":"#80a868","status_bar_bg":"#14100c","status_bar_text":"#a09880","ui_accent":"#8a7050","ui_border":"#6b8a5a","ui_error":"#b87050","ui_ok":"#90b870","ui_text":"#d8d0c0","ui_tool":"#80a868","ui_warn":"#c8a050"},"description":"Ancient forest floor — deep bark brown, moss green, and dappled amber light","isDark":true,"name":"redwood","source":"user"},{"category":"Retro","colors":{"background":"#150d04","banner_accent":"#ffc37d","banner_border":"#3a2810","banner_dim":"#a07c45","banner_text":"#ffe8c8","banner_title":"#ffe8c8","completion_menu_bg":"#231a10","prompt":"#ffe8c8","session_border":"#3a2810","status_bar_bg":"#130c04","status_bar_text":"#ffe8c8","ui_accent":"#ffc37d","ui_border":"#3a2810","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#ffe8c8","ui_tool":"#ff9d2e","ui_warn":"#fbbf24"},"description":"Amber CRT glow on near-black","isDark":true,"name":"retro-amber","source":"user"},{"category":"Retro","colors":{"background":"#04081a","banner_accent":"#8ccaff","banner_border":"#122452","banner_dim":"#6a86b0","banner_text":"#d6e6ff","banner_title":"#d6e6ff","completion_menu_bg":"#111528","prompt":"#d6e6ff","session_border":"#122452","status_bar_bg":"#040717","status_bar_text":"#d6e6ff","ui_accent":"#8ccaff","ui_border":"#122452","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#d6e6ff","ui_tool":"#44aaff","ui_warn":"#fbbf24"},"description":"Commodore-style bright blue","isDark":true,"name":"retro-blue","source":"user"},{"category":"Retro","colors":{"background":"#0a1208","banner_accent":"#7dffa8","banner_border":"#17331c","banner_dim":"#5f8f6a","banner_text":"#c8ffd5","banner_title":"#c8ffd5","completion_menu_bg":"#152014","prompt":"#c8ffd5","session_border":"#17331c","status_bar_bg":"#091007","status_bar_text":"#c8ffd5","ui_accent":"#7dffa8","ui_border":"#17331c","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#c8ffd5","ui_tool":"#33ff66","ui_warn":"#fbbf24"},"description":"Classic green phosphor terminal","isDark":true,"name":"retro-terminal","source":"user"},{"category":"Other","colors":{"background":"#fafaf5","banner_accent":"#cc3333","banner_border":"#888888","banner_dim":"#aaaaaa","banner_text":"#1a1a1a","banner_title":"#1a1a1a","completion_menu_bg":"#fafaf5","prompt":"#1a1a1a","session_border":"#aaaaaa","shell_dollar":"#336688","status_bar_bg":"#efefe8","status_bar_text":"#555555","ui_accent":"#cc3333","ui_border":"#888888","ui_error":"#cc3333","ui_ok":"#408040","ui_text":"#1a1a1a","ui_tool":"#336688","ui_warn":"#aa6622"},"description":"Japanese washi — off-white paper, sumi ink black, and a single vermilion accent","isDark":false,"name":"rice-paper","source":"user"},{"category":"Other","colors":{"background":"#1e1a14","banner_accent":"#c87840","banner_border":"#b89060","banner_dim":"#5a4030","banner_text":"#e8dcc8","banner_title":"#d8b880","completion_menu_bg":"#1e1a14","prompt":"#e8dcc8","session_border":"#5a4030","shell_dollar":"#80a0c0","status_bar_bg":"#14100c","status_bar_text":"#b0a080","ui_accent":"#c87840","ui_border":"#b89060","ui_error":"#b05838","ui_ok":"#80a860","ui_text":"#e8dcc8","ui_tool":"#80a0c0","ui_warn":"#d8a040"},"description":"Desert canyon at golden hour — warm terracotta, pale sand, and deep shadowed rust","isDark":true,"name":"sandstone","source":"user"},{"category":"Other","colors":{"background":"#1a201e","banner_accent":"#78b898","banner_border":"#68a890","banner_dim":"#385848","banner_text":"#c8e0d8","banner_title":"#90d0b8","completion_menu_bg":"#1a201e","prompt":"#c8e0d8","session_border":"#385848","shell_dollar":"#80b8c8","status_bar_bg":"#101614","status_bar_text":"#88a098","ui_accent":"#78b898","ui_border":"#68a890","ui_error":"#d08880","ui_ok":"#90d0a0","ui_text":"#c8e0d8","ui_tool":"#80b8c8","ui_warn":"#d0b880"},"description":"Tide pool at dawn — soft seafoam green, pale sand, and gentle coral on dark teal-gray","isDark":true,"name":"seafoam-silk","source":"user"},{"category":"Other","colors":{"background":"#101014","banner_accent":"#50a8a8","banner_border":"#4a4060","banner_dim":"#2a2838","banner_text":"#b0b0c0","banner_title":"#8898b0","completion_menu_bg":"#101014","prompt":"#b0b0c0","session_border":"#2a2838","shell_dollar":"#50a8a8","status_bar_bg":"#08080c","status_bar_text":"#787888","ui_accent":"#50a8a8","ui_border":"#4a4060","ui_error":"#a05060","ui_ok":"#50a070","ui_text":"#b0b0c0","ui_tool":"#50a8a8","ui_warn":"#a09050"},"description":"Rogue's night — matte black, muted plum, and silver-steel with a glint of cyan","isDark":true,"name":"shadow-thief","source":"user"},{"category":"Other","colors":{"background":"#1a1410","banner_accent":"#907040","banner_border":"#705830","banner_dim":"#3a2818","banner_text":"#d0c0a0","banner_title":"#c09860","completion_menu_bg":"#1a1410","prompt":"#d0c0a0","session_border":"#3a2818","shell_dollar":"#80a090","status_bar_bg":"#0e0a08","status_bar_text":"#907850","ui_accent":"#907040","ui_border":"#705830","ui_error":"#a06040","ui_ok":"#80a060","ui_text":"#d0c0a0","ui_tool":"#80a090","ui_warn":"#c09860"},"description":"Warm whiskey in a dark room — amber on deep brown-black, one color, perfectly restrained","isDark":true,"name":"single-malt","source":"user"},{"category":"Other","colors":{"background":"#1c1e22","banner_accent":"#687488","banner_border":"#444a54","banner_dim":"#343a44","banner_text":"#c0c4cc","banner_title":"#a0a8b4","completion_menu_bg":"#1c1e22","prompt":"#c0c4cc","session_border":"#343a44","shell_dollar":"#687488","status_bar_bg":"#121418","status_bar_text":"#808488","ui_accent":"#687488","ui_border":"#444a54","ui_error":"#907a7a","ui_ok":"#7a907a","ui_text":"#c0c4cc","ui_tool":"#687488","ui_warn":"#908a70"},"description":"Fogged window — soft blue-gray monochrome with barely-there contrast, calm and quiet","isDark":true,"name":"slate-mist","source":"user"},{"category":"Other","colors":{"background":"#002b36","banner_accent":"#cb4b16","banner_border":"#b58900","banner_dim":"#586e75","banner_text":"#eee8d5","banner_title":"#fdf6e3","completion_menu_bg":"#002b36","prompt":"#eee8d5","session_border":"#586e75","shell_dollar":"#268bd2","status_bar_bg":"#001b24","status_bar_text":"#839496","ui_accent":"#cb4b16","ui_border":"#b58900","ui_error":"#dc322f","ui_ok":"#859900","ui_text":"#eee8d5","ui_tool":"#268bd2","ui_warn":"#b58900"},"description":"Intense dark solarized — deep navy background with blazing amber, cyan, and magenta signals","isDark":true,"name":"solar-flare","source":"user"},{"category":"Other","colors":{"background":"#141420","banner_accent":"#50a0d0","banner_border":"#c0a050","banner_dim":"#383848","banner_text":"#d8d0c8","banner_title":"#e07050","completion_menu_bg":"#141420","prompt":"#d8d0c8","session_border":"#383848","shell_dollar":"#50a0d0","status_bar_bg":"#0a0a14","status_bar_text":"#908878","ui_accent":"#50a0d0","ui_border":"#c0a050","ui_error":"#c05050","ui_ok":"#60b870","ui_text":"#d8d0c8","ui_tool":"#50a0d0","ui_warn":"#c0a050"},"description":"Cathedral window — jewel tones of sapphire, ruby, emerald, and amber on dark lead","isDark":true,"name":"stained-glass","source":"user"},{"category":"Other","colors":{"background":"#18181a","banner_accent":"#707078","banner_border":"#4a4a50","banner_dim":"#343438","banner_text":"#c0c0c8","banner_title":"#a0a0a8","completion_menu_bg":"#18181a","prompt":"#c0c0c8","session_border":"#343438","shell_dollar":"#7088a0","status_bar_bg":"#0e0e10","status_bar_text":"#808088","ui_accent":"#707078","ui_border":"#4a4a50","ui_error":"#a07070","ui_ok":"#78a078","ui_text":"#c0c0c8","ui_tool":"#7088a0","ui_warn":"#a09860"},"description":"Machined metal — cool, precise silver on dark gunmetal with zero warmth","isDark":true,"name":"steel-thread","source":"user"},{"category":"Other","colors":{"background":"#2a2418","banner_accent":"#a08860","banner_border":"#8a7850","banner_dim":"#5a4a30","banner_text":"#e0d8c0","banner_title":"#c8b890","completion_menu_bg":"#2a2418","prompt":"#e0d8c0","session_border":"#5a4a30","shell_dollar":"#80a090","status_bar_bg":"#1a1810","status_bar_text":"#a09870","ui_accent":"#a08860","ui_border":"#8a7850","ui_error":"#b05840","ui_ok":"#80a060","ui_text":"#e0d8c0","ui_tool":"#80a090","ui_warn":"#c0a050"},"description":"Aged manuscript — warm cream paper background with faded ink, sepia accents, and soft rust","isDark":true,"name":"typewriter-cream","source":"user"},{"category":"Other","colors":{"background":"#1a1a28","banner_accent":"#ff6ac1","banner_border":"#ff6ac1","banner_dim":"#5a4a7a","banner_text":"#d8d8f0","banner_title":"#66d9ef","completion_menu_bg":"#1a1a28","prompt":"#d8d8f0","session_border":"#5a4a7a","shell_dollar":"#66d9ef","status_bar_bg":"#101018","status_bar_text":"#9898b0","ui_accent":"#ff6ac1","ui_border":"#ff6ac1","ui_error":"#f92672","ui_ok":"#a6e22e","ui_text":"#d8d8f0","ui_tool":"#66d9ef","ui_warn":"#e6db74"},"description":"Abandoned 90s shopping mall — seafoam, mauve, and chrome on checkerboard dark","isDark":true,"name":"vaporwave-mall","source":"user"},{"category":"Vibrant","colors":{"background":"#081420","banner_accent":"#6dffce","banner_border":"#123044","banner_dim":"#7fa3c9","banner_text":"#e0f7ef","banner_title":"#e0f7ef","completion_menu_bg":"#15222c","prompt":"#e0f7ef","session_border":"#123044","status_bar_bg":"#07121d","status_bar_text":"#e0f7ef","ui_accent":"#6dffce","ui_border":"#123044","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#e0f7ef","ui_tool":"#00e5a0","ui_warn":"#fbbf24"},"description":"Electric green on deep teal-black","isDark":true,"name":"vibrant-neon","source":"user"},{"category":"Vibrant","colors":{"background":"#06202b","banner_accent":"#66e0ff","banner_border":"#0f3a4a","banner_dim":"#7fb4c4","banner_text":"#d9f4ff","banner_title":"#d9f4ff","completion_menu_bg":"#132d38","prompt":"#d9f4ff","session_border":"#0f3a4a","status_bar_bg":"#051d27","status_bar_text":"#d9f4ff","ui_accent":"#66e0ff","ui_border":"#0f3a4a","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#d9f4ff","ui_tool":"#00b4d8","ui_warn":"#fbbf24"},"description":"Tropical lagoon cyan on deep sea","isDark":true,"name":"vibrant-pacific","source":"user"},{"category":"Vibrant","colors":{"background":"#1e0f1f","banner_accent":"#ffb37d","banner_border":"#43283a","banner_dim":"#c08a8a","banner_text":"#ffe9e0","banner_title":"#ffe9e0","completion_menu_bg":"#2c1c2b","prompt":"#ffe9e0","session_border":"#43283a","status_bar_bg":"#1b0e1c","status_bar_text":"#ffe9e0","ui_accent":"#ffb37d","ui_border":"#43283a","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#ffe9e0","ui_tool":"#ff6b35","ui_warn":"#fbbf24"},"description":"Burnt orange and rose dusk","isDark":true,"name":"vibrant-sunset","source":"user"},{"category":"Vibrant","colors":{"background":"#1a0b2e","banner_accent":"#ff8ac0","banner_border":"#3c1f5c","banner_dim":"#b78fd4","banner_text":"#f5e9ff","banner_title":"#f5e9ff","completion_menu_bg":"#27183b","prompt":"#f5e9ff","session_border":"#3c1f5c","status_bar_bg":"#170a29","status_bar_text":"#f5e9ff","ui_accent":"#ff8ac0","ui_border":"#3c1f5c","ui_error":"#f87171","ui_ok":"#4ade80","ui_text":"#f5e9ff","ui_tool":"#ff2e88","ui_warn":"#fbbf24"},"description":"Retro synthwave, hot pink on violet","isDark":true,"name":"vibrant-synthwave","source":"user"},{"category":"Other","colors":{"background":"#1a1030","banner_accent":"#ff5fd2","banner_border":"#ff5fd2","banner_dim":"#7a5fa0","banner_text":"#e6d8f0","banner_title":"#ffb870","completion_menu_bg":"#1a1030","prompt":"#e6d8f0","session_border":"#7a5fa0","shell_dollar":"#5af7b0","status_bar_bg":"#0f0820","status_bar_text":"#c8b8d8","ui_accent":"#ff5fd2","ui_border":"#ffb870","ui_error":"#ff5fd2","ui_ok":"#5af7b0","ui_text":"#e6d8f0","ui_tool":"#5af7b0","ui_warn":"#ffb870"},"description":"Neon sunset bleeding into a dead channel — violet, tangerine, and seafoam on bruised plum","isDark":true,"name":"void-sunset","source":"user"},{"category":"Other","colors":{"background":"#1e1c18","banner_accent":"#786858","banner_border":"#504840","banner_dim":"#3a3430","banner_text":"#c8c0b8","banner_title":"#b0a898","completion_menu_bg":"#1e1c18","prompt":"#c8c0b8","session_border":"#3a3430","shell_dollar":"#7098a0","status_bar_bg":"#141210","status_bar_text":"#888070","ui_accent":"#786858","ui_border":"#504840","ui_error":"#987060","ui_ok":"#809868","ui_text":"#c8c0b8","ui_tool":"#7098a0","ui_warn":"#988850"},"description":"Fireplace embers gone cold — a warm gray monochrome with the faintest amber memory","isDark":true,"name":"warm-ash","source":"user"},{"category":"Other","colors":{"background":"#f8f0e0","banner_accent":"#5a4040","banner_border":"#8a7058","banner_dim":"#a89880","banner_text":"#3a2818","banner_title":"#3a2818","completion_menu_bg":"#f8f0e0","prompt":"#3a2818","session_border":"#a89880","shell_dollar":"#486880","status_bar_bg":"#efe4d0","status_bar_text":"#5a4838","ui_accent":"#5a4040","ui_border":"#8a7058","ui_error":"#883838","ui_ok":"#406840","ui_text":"#3a2818","ui_tool":"#486880","ui_warn":"#886838"},"description":"Old book page — warm cream background with dark sepia text and faded indigo accents","isDark":false,"name":"warm-parchment","source":"user"},{"category":"Other","colors":{"background":"#000000","banner_accent":"#ffff00","banner_border":"#ffffff","banner_dim":"#888888","banner_text":"#ffffff","banner_title":"#ffffff","completion_menu_bg":"#080808","prompt":"#ffffff","session_border":"#888888","shell_dollar":"#00ffff","status_bar_bg":"#000000","status_bar_text":"#cccccc","ui_accent":"#ffff00","ui_border":"#ffffff","ui_error":"#ff0000","ui_ok":"#00ff00","ui_text":"#ffffff","ui_tool":"#00ffff","ui_warn":"#ffff00"},"description":"Maximum readability — pure white text on pure black, with electric yellow and cyan signals","isDark":true,"name":"white-flash","source":"user"},{"category":"Built-in","colors":{"banner_accent":"#FFBF00","banner_border":"#CD7F32","banner_dim":"#B8860B","banner_text":"#FFF8DC","banner_title":"#FFD700","completion_menu_bg":"#1a1a2e","prompt":"#FFF8DC","session_border":"#8B8682","shell_dollar":"#4dabf7","status_bar_bg":"#1a1a2e","status_bar_text":"#C0C0C0","ui_accent":"#FFBF00","ui_error":"#ef5350","ui_ok":"#4caf50","ui_warn":"#ffa726"},"description":"Classic Hermes — gold and kawaii","isDark":true,"name":"default","source":"builtin"},{"category":"Built-in","colors":{"banner_accent":"#DD4A3A","banner_border":"#A93333","banner_dim":"#905151","banner_text":"#F1E6CF","banner_title":"#C7A96B","completion_menu_bg":"#2A1212","prompt":"#F1E6CF","session_border":"#6E584B","shell_dollar":"#DD4A3A","status_bar_bg":"#2A1212","status_bar_text":"#F1E6CF","ui_accent":"#DD4A3A","ui_error":"#ef5350","ui_ok":"#4caf50","ui_warn":"#ffa726"},"description":"War-god theme — crimson and bronze","isDark":true,"name":"ares","source":"builtin"},{"category":"Built-in","colors":{"banner_accent":"#aaaaaa","banner_border":"#5E5E5E","banner_dim":"#606060","banner_text":"#c9d1d9","banner_title":"#e6edf3","completion_menu_bg":"#1F1F1F","prompt":"#c9d1d9","session_border":"#5E5E5E","shell_dollar":"#aaaaaa","status_bar_bg":"#1F1F1F","status_bar_text":"#C9D1D9","ui_accent":"#aaaaaa","ui_error":"#cccccc","ui_ok":"#888888","ui_warn":"#999999"},"description":"Monochrome — clean grayscale","isDark":true,"name":"mono","source":"builtin"},{"category":"Built-in","colors":{"banner_accent":"#8EA8FF","banner_border":"#4169e1","banner_dim":"#545E6B","banner_text":"#c9d1d9","banner_title":"#7eb8f6","completion_menu_bg":"#151C2F","prompt":"#c9d1d9","session_border":"#545E6B","shell_dollar":"#7eb8f6","status_bar_bg":"#151C2F","status_bar_text":"#C9D1D9","ui_accent":"#7eb8f6","ui_error":"#F7A072","ui_ok":"#63D0A6","ui_warn":"#e6a855"},"description":"Cool blue — developer-focused","isDark":true,"name":"slate","source":"builtin"},{"category":"Built-in","colors":{"banner_accent":"#1D4ED8","banner_border":"#2563EB","banner_dim":"#475569","banner_text":"#111827","banner_title":"#0F172A","completion_menu_bg":"#F8FAFC","prompt":"#111827","session_border":"#64748B","shell_dollar":"#2563EB","status_bar_bg":"#E5EDF8","status_bar_text":"#111827","ui_accent":"#2563EB","ui_error":"#B91C1C","ui_ok":"#15803D","ui_warn":"#B45309"},"description":"Light theme for bright terminals with dark text and cool blue accents","isDark":true,"name":"daylight","source":"builtin"},{"category":"Built-in","colors":{"banner_accent":"#8B4513","banner_border":"#8B6914","banner_dim":"#8B7355","banner_text":"#2C1810","banner_title":"#5C3D11","completion_menu_bg":"#F5EFE0","prompt":"#2C1810","session_border":"#A0845C","shell_dollar":"#8B4513","status_bar_bg":"#F5F0E8","status_bar_text":"#2C1810","ui_accent":"#8B4513","ui_error":"#C62828","ui_ok":"#2E7D32","ui_warn":"#E65100"},"description":"Warm light mode — dark brown/gold text for light terminal backgrounds","isDark":true,"name":"warm-lightmode","source":"builtin"},{"category":"Built-in","colors":{"banner_accent":"#5DB8F5","banner_border":"#2A6FB9","banner_dim":"#44638F","banner_text":"#EAF7FF","banner_title":"#A9DFFF","completion_menu_bg":"#0F2440","prompt":"#EAF7FF","session_border":"#496884","shell_dollar":"#5DB8F5","status_bar_bg":"#0F2440","status_bar_text":"#EAF7FF","ui_accent":"#5DB8F5","ui_error":"#ef5350","ui_ok":"#4caf50","ui_warn":"#ffa726"},"description":"Ocean-god theme — deep blue and seafoam","isDark":true,"name":"poseidon","source":"builtin"},{"category":"Built-in","colors":{"banner_accent":"#E7E7E7","banner_border":"#B7B7B7","banner_dim":"#5C5C5C","banner_text":"#D3D3D3","banner_title":"#F5F5F5","completion_menu_bg":"#202020","prompt":"#F5F5F5","session_border":"#656565","shell_dollar":"#E7E7E7","status_bar_bg":"#202020","status_bar_text":"#D3D3D3","ui_accent":"#E7E7E7","ui_error":"#E7E7E7","ui_ok":"#919191","ui_warn":"#B7B7B7"},"description":"Sisyphean theme — austere grayscale with persistence","isDark":true,"name":"sisyphus","source":"builtin"},{"category":"Built-in","colors":{"banner_accent":"#F29C38","banner_border":"#C75B1D","banner_dim":"#C58A45","banner_text":"#FFF0D4","banner_title":"#FFD39A","completion_menu_bg":"#0B0503","prompt":"#FFF0D4","session_border":"#7B593A","shell_dollar":"#F29C38","status_bar_bg":"#2B160E","status_bar_text":"#FFF0D4","ui_accent":"#F29C38","ui_error":"#ef5350","ui_ok":"#4caf50","ui_warn":"#ffa726"},"description":"Volcanic theme — burnt orange and ember","isDark":true,"name":"charizard","source":"builtin"}]

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
