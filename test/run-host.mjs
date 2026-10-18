// 宿主半边自测：直接用 node 运行（沙箱下 node --test 的 spawn 会被 EPERM 拦截）
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply, name, inject } from '../lib/index.js'

let failures = 0
let passed = 0
async function test(label, fn) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-plugin-namecards-'))
  mkdirSync(join(home, 'dsh-plugin-namecards', 'icons'), { recursive: true })
  const prev = process.env.DSH_PLUGIN_NAMECARDS_HOME
  process.env.DSH_PLUGIN_NAMECARDS_HOME = home
  try {
    await fn(home)
    passed += 1
    console.log('  ok  ' + label)
  } catch (error) {
    failures += 1
    console.log('  FAIL ' + label)
    console.log(error && error.stack ? error.stack : String(error))
  } finally {
    if (prev === undefined) delete process.env.DSH_PLUGIN_NAMECARDS_HOME
    else process.env.DSH_PLUGIN_NAMECARDS_HOME = prev
    rmSync(home, { recursive: true, force: true })
  }
}

function writeCards(home, store) {
  writeFileSync(join(home, 'dsh-plugin-namecards', 'cards.json'), JSON.stringify(store, null, 2), 'utf8')
}

function baseList() {
  return [
    {
      name: 'demo-bundle', version: '1.2.3', enabled: true,
      meta: { title: { en: 'Demo' }, description: { en: 'English description' }, icon: 'data:image/svg+xml;base64,AAAA' },
      rows: [{ rowId: 'row-a', moduleName: 'demo-row', entryId: 'entry-a', enabled: true, meta: { description: { en: 'row english' } } }]
    },
    { name: 'other-bundle', enabled: false, meta: { description: { en: 'keep me' } } }
  ]
}

function makeHarness(initialList) {
  const list = initialList || baseList()
  const calls = []
  const pm = {
    listBundles: async () => list,
    setBundleEnabled: async (bundleName, enabled) => { calls.push(['bundle', bundleName, enabled]); return {} },
    setPluginEnabled: async (id, enabled) => { calls.push(['row', id, enabled]); return {} }
  }
  const routes = []
  const ctx = {
    webServer: { register(entry) { routes.push(entry); return () => {} } },
    effect(fn) { const disposer = fn(); return () => { if (typeof disposer === 'function') disposer() } },
    inject(deps, callback) { callback({ pluginManager: pm, effect: ctx.effect }) },
    get(key) { return key === 'pluginManager' ? pm : undefined }
  }
  apply(ctx)
  const route = routes[0]
  async function call(method, path, body) {
    const payload = body === undefined ? '' : JSON.stringify(body)
    const res = { statusCode: 0, body: undefined, setHeader() {}, end(b) { this.body = b } }
    const listeners = {}
    const req = {
      url: path, method, socket: { remoteAddress: '127.0.0.1' },
      on(event, cb) { listeners[event] = cb },
      destroy() {}
    }
    const done = route.handler(req, res)
    if (payload && listeners.data) listeners.data(Buffer.from(payload))
    if (listeners.end) listeners.end()
    await done
    return { status: res.statusCode, data: JSON.parse(res.body) }
  }
  return { pm, routes, route, call, calls }
}

async function main() {
  console.log('dsh-plugin-namecards host tests')

  await test('包装 listBundles：替换 description / icon，并处理行', async (home) => {
    writeCards(home, {
      version: 2, enabled: true,
      cards: {
        'demo-bundle': { description: '中文说明一句话', icon: 'builtin:memory', note: '我的备注', showNote: true },
        'demo-bundle#row-a': { description: '行级中文说明' }
      },
      layout: { version: 1, folders: [], assignments: {}, favorites: { keys: [], sort: 'manual', collapsed: false }, manual: {}, view: 'list' }
    })
    const h = makeHarness()
    const list = await h.pm.listBundles()
    const demo = list.find((item) => item.name === 'demo-bundle')
    assert.equal(demo.meta.title, '我的备注')
    assert.equal(demo.meta.description, '中文说明一句话')
    assert.equal(demo.meta.icon, '/dsh-plugin-namecards/icon/builtin/memory.svg')
    assert.equal(demo.rows[0].meta.description, '行级中文说明')
    assert.equal(list.find((item) => item.name === 'other-bundle').meta.description.en, 'keep me')
    assert.ok(list.find((item) => item.name === 'other-bundle').meta.icon.startsWith('/dsh-plugin-namecards/icon/builtin/'))
  })

  await test('全局 enabled=false 时返回原文', async (home) => {
    writeCards(home, { version: 2, enabled: false, cards: { 'demo-bundle': { description: '中文说明' } }, layout: {} })
    const h = makeHarness()
    const demo = (await h.pm.listBundles()).find((item) => item.name === 'demo-bundle')
    assert.equal(demo.meta.description.en, 'English description')
  })

  await test('状态路由：layout、bundles、rows 字段', async (home) => {
    const h = makeHarness()
    const { status, data } = await h.call('GET', '/dsh-plugin-namecards/state')
    assert.equal(status, 200)
    assert.equal(data.ok, true)
    assert.ok(data.layout && Array.isArray(data.layout.folders))
    assert.equal(data.bundles.length, 2)
    assert.equal(data.bundles[0].original.description.en, 'English description')
    assert.equal(data.bundles[0].rows[0].entryId, 'entry-a')
    assert.match(data.cards['other-bundle'].icon, /^builtin:/, '没有名片的插件应自动分配到图标')
  })

  await test('布局：建文件夹 / 改名 / 移入 / 收藏 / 排序 / 删除', async (home) => {
    const h = makeHarness()
    const created = await h.call('POST', '/dsh-plugin-namecards/layout', { action: 'folder.create', name: '记忆' })
    assert.equal(created.status, 200)
    const folderId = created.data.folder.id

    await h.call('POST', '/dsh-plugin-namecards/layout', { action: 'folder.rename', id: folderId, name: '记忆与知识' })
    await h.call('POST', '/dsh-plugin-namecards/layout', { action: 'assign', key: 'demo-bundle', folderId })
    await h.call('POST', '/dsh-plugin-namecards/layout', { action: 'favorite', key: 'demo-bundle', favorite: true })
    await h.call('POST', '/dsh-plugin-namecards/layout', { action: 'order', container: folderId, keys: ['demo-bundle'] })
    await h.call('POST', '/dsh-plugin-namecards/layout', { action: 'folder.sort', id: folderId, sort: 'auto' })
    await h.call('POST', '/dsh-plugin-namecards/layout', { action: 'view', mode: 'grid' })

    let state = (await h.call('GET', '/dsh-plugin-namecards/state')).data
    assert.equal(state.layout.folders.length, 1)
    assert.equal(state.layout.folders[0].name, '记忆与知识')
    assert.equal(state.layout.folders[0].sort, 'auto')
    assert.equal(state.layout.assignments['demo-bundle'], folderId)
    assert.deepEqual(state.layout.favorites.keys, ['demo-bundle'])
    assert.equal(state.layout.view, 'grid')

    await h.call('POST', '/dsh-plugin-namecards/layout', { action: 'folder.delete', id: folderId })
    state = (await h.call('GET', '/dsh-plugin-namecards/state')).data
    assert.equal(state.layout.folders.length, 0)
    assert.equal(state.layout.assignments['demo-bundle'], undefined)
  })

  await test('开关：bundle 与 row 转调官方方法', async (home) => {
    const h = makeHarness()
    const bundle = await h.call('POST', '/dsh-plugin-namecards/toggle', { kind: 'bundle', name: 'demo-bundle', enabled: false })
    assert.equal(bundle.status, 200)
    assert.deepEqual(h.calls[0], ['bundle', 'demo-bundle', false])

    const row = await h.call('POST', '/dsh-plugin-namecards/toggle', { kind: 'row', name: 'demo-bundle', rowId: 'row-a', enabled: false })
    assert.equal(row.status, 200)
    assert.deepEqual(h.calls[1], ['row', 'entry-a', false])

    const missing = await h.call('POST', '/dsh-plugin-namecards/toggle', { kind: 'row', name: 'demo-bundle', rowId: 'nope', enabled: true })
    assert.equal(missing.status, 400)
  })

  await test('保存 / 重置 / 上传 / 导入', async (home) => {
    const h = makeHarness()
    const saved = await h.call('POST', '/dsh-plugin-namecards/save', { key: 'demo-bundle', card: { description: '保存后的说明', icon: 'builtin:tool' } })
    assert.equal(saved.status, 200)
    assert.equal(saved.data.cards['demo-bundle'].description, '保存后的说明')

    const upload = await h.call('POST', '/dsh-plugin-namecards/upload', { key: 'demo-bundle', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' })
    assert.equal(upload.status, 200)
    assert.match(upload.data.token, /^file:[a-f0-9]{16}\.png$/)
    assert.ok(existsSync(join(home, 'dsh-plugin-namecards', 'icons', upload.data.token.slice(5))))

    const reset = await h.call('POST', '/dsh-plugin-namecards/reset', { key: 'demo-bundle' })
    assert.equal(reset.data.cards['demo-bundle'], undefined)

    const imported = await h.call('POST', '/dsh-plugin-namecards/import', { version: 2, enabled: false, cards: { x: { description: '导入' } }, layout: { folders: [{ id: 'f_abcd1234', name: '导入文件夹', sort: 'manual' }] } })
    assert.equal(imported.status, 200)
    assert.equal(imported.data.cards.x.description, '导入')
    assert.equal(imported.data.layout.folders.length, 1)
  })

  await test('全局导出：包含名片、布局与上传图标', async (home) => {
    const h = makeHarness()
    await h.call('POST', '/dsh-plugin-namecards/save', { key: 'demo-bundle', card: { note: '名片工坊', description: '说明', icon: 'builtin:memory' } })
    const upload = await h.call('POST', '/dsh-plugin-namecards/upload', { key: 'demo-bundle', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' })
    await h.call('POST', '/dsh-plugin-namecards/save', { key: 'demo-bundle', card: { note: '名片工坊', description: '说明', icon: upload.data.token } })
    await h.call('POST', '/dsh-plugin-namecards/layout', { action: 'folder.create', name: '美化' })
    const { status, data } = await h.call('GET', '/dsh-plugin-namecards/export')
    assert.equal(status, 200)
    assert.equal(data.app, 'dsh-plugin-namecards')
    assert.equal(data.cards['demo-bundle'].note, '名片工坊')
    assert.equal(data.cards['demo-bundle'].description, '说明')
    assert.equal(data.layout.folders.length, 1)
    const tokenName = upload.data.token.slice(5)
    assert.ok(data.icons[tokenName], '导出应内嵌上传图标')
    assert.ok(data.icons[tokenName].data.length > 20)
  })

  await test('导入时恢复导出的上传图标', async (home) => {
    const h = makeHarness()
    const upload = await h.call('POST', '/dsh-plugin-namecards/upload', { key: 'demo-bundle', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' })
    const token = upload.data.token
    await h.call('POST', '/dsh-plugin-namecards/save', { key: 'demo-bundle', card: { note: '名片工坊', description: '说明', icon: token } })
    const exported = await h.call('GET', '/dsh-plugin-namecards/export')
    const name = token.slice(5)
    rmSync(join(home, 'dsh-plugin-namecards', 'icons', name), { force: true })
    assert.equal(existsSync(join(home, 'dsh-plugin-namecards', 'icons', name)), false)
    const imported = await h.call('POST', '/dsh-plugin-namecards/import', { store: exported.data })
    assert.equal(imported.status, 200)
    assert.ok(existsSync(join(home, 'dsh-plugin-namecards', 'icons', name)), '导入应把图标文件写回来')
    assert.equal(imported.data.cards['demo-bundle'].note, '名片工坊')
  })

  await test('导出声明', async () => {
    assert.equal(name, 'dsh-plugin-namecards')
    assert.deepEqual(inject, ['webServer'])
  })

  console.log('\n' + passed + ' passed, ' + failures + ' failed')
  if (failures > 0) process.exitCode = 1
}

await main()
