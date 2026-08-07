import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const USER_THEMES_KEY = 'hermes-desktop-user-themes-v1'
const pluginPath = new URL('../plugin/plugin.js', import.meta.url)

function loadPlugin(storage) {
  return readFile(pluginPath, 'utf8').then(source => {
    const executable = source
      .replace(/import\s+\{[\s\S]*?\}\s+from\s+'@hermes\/plugin-sdk'\n/, '')
      .replace(/import\s+\{[^}]*\}\s+from\s+'react\/jsx-runtime'\n/, '')
      .replace(/import\s+\{[^}]*\}\s+from\s+'react'\n/, '')
      .replace('export default {', 'globalThis.plugin = {')

    const context = {
      console,
      globalThis: null,
      PALETTE_AREA: 'palette',
      ROUTES_AREA: 'routes',
      SIDEBAR_NAV_AREA: 'sidebar-nav',
      STATUSBAR_AREAS: { right: 'statusbar-right' },
      THEMES_AREA: 'themes',
      window: {
        localStorage: {
          getItem: key => storage.get(key) ?? null,
          setItem: (key, value) => storage.set(key, value)
        }
      }
    }
    context.globalThis = context
    vm.runInNewContext(executable, context, { filename: 'plugin.js' })
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
