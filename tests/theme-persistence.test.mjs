import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const USER_THEMES_KEY = 'hermes-desktop-user-themes-v1'
const pluginPath = new URL('../plugin/plugin.js', import.meta.url)

function loadPlugin(storage, exposeTestHelpers = false, requestHandler = null, profileGetter = () => 'default') {
  return readFile(pluginPath, 'utf8').then(source => {
    let executable = source
      .replace(/import\s+\{[\s\S]*?\}\s+from\s+'@hermes\/plugin-sdk'\n/, '')
      .replace(/import\s+\{[^}]*\}\s+from\s+'react\/jsx-runtime'\n/, '')
      .replace(/import\s+\{[^}]*\}\s+from\s+'react'\n/, '')
      .replace('export default {', 'globalThis.plugin = {')
    if (exposeTestHelpers) {
      executable += '\nglobalThis.testHelpers = { columnsForWidth, buildThemeGroups, persistAppearance, sceneNameFor, sceneToDesktopTheme, desktopModeFor, applyScene, scenes: SKINS }\n'
    }

    const css = new Map()
    const state = { reloads: 0, active: null, notifications: [], requests: [], css, root: null }
    const root = {
      dataset: {},
      style: {
        setProperty: (key, value) => css.set(key, value),
        getPropertyValue: key => css.get(key) ?? ''
      },
      classList: { toggle: (name, enabled) => { state.darkClass = name === 'dark' && enabled } }
    }
    state.root = root
    const context = {
      console,
      globalThis: null,
      document: {
        documentElement: root,
        head: { appendChild: () => {} },
        createElement: () => ({ dataset: {} })
      },
      haptic: () => {},
      host: {
        notify: value => state.notifications.push(value),
        onEvent: () => () => {},
        request: (method, payload) => {
          state.requests.push({ method, payload })
          return requestHandler ? requestHandler(method, payload) : Promise.resolve({})
        },
        state: { profile: { get: profileGetter } }
      },
      PALETTE_AREA: 'palette',
      ROUTES_AREA: 'routes',
      SIDEBAR_NAV_AREA: 'sidebar-nav',
      STATUSBAR_AREAS: { right: 'statusbar-right' },
      THEMES_AREA: 'themes',
      window: {
        hermesDesktop: {},
        location: { reload: () => { state.reloads += 1 } },
        localStorage: {
          getItem: key => storage.get(key) ?? null,
          setItem: (key, value) => storage.set(key, value)
        },
        setTimeout: fn => fn()
      }
    }
    context.globalThis = context
    vm.runInNewContext(executable, context, { filename: 'plugin.js' })
    context.plugin.__test = context.testHelpers
    context.plugin.__state = state
    return context.plugin
  })
}

test('registering the picker seeds every contributed skin for boot-time theme resolution', async () => {
  const storage = new Map()
  const plugin = await loadPlugin(storage)
  const contributed = []

  plugin.register({
    register: contribution => {
      if (contribution.id.startsWith('theme:')) contributed.push(contribution.data)
    }
  })

  const persisted = JSON.parse(storage.get(USER_THEMES_KEY) ?? '{}')
  assert.ok(contributed.length > 0)
  for (const theme of contributed) {
    assert.equal(JSON.stringify(persisted[theme.name]), JSON.stringify(theme))
    assert.ok(['background', 'foreground', 'primary'].every(key => typeof persisted[theme.name].colors[key] === 'string'))
  }
})

test('registration upgrades legacy single-palette picker themes to dynamic scenes', async () => {
  const catalog = await loadPlugin(new Map(), true)
  const scene = catalog.__test.scenes.find(item => item.name === 'shadow-thief')
  const expected = catalog.__test.sceneToDesktopTheme(scene)
  assert.equal(expected.darkColors.input, '#101014')
  const legacy = {
    'shadow-thief': {
      name: 'shadow-thief',
      label: 'Shadow-thief',
      description: scene.description,
      colors: expected.darkColors,
      darkColors: expected.darkColors
    }
  }
  const storage = new Map([[USER_THEMES_KEY, JSON.stringify(legacy)]])
  const plugin = await loadPlugin(storage)

  plugin.register({ register: () => {} })

  const upgraded = JSON.parse(storage.get(USER_THEMES_KEY))['shadow-thief']
  assert.equal(upgraded.themePickerManaged, true)
  assert.notEqual(upgraded.colors.background, upgraded.darkColors.background)
})

test('registration preserves dark mode when upgrading a selected canonical dark source theme', async () => {
  const catalog = await loadPlugin(new Map(), true)
  const scene = catalog.__test.scenes.find(item => item.name === 'dark-aubergine')
  const combined = catalog.__test.sceneToDesktopTheme(scene)
  const legacy = {
    ...combined,
    label: 'Dark-aubergine',
    colors: combined.darkColors,
    darkColors: combined.darkColors,
    themePickerManaged: undefined
  }
  const storage = new Map([
    [USER_THEMES_KEY, JSON.stringify({ 'dark-aubergine': legacy })],
    ['hermes-desktop-theme-v2', 'dark-aubergine'],
    ['hermes-desktop-mode-v1', 'light'],
    ['hermes-desktop-profile-themes-v1', JSON.stringify({ work: 'dark-aubergine' })],
    ['hermes-desktop-profile-modes-v1', JSON.stringify({ work: 'light' })]
  ])
  const plugin = await loadPlugin(storage)

  plugin.register({ register: () => {} })

  assert.equal(storage.get('hermes-desktop-theme-v2'), 'dark-aubergine')
  assert.equal(storage.get('hermes-desktop-mode-v1'), 'dark')
  assert.equal(JSON.parse(storage.get('hermes-desktop-profile-modes-v1')).work, 'dark')
  const upgraded = JSON.parse(storage.get(USER_THEMES_KEY))['dark-aubergine']
  assert.notEqual(upgraded.colors.background, upgraded.darkColors.background)
})

test('registration does not force a current combined scene from light to dark', async () => {
  const catalog = await loadPlugin(new Map(), true)
  const scene = catalog.__test.scenes.find(item => item.name === 'dark-aubergine')
  const combined = catalog.__test.sceneToDesktopTheme(scene)
  const storage = new Map([
    [USER_THEMES_KEY, JSON.stringify({ 'dark-aubergine': combined })],
    ['hermes-desktop-theme-v2', 'dark-aubergine'],
    ['hermes-desktop-mode-v1', 'light']
  ])
  const plugin = await loadPlugin(storage)

  plugin.register({ register: () => {} })

  assert.equal(storage.get('hermes-desktop-theme-v2'), 'dark-aubergine')
  assert.equal(storage.get('hermes-desktop-mode-v1'), 'light')
})

test('registration never overwrites an unrelated single-palette user import', async () => {
  const palette = { background: '#111111', foreground: '#eeeeee' }
  const imported = {
    name: 'dark-aubergine',
    label: 'My Aubergine',
    description: 'Personal imported theme',
    colors: palette,
    darkColors: palette
  }
  const storage = new Map([[USER_THEMES_KEY, JSON.stringify({
    'dark-aubergine': imported
  })]])
  const plugin = await loadPlugin(storage)

  plugin.register({ register: () => {} })

  const cached = JSON.parse(storage.get(USER_THEMES_KEY))
  assert.deepEqual(cached['dark-aubergine'], imported)
})

test('legacy migration never overwrites a same-signature user import with a different palette', async () => {
  const catalog = await loadPlugin(new Map(), true)
  const scene = catalog.__test.scenes.find(item => item.name === 'dark-aubergine')
  const combined = catalog.__test.sceneToDesktopTheme(scene)
  const palette = { ...combined.darkColors, background: '#123456', foreground: '#fedcba' }
  const imported = {
    ...combined,
    label: 'Dark-aubergine',
    colors: palette,
    darkColors: palette,
    themePickerManaged: undefined
  }
  const storage = new Map([
    [USER_THEMES_KEY, JSON.stringify({ 'dark-aubergine': imported })],
    ['hermes-desktop-theme-v2', 'dark-aubergine'],
    ['hermes-desktop-mode-v1', 'light'],
    ['hermes-desktop-profile-themes-v1', JSON.stringify({ work: 'dark-aubergine' })],
    ['hermes-desktop-profile-modes-v1', JSON.stringify({ work: 'light' })]
  ])
  const plugin = await loadPlugin(storage)

  plugin.register({ register: () => {} })

  assert.equal(storage.get('hermes-desktop-mode-v1'), 'light')
  assert.equal(JSON.parse(storage.get('hermes-desktop-profile-modes-v1')).work, 'light')
  assert.deepEqual(
    JSON.parse(storage.get(USER_THEMES_KEY))['dark-aubergine'],
    JSON.parse(JSON.stringify(imported))
  )
})

test('registration migrates a selected variant to its dynamic scene and mode', async () => {
  const storage = new Map([
    ['hermes-desktop-theme-v2', 'light-lilac'],
    ['hermes-desktop-mode-v1', 'dark']
  ])
  const plugin = await loadPlugin(storage)

  plugin.register({ register: () => {} })

  assert.equal(storage.get('hermes-desktop-theme-v2'), 'shadow-thief')
  assert.equal(storage.get('hermes-desktop-mode-v1'), 'light')
})

test('registration migrates a gateway transport variant back to its dynamic scene', async () => {
  const storage = new Map([
    ['hermes-desktop-theme-v2', 'theme-picker-nous-dark'],
    ['hermes-desktop-mode-v1', 'light']
  ])
  const plugin = await loadPlugin(storage)

  plugin.register({ register: () => {} })

  assert.equal(storage.get('hermes-desktop-theme-v2'), 'nous')
  assert.equal(storage.get('hermes-desktop-mode-v1'), 'dark')
})

test('active variant names resolve to their dynamic scene card', async () => {
  const plugin = await loadPlugin(new Map(), true)

  assert.equal(plugin.__test.sceneNameFor('light-lilac'), 'shadow-thief')
  assert.equal(plugin.__test.sceneNameFor('shadow-thief'), 'shadow-thief')
  assert.equal(plugin.__test.sceneNameFor('theme-picker-nous-light'), 'nous')
  assert.equal(plugin.__test.sceneNameFor('theme-picker-nous-dark'), 'nous')
  assert.equal(plugin.__test.sceneNameFor('unknown-theme'), 'unknown-theme')
})

test('responsive columns step down from four to three to two', async () => {
  const storage = new Map()
  const plugin = await loadPlugin(storage, true)
  const { columnsForWidth } = plugin.__test

  assert.equal(columnsForWidth(1200), 4)
  assert.equal(columnsForWidth(720), 3)
  assert.equal(columnsForWidth(480), 2)
})

test('themes are grouped as dynamic, dark-only, then light-only', async () => {
  const storage = new Map()
  const plugin = await loadPlugin(storage, true)
  const { buildThemeGroups } = plugin.__test
  const groups = buildThemeGroups([
    { name: 'light', modeSupport: 'light' },
    { name: 'dynamic', modeSupport: 'dynamic' },
    { name: 'dark', modeSupport: 'dark' }
  ])

  assert.deepEqual(
    Array.from(groups, group => group.title),
    ['Dynamic Scenes', 'Dark Mode Only', 'Light Mode Only']
  )
  assert.deepEqual(Array.from(groups, group => group.scenes[0].name), ['dynamic', 'dark', 'light'])
})

test('appearance persistence stores theme and explicit mode for the active profile', async () => {
  const storage = new Map()
  const plugin = await loadPlugin(storage, true)

  plugin.__test.persistAppearance('dark-example', 'dark', 'work')

  assert.deepEqual(JSON.parse(storage.get('hermes-desktop-profile-themes-v1')), { work: 'dark-example' })
  assert.deepEqual(JSON.parse(storage.get('hermes-desktop-profile-modes-v1')), { work: 'dark' })
})

test('desktop mode follows the rendered mode and falls back to the active profile', async () => {
  const storage = new Map([
    ['hermes-desktop-profile-modes-v1', JSON.stringify({ work: 'dark' })]
  ])
  const plugin = await loadPlugin(storage, true)

  assert.equal(plugin.__test.desktopModeFor('work', undefined), 'dark')
  assert.equal(plugin.__test.desktopModeFor('work', 'light'), 'light')
})

test('applying a scene repaints in place without reloading or leaving the picker', async () => {
  const storage = new Map()
  const plugin = await loadPlugin(storage, true)
  const scene = plugin.__test.scenes.find(item => item.name === 'shadow-thief')
  let active = null

  plugin.__test.applyScene(scene, 'dark', value => { active = value })

  assert.equal(plugin.__state.reloads, 0)
  assert.equal(active, 'shadow-thief')
  assert.equal(plugin.__state.root.dataset.hermesTheme, 'shadow-thief')
  assert.equal(plugin.__state.root.dataset.hermesMode, 'dark')
  assert.ok(plugin.__state.css.has('--theme-primary'))
  assert.equal(storage.get('hermes-desktop-theme-v2'), 'shadow-thief')
  assert.equal(storage.get('hermes-desktop-mode-v1'), 'dark')
})

test('applying a dynamic scene immediately repaints locally and synchronizes its selected variant through the gateway', async () => {
  const plugin = await loadPlugin(new Map(), true)
  const scene = plugin.__test.scenes.find(item => item.name === 'shadow-thief')

  const darkSync = plugin.__test.applyScene(scene, 'dark', () => {})
  assert.equal(plugin.__state.root.dataset.hermesTheme, 'shadow-thief')
  await darkSync

  const lightSync = plugin.__test.applyScene(scene, 'light', () => {})
  assert.equal(plugin.__state.root.dataset.hermesMode, 'light')
  await lightSync

  assert.deepEqual(
    JSON.parse(JSON.stringify(plugin.__state.requests)),
    [
      { method: 'config.set', payload: { key: 'skin', value: 'theme-picker-shadow-thief-dark' } },
      { method: 'config.set', payload: { key: 'skin', value: 'theme-picker-shadow-thief-light' } }
    ]
  )
  assert.equal(plugin.__state.reloads, 0)
  assert.deepEqual(plugin.__state.notifications, [])
})

test('rapid scene changes preserve gateway request order while repainting locally immediately', async () => {
  let releaseFirst
  let requestCount = 0
  const firstRequest = new Promise(resolve => { releaseFirst = resolve })
  const plugin = await loadPlugin(new Map(), true, () => {
    requestCount += 1
    return requestCount === 1 ? firstRequest : Promise.resolve({})
  })
  const scene = plugin.__test.scenes.find(item => item.name === 'shadow-thief')

  const darkSync = plugin.__test.applyScene(scene, 'dark', () => {})
  const lightSync = plugin.__test.applyScene(scene, 'light', () => {})

  assert.equal(plugin.__state.root.dataset.hermesMode, 'light')
  await Promise.resolve()
  assert.equal(plugin.__state.requests.length, 1)

  releaseFirst({})
  await Promise.all([darkSync, lightSync])
  assert.deepEqual(
    plugin.__state.requests.map(request => request.payload.value),
    ['theme-picker-shadow-thief-dark', 'theme-picker-shadow-thief-light']
  )
})

test('queued gateway changes never leak into a different active profile', async () => {
  let profile = 'default'
  let releaseFirst
  const firstRequest = new Promise(resolve => { releaseFirst = resolve })
  let requestCount = 0
  const plugin = await loadPlugin(
    new Map(),
    true,
    () => {
      requestCount += 1
      return requestCount === 1 ? firstRequest : Promise.resolve({})
    },
    () => profile
  )
  const scene = plugin.__test.scenes.find(item => item.name === 'shadow-thief')

  const first = plugin.__test.applyScene(scene, 'dark', () => {})
  await Promise.resolve()
  const stale = plugin.__test.applyScene(scene, 'light', () => {})
  profile = 'work'
  const current = plugin.__test.applyScene(scene, 'dark', () => {})

  await Promise.resolve()
  releaseFirst({})
  await Promise.all([first, stale, current])

  assert.deepEqual(
    plugin.__state.requests.map(request => request.payload.value),
    ['theme-picker-shadow-thief-dark', 'theme-picker-shadow-thief-dark']
  )
})

test('an in-flight failure never repaints its old profile over the newly active profile', async () => {
  let activeProfile = 'default'
  let rejectRequest
  const pending = new Promise((_resolve, reject) => { rejectRequest = reject })
  const plugin = await loadPlugin(new Map(), true, () => pending, () => activeProfile)
  const scene = plugin.__test.scenes.find(item => item.name === 'nous')

  const sync = plugin.__test.applyScene(scene, 'dark', () => {})
  await Promise.resolve()
  activeProfile = 'work'
  plugin.__state.root.dataset.hermesTheme = 'work-theme'
  plugin.__state.root.dataset.hermesMode = 'light'
  plugin.__state.root.style.setProperty('--theme-background-seed', '#abcdef')
  rejectRequest(new Error('old profile request failed'))
  await sync

  assert.equal(plugin.__state.root.dataset.hermesTheme, 'work-theme')
  assert.equal(plugin.__state.root.dataset.hermesMode, 'light')
  assert.equal(plugin.__state.root.style.getPropertyValue('--theme-background-seed'), '#abcdef')
})

test('an in-flight success restores the newly active profile after the old broadcast repaints it', async () => {
  let activeProfile = 'default'
  let resolveOldRequest
  let resolveCurrentRequest
  const oldRequest = new Promise(resolve => { resolveOldRequest = resolve })
  const currentRequest = new Promise(resolve => { resolveCurrentRequest = resolve })
  let requestCount = 0
  let plugin
  const storage = new Map()
  plugin = await loadPlugin(storage, true, (_method, payload) => {
    requestCount += 1
    if (requestCount === 1) return oldRequest
    return currentRequest
  }, () => activeProfile)
  const oldScene = plugin.__test.scenes.find(item => item.name === 'nous')
  const currentScene = plugin.__test.scenes.find(item => item.name === 'shadow-thief')

  const oldSync = plugin.__test.applyScene(oldScene, 'dark', () => {})
  await Promise.resolve()
  activeProfile = 'work'
  const currentSync = plugin.__test.applyScene(currentScene, 'light', () => {})

  // config.set broadcasts before resolving. Simulate the old profile's
  // concrete transport repainting both the root and shared default storage.
  plugin.__state.root.dataset.hermesTheme = oldScene.gatewayDarkName
  plugin.__state.root.dataset.hermesMode = 'dark'
  plugin.__state.root.style.setProperty('--theme-background-seed', oldScene.darkColors.background)
  storage.set('hermes-desktop-theme-v2', oldScene.gatewayDarkName)
  storage.set('hermes-desktop-mode-v1', 'dark')
  resolveOldRequest({})
  await oldSync

  assert.equal(plugin.__state.root.dataset.hermesTheme, 'shadow-thief')
  assert.equal(plugin.__state.root.dataset.hermesMode, 'light')
  assert.equal(plugin.__state.root.style.getPropertyValue('--theme-background-seed'), currentScene.lightColors.background)
  assert.equal(JSON.parse(storage.get('hermes-desktop-profile-themes-v1')).work, 'shadow-thief')
  assert.equal(JSON.parse(storage.get('hermes-desktop-profile-modes-v1')).work, 'light')
  assert.deepEqual(plugin.__state.notifications, [])
  assert.equal(plugin.__state.requests.length, 2)

  resolveCurrentRequest({})
  await currentSync
})

test('an in-flight success restores a switched profile from its pre-request persisted appearance', async () => {
  let activeProfile = 'default'
  let resolveRequest
  const pending = new Promise(resolve => { resolveRequest = resolve })
  const storage = new Map([
    ['hermes-desktop-profile-themes-v1', JSON.stringify({ work: 'shadow-thief' })],
    ['hermes-desktop-profile-modes-v1', JSON.stringify({ work: 'light' })]
  ])
  const plugin = await loadPlugin(storage, true, () => pending, () => activeProfile)
  const oldScene = plugin.__test.scenes.find(item => item.name === 'nous')
  const workScene = plugin.__test.scenes.find(item => item.name === 'shadow-thief')

  const oldSync = plugin.__test.applyScene(oldScene, 'dark', () => {})
  await Promise.resolve()
  activeProfile = 'work'

  // Simulate the old request's broadcast corrupting the newly active profile
  // before its RPC acknowledgement arrives. No new theme click occurs in work.
  plugin.__state.root.dataset.hermesTheme = oldScene.gatewayDarkName
  plugin.__state.root.dataset.hermesMode = 'dark'
  plugin.__state.root.style.setProperty('--theme-background-seed', oldScene.darkColors.background)
  storage.set('hermes-desktop-profile-themes-v1', JSON.stringify({ work: oldScene.gatewayDarkName }))
  storage.set('hermes-desktop-profile-modes-v1', JSON.stringify({ work: 'dark' }))
  resolveRequest({})
  await oldSync

  assert.equal(plugin.__state.root.dataset.hermesTheme, 'shadow-thief')
  assert.equal(plugin.__state.root.dataset.hermesMode, 'light')
  assert.equal(plugin.__state.root.style.getPropertyValue('--theme-background-seed'), workScene.lightColors.background)
  assert.equal(JSON.parse(storage.get('hermes-desktop-profile-themes-v1')).work, 'shadow-thief')
  assert.equal(JSON.parse(storage.get('hermes-desktop-profile-modes-v1')).work, 'light')
  assert.equal(plugin.__state.requests.length, 1)
  assert.deepEqual(plugin.__state.notifications, [])
})

test('gateway acknowledgement restores the dynamic scene name after Desktop ingests the concrete variant', async () => {
  const storage = new Map()
  const plugin = await loadPlugin(storage, true, (_method, payload) => {
    storage.set('hermes-desktop-theme-v2', payload.value)
    return Promise.resolve({})
  })
  const scene = plugin.__test.scenes.find(item => item.name === 'shadow-thief')

  await plugin.__test.applyScene(scene, 'light', () => {})

  assert.equal(storage.get('hermes-desktop-theme-v2'), 'shadow-thief')
  assert.equal(storage.get('hermes-desktop-mode-v1'), 'light')
})

test('gateway success reasserts every requested dark dynamic palette after Desktop applies it with stale light mode', async () => {
  const storage = new Map()
  let plugin
  plugin = await loadPlugin(storage, true, (_method, payload) => {
    // ThemeProvider's internal mode is still light because the plugin's local
    // repaint cannot call setMode(). Simulate skin.changed applying the concrete
    // dark skin through that stale light state before the RPC acknowledges.
    plugin.__state.root.dataset.hermesTheme = payload.value
    plugin.__state.root.dataset.hermesMode = 'light'
    plugin.__state.root.style.setProperty('--theme-background-seed', '#ffffff')
    storage.set('hermes-desktop-theme-v2', payload.value)
    return Promise.resolve({})
  })
  const dynamicScenes = plugin.__test.scenes.filter(item => item.modeSupport === 'dynamic')

  for (const scene of dynamicScenes) {
    await plugin.__test.applyScene(scene, 'dark', () => {})

    assert.equal(plugin.__state.root.dataset.hermesTheme, scene.name, scene.name)
    assert.equal(plugin.__state.root.dataset.hermesMode, 'dark', scene.name)
    assert.equal(plugin.__state.root.style.getPropertyValue('--theme-background-seed'), scene.darkColors.background, scene.name)
    assert.equal(storage.get('hermes-desktop-theme-v2'), scene.name, scene.name)
    assert.equal(storage.get('hermes-desktop-mode-v1'), 'dark', scene.name)
  }
})

test('gateway synchronization failure keeps the local repaint and reports a warning', async () => {
  const plugin = await loadPlugin(
    new Map(),
    true,
    () => Promise.reject(new Error('gateway unavailable'))
  )
  const scene = plugin.__test.scenes.find(item => item.name === 'shadow-thief')

  const synchronized = await plugin.__test.applyScene(scene, 'dark', () => {})

  assert.equal(synchronized, false)
  assert.equal(plugin.__state.root.dataset.hermesTheme, 'shadow-thief')
  assert.equal(plugin.__state.root.dataset.hermesMode, 'dark')
  assert.equal(plugin.__state.notifications.at(-1).kind, 'warning')
  assert.match(plugin.__state.notifications.at(-1).message, /connected gateway could not apply/)
})

test('a stale acknowledgement cannot replace the latest persisted scene when the latest gateway request fails', async () => {
  const storage = new Map()
  let releaseFirst
  const firstRequest = new Promise(resolve => { releaseFirst = resolve })
  let requestCount = 0
  const plugin = await loadPlugin(storage, true, () => {
    requestCount += 1
    return requestCount === 1 ? firstRequest : Promise.reject(new Error('latest request failed'))
  })
  const staleScene = plugin.__test.scenes.find(item => item.name === 'nous')
  const latestScene = plugin.__test.scenes.find(item => item.name === 'shadow-thief')

  const stale = plugin.__test.applyScene(staleScene, 'dark', () => {})
  await Promise.resolve()
  const latest = plugin.__test.applyScene(latestScene, 'light', () => {})
  // Simulate Desktop handling the stale request's skin.changed broadcast after
  // the latest optimistic repaint but before that latest gateway request fails.
  plugin.__state.root.dataset.hermesTheme = 'nous'
  plugin.__state.root.dataset.hermesMode = 'dark'
  plugin.__state.root.style.setProperty('--theme-background-seed', staleScene.darkColors.background)
  storage.set('hermes-desktop-theme-v2', staleScene.gatewayDarkName)
  releaseFirst({})
  await Promise.all([stale, latest])

  assert.equal(storage.get('hermes-desktop-theme-v2'), 'shadow-thief')
  assert.equal(storage.get('hermes-desktop-mode-v1'), 'light')
  assert.equal(plugin.__state.root.dataset.hermesTheme, 'shadow-thief')
  assert.equal(plugin.__state.root.dataset.hermesMode, 'light')
  assert.equal(plugin.__state.root.style.getPropertyValue('--theme-background-seed'), latestScene.lightColors.background)
})

test('post-ack persistence failure warns that the combined scene is not durable', async () => {
  const stored = new Map()
  let blockAppearance = false
  const partialStorage = {
    get: key => stored.get(key) ?? null,
    set: (key, value) => {
      if (blockAppearance && key === 'hermes-desktop-theme-v2') throw new Error('appearance write blocked')
      stored.set(key, value)
    }
  }
  const plugin = await loadPlugin(partialStorage, true, (_method, payload) => {
    stored.set('hermes-desktop-theme-v2', payload.value)
    blockAppearance = true
    return Promise.resolve({})
  })
  const scene = plugin.__test.scenes.find(item => item.name === 'shadow-thief')

  await plugin.__test.applyScene(scene, 'dark', () => {})

  assert.equal(plugin.__state.notifications.at(-1).kind, 'warning')
  assert.match(plugin.__state.notifications.at(-1).message, /combined scene could not be saved for restart/)
})

test('in-place repaint still works when appearance storage is unavailable', async () => {
  const blockedStorage = {
    get: () => { throw new Error('storage blocked') },
    set: () => { throw new Error('storage blocked') }
  }
  const plugin = await loadPlugin(blockedStorage, true)
  const scene = plugin.__test.scenes.find(item => item.name === 'shadow-thief')

  assert.doesNotThrow(() => plugin.register({ register: () => {} }))
  assert.doesNotThrow(() => plugin.__test.applyScene(scene, 'light', () => {}))
  assert.equal(plugin.__state.root.dataset.hermesTheme, 'shadow-thief')
  assert.equal(plugin.__state.root.dataset.hermesMode, 'light')
  assert.equal(plugin.__state.reloads, 0)
})

test('applying a contributed scene warns when its boot theme cache cannot be saved', async () => {
  const stored = new Map()
  const partialStorage = {
    get: key => stored.get(key) ?? null,
    set: (key, value) => {
      if (key === USER_THEMES_KEY) throw new Error('theme cache quota exceeded')
      stored.set(key, value)
    }
  }
  const plugin = await loadPlugin(partialStorage, true)
  const scene = plugin.__test.scenes.find(item => item.name === 'shadow-thief')

  plugin.__test.applyScene(scene, 'dark', () => {})

  assert.equal(plugin.__state.root.dataset.hermesTheme, 'shadow-thief')
  assert.equal(stored.get('hermes-desktop-theme-v2'), 'shadow-thief')
  assert.equal(plugin.__state.notifications.at(-1).kind, 'warning')
  assert.match(plugin.__state.notifications.at(-1).message, /could not be saved for restart/)
})

test('the self-contained plugin never fetches remote theme fonts', async () => {
  const source = await readFile(pluginPath, 'utf8')

  assert.doesNotMatch(source, /fonts\.googleapis\.com|fonts\.gstatic\.com/)
})
