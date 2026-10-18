/**
 * 插件名片 · 宿主半边
 *
 * 1. 包装 ctx.pluginManager.listBundles()，把 bundle / rows 的 meta.icon 与
 *    meta.description 换成用户本地的名片数据（只改返回值，不碰插件文件）；
 * 2. 提供本地 HTTP 路由：名片数据、文件夹/收藏/排序等布局数据、图标上传，
 *    以及启用开关（转调官方 pluginManager 的 setBundleEnabled/setPluginEnabled）。
 *
 * 存储：$DSH_HOME/dsh-plugin-namecards/cards.json（默认 ~/.dsh/dsh-plugin-namecards/cards.json）
 */
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-plugin-namecards'
export const inject = ['webServer']

const ROUTE = '/dsh-plugin-namecards'
const PACKAGE_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const ASSETS_DIR = join(PACKAGE_ROOT, 'assets')
const SEED_DIR = join(PACKAGE_ROOT, 'seed')

const LIMIT = { text: 200, name: 40, body: 4 * 1024 * 1024, icon: 600 * 1024, keys: 2000 }
const MIME = {
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}
const UPLOAD_MIME_EXT = { 'image/svg+xml': '.svg', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' }
const SAFE_KEY = /^[A-Za-z0-9@][A-Za-z0-9@/_.:#-]{0,200}$/
const SAFE_FOLDER = /^[a-z0-9_-]{4,40}$/i
const SAFE_BUILTIN = /^[a-z0-9][a-z0-9-]{0,40}$/
const SAFE_FILE = /^[a-f0-9]{12,64}\.(?:svg|png|jpg|jpeg|webp|gif)$/
const ORIGINAL = Symbol.for('cordis.original')
const PATCHED = Symbol.for('dsh-plugin-namecards/patched')

const log = (level, ...args) => {
  try { console[level === 'warn' ? 'warn' : 'log']('[dsh-plugin-namecards]', ...args) } catch {}
}

function realService(value) {
  try { return value && value[ORIGINAL] ? value[ORIGINAL] : value } catch { return value }
}
function managerOf(ctx) {
  return realService(ctx.get ? ctx.get('pluginManager') : ctx.pluginManager)
}

/* ------------------------------------------------------------------ */
/* 路径与存储                                                          */
/* ------------------------------------------------------------------ */

function dshHome() {
  const override = (process.env.DSH_PLUGIN_NAMECARDS_HOME || process.env.DSH_PLUGIN_CARDS_HOME)
  if (override && override.trim()) return resolve(override)
  const envHome = process.env.DSH_HOME
  if (envHome && envHome.trim()) return resolve(envHome)
  return join(homedir(), '.dsh')
}
function dataDir() { return join(dshHome(), 'dsh-plugin-namecards') }
function legacyDataDir() { return join(dshHome(), 'plugin-cards') }

/** 旧版本数据目录（~/.dsh/plugin-cards）自动迁移到新目录，只做一次。 */
function ensureDataMigrated() {
  try {
    const target = dataDir()
    const legacy = legacyDataDir()
    if (existsSync(target) || !existsSync(legacy)) return
    cpSync(legacy, target, { recursive: true })
    log('migrated data', legacy, '->', target)
  } catch (error) {
    log('warn', '迁移旧数据目录失败：', String(error))
  }
}
function storeFile() { return join(dataDir(), 'cards.json') }
function iconsDir() { return join(dataDir(), 'icons') }
function ensureDirs() {
  ensureDataMigrated()
  mkdirSync(iconsDir(), { recursive: true })
}

function emptyLayout() {
  return {
    version: 1,
    folders: [],
    assignments: {},
    favorites: { keys: [], sort: 'manual', collapsed: false },
    manual: {},
    view: 'list',
    seeded: false
  }
}
function emptyStore() {
  return { version: 2, enabled: true, cards: {}, layout: emptyLayout() }
}

function normalizeCard(raw) {
  if (!raw || typeof raw !== 'object') return undefined
  const card = {}
  if (typeof raw.description === 'string' && raw.description.trim()) card.description = raw.description.trim().slice(0, LIMIT.text)
  if (typeof raw.note === 'string' && raw.note.trim()) card.note = raw.note.trim().slice(0, LIMIT.text)
  if (typeof raw.icon === 'string') {
    const icon = raw.icon.trim()
    if (/^builtin:[a-z0-9][a-z0-9-]{0,40}$/.test(icon) || /^file:[a-f0-9]{12,64}\.(?:svg|png|jpg|jpeg|webp|gif)$/.test(icon)) card.icon = icon
  }
  if (raw.autoIcon === false) card.autoIcon = false
  if (raw.autoAssigned === true) card.autoAssigned = true
  if (card.description === undefined && card.note === undefined && card.icon === undefined && card.autoIcon === undefined) return undefined
  return card
}

function cleanKeys(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const out = []
  for (const key of list) {
    if (typeof key !== 'string' || !SAFE_KEY.test(key) || seen.has(key)) continue
    seen.add(key)
    out.push(key)
    if (out.length >= LIMIT.keys) break
  }
  return out
}

function normalizeLayout(raw) {
  const layout = emptyLayout()
  if (!raw || typeof raw !== 'object') return layout
  const folders = []
  if (Array.isArray(raw.folders)) {
    for (const item of raw.folders) {
      if (!item || typeof item !== 'object' || folders.length >= 60) continue
      const id = typeof item.id === 'string' && SAFE_FOLDER.test(item.id) ? item.id : undefined
      if (id === undefined || folders.some((folder) => folder.id === id)) continue
      folders.push({
        id,
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, LIMIT.name) : '文件夹',
        sort: item.sort === 'auto' ? 'auto' : 'manual',
        collapsed: item.collapsed === true
      })
    }
  }
  layout.folders = folders
  const assignments = {}
  if (raw.assignments && typeof raw.assignments === 'object') {
    for (const [key, folderId] of Object.entries(raw.assignments)) {
      if (!SAFE_KEY.test(key)) continue
      if (!folders.some((folder) => folder.id === folderId)) continue
      assignments[key] = folderId
    }
  }
  layout.assignments = assignments
  const favorites = raw.favorites && typeof raw.favorites === 'object' ? raw.favorites : {}
  layout.favorites = {
    keys: cleanKeys(favorites.keys),
    sort: favorites.sort === 'auto' ? 'auto' : 'manual',
    collapsed: favorites.collapsed === true
  }
  layout.seeded = raw.seeded === true
  const manual = {}
  if (raw.manual && typeof raw.manual === 'object') {
    for (const [container, keys] of Object.entries(raw.manual)) {
      if (container !== 'root' && container !== 'favorites' && !folders.some((folder) => folder.id === container)) continue
      manual[container] = cleanKeys(keys)
    }
  }
  layout.manual = manual
  layout.view = raw.view === 'grid' ? 'grid' : 'list'
  return layout
}

function normalizeStore(raw) {
  const store = emptyStore()
  if (!raw || typeof raw !== 'object') return store
  store.version = 2
  store.enabled = raw.enabled !== false
  const cards = raw.cards && typeof raw.cards === 'object' ? raw.cards : {}
  for (const [key, value] of Object.entries(cards)) {
    if (!SAFE_KEY.test(key)) continue
    const card = normalizeCard(value)
    if (card !== undefined) store.cards[key] = card
  }
  store.layout = normalizeLayout(raw.layout)
  return store
}

function seedStore() {
  const store = emptyStore()
  try {
    const seedPath = join(SEED_DIR, 'cards.seed.json')
    if (!existsSync(seedPath)) return store
    const seed = JSON.parse(readFileSync(seedPath, 'utf8'))
    for (const [key, value] of Object.entries(seed || {})) {
      if (!SAFE_KEY.test(key) || !value || typeof value !== 'object') continue
      const card = normalizeCard({
        description: value.description,
        note: value.note,
        showNote: value.showNote,
        icon: typeof value.icon === 'string'
          ? (value.icon.startsWith('builtin:') || value.icon.startsWith('file:') ? value.icon : 'builtin:' + value.icon)
          : undefined
      })
      if (card !== undefined) store.cards[key] = card
    }
  } catch (error) {
    log('warn', '读取预填词库失败：', String(error))
  }
  return store
}

function loadStore() {
  ensureDataMigrated()
  const file = storeFile()
  try {
    if (!existsSync(file)) {
      const created = seedStore()
      ensureDirs()
      writeStore(created)
      return created
    }
    return normalizeStore(JSON.parse(readFileSync(file, 'utf8')))
  } catch (error) {
    log('warn', '读取名片数据失败，按空数据处理：', String(error))
    return emptyStore()
  }
}

function exportStore() {
  ensureDataMigrated()
  const store = loadStore()
  const icons = {}
  for (const card of Object.values(store.cards)) {
    if (!card || typeof card.icon !== 'string' || !card.icon.startsWith('file:')) continue
    const name = card.icon.slice(5)
    if (!SAFE_FILE.test(name)) continue
    try {
      const bytes = readFileSync(join(iconsDir(), name))
      icons[name] = {
        mime: MIME[extname(name).toLowerCase()] || 'application/octet-stream',
        data: bytes.toString('base64')
      }
    } catch {}
  }
  return {
    app: 'dsh-plugin-namecards',
    schema: 2,
    exportedAt: new Date().toISOString(),
    cards: store.cards,
    layout: store.layout,
    icons
  }
}

function writeStore(store) {
  ensureDataMigrated()
  const file = storeFile()
  ensureDirs()
  const tmp = file + '.' + process.pid + '.tmp'
  writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n', 'utf8')
  renameSync(tmp, file)
}

/* ------------------------------------------------------------------ */
/* 内置图标                                                            */
/* ------------------------------------------------------------------ */

let builtinCache
function builtinIcons() {
  if (builtinCache !== undefined) return builtinCache
  const list = []
  try {
    const seedPath = join(SEED_DIR, 'icons.json')
    if (existsSync(seedPath)) {
      const raw = JSON.parse(readFileSync(seedPath, 'utf8'))
      if (Array.isArray(raw)) {
        for (const item of raw) {
          if (!item || typeof item !== 'object') continue
          const id = String(item.id || '')
          if (!SAFE_BUILTIN.test(id)) continue
          if (!existsSync(join(ASSETS_DIR, 'icons', id + '.svg'))) continue
          list.push({ id, zh: typeof item.zh === 'string' ? item.zh : id, color: typeof item.color === 'string' ? item.color : '#4C8DFF' })
        }
      }
    }
  } catch (error) {
    log('warn', '读取内置图标索引失败：', String(error))
  }
  builtinCache = list
  return list
}

/* ------------------------------------------------------------------ */
/* 自动分配图标（只补空缺，不覆盖用户设置）                             */
/* ------------------------------------------------------------------ */

const ICON_RULES = [
  [/(memory|memor|mind|recall|灵枢|记忆)/i, 'memory'],
  [/(market|marketplace|store|集市|市场)/i, 'market'],
  [/(skill|技能)/i, 'skill'],
  [/(pet|whale|桌宠|宠物|鲸)/i, 'pet'],
  [/(theme|skin|maid|皮肤|主题|女仆)/i, 'theme'],
  [/(wallpaper|壁纸|background)/i, 'wallpaper'],
  [/(voice|speech|audio|tts|music|语音|音乐)/i, 'voice'],
  [/(image|vision|识图|图片|绘图|diagram)/i, 'image'],
  [/(mcp|oauth|connect|连接)/i, 'mcp'],
  [/(routing|route|proxy|network|路由|代理|网络)/i, 'network'],
  [/(auth|secret|password|credential|安全|密码|密钥)/i, 'security'],
  [/(mobile|pocket|remote|手机|远程)/i, 'mobile'],
  [/(terminal|shell|ssh|command|终端)/i, 'terminal'],
  [/(document|docs|笔记|文档)/i, 'doc'],
  [/(graph|chart|架构|拓扑)/i, 'graph'],
  [/(robot|agent|智能体)/i, 'robot'],
  [/(database|sql|数据)/i, 'database'],
  [/(cloud|sdk|云)/i, 'cloud'],
  [/(code|coding|dev|代码|开发)/i, 'code'],
  [/(chat|conversation|对话)/i, 'chat'],
  [/(game|游戏)/i, 'game'],
  [/(startup|boot|启动|开机)/i, 'startup'],
  [/(search|搜索)/i, 'search'],
  [/(update|upgrade|更新)/i, 'update'],
  [/(folder|file|文件)/i, 'folder'],
  [/(clock|schedule|timer|时间|定时)/i, 'clock'],
  [/(mood|emoji|balance|表情|余额)/i, 'mood'],
  [/(weather|天气)/i, 'weather'],
  [/(perf|speed|fast|加速|性能)/i, 'perf'],
  [/(lab|experiment|实验)/i, 'lab']
]

function textOf(value) {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  if (typeof value.zh === 'string') return value.zh
  if (typeof value.en === 'string') return value.en
  const found = Object.values(value).find((item) => typeof item === 'string')
  return typeof found === 'string' ? found : ''
}

function guessIcon(name, description) {
  const text = String(name) + ' ' + String(description || '')
  for (const [pattern, id] of ICON_RULES) if (pattern.test(text)) return id
  let hash = 0
  for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const fallback = ['tool', 'doc', 'lab', 'code', 'settings', 'cloud']
  return fallback[hash % fallback.length]
}

/** 给还没有图标的插件补一个内置图标（包括尚未安装的条目）；已有图标一律不动。 */
/** 官方实验性插件：包名以 @deepseek-ai/dsh-experimental- 开头，与是否启用无关。 */
function isExperimentalBundle(bundle) {
  return !!bundle && typeof bundle.name === 'string' &&
    bundle.name.startsWith('@deepseek-ai/dsh-experimental-')
}

/**
 * 首次加载时，把官方实验性插件收进「实验性插件」文件夹。
 * 仅在布局完全空白时执行一次，之后用 layout.seeded 标记，避免用户删了文件夹又被补回来。
 */
function seedExperimentalFolder(bundles) {
  try {
    const store = loadStore()
    const experimentalBundles = new Map()
    for (const bundle of bundles) {
      if (isExperimentalBundle(bundle)) experimentalBundles.set(bundle.name, bundle)
    }

    // 清理：实验性文件夹里只保留官方实验性目录内的插件（与是否启用无关），其余移回未分组
    let layoutChanged = false
    for (const [key, folderId] of Object.entries(store.layout.assignments)) {
      if (folderId !== 'f_experimental') continue
      if (experimentalBundles.has(key)) continue
      delete store.layout.assignments[key]
      layoutChanged = true
    }
    // 实验性文件夹里的插件统一使用官方中文名作为备注（不覆盖用户已填写的备注）
    for (const [key, card] of Object.entries(store.cards)) {
      if (store.layout.assignments[key] !== 'f_experimental') continue
      if (card && card.note) continue
      const bundle = bundles.find((item) => item && item.name === key)
      const title = bundle && bundle.meta && bundle.meta.title
      const zh = title && typeof title === 'object' && typeof title.zh === 'string' ? title.zh.trim() : ''
      if (!zh) continue
      store.cards[key] = { ...(card || {}), note: zh }
      layoutChanged = true
    }

    const folder = store.layout.folders.find((item) => item.id === 'f_experimental')
    if (folder && !Object.values(store.layout.assignments).includes('f_experimental')) {
      store.layout.folders = store.layout.folders.filter((item) => item.id !== 'f_experimental')
      layoutChanged = true
    }

    // 自动把官方实验性插件放入文件夹（与启用状态无关；已归到别处的、收藏的不动）
    const assignedNow = new Set(Object.keys(store.layout.assignments))
    const favorites = new Set(store.layout.favorites.keys)
    const keys = [...experimentalBundles.keys()].filter((name) => !assignedNow.has(name) && !favorites.has(name))
    store.layout.seeded = true
    if (keys.length > 0) {
      let target = store.layout.folders.find((item) => item.id === 'f_experimental')
      if (!target) {
        target = { id: 'f_experimental', name: '实验性插件', sort: 'manual', collapsed: false }
        store.layout.folders.push(target)
      }
      for (const key of keys) {
        store.layout.assignments[key] = target.id
        const bundle = experimentalBundles.get(key)
        const title = bundle && bundle.meta && bundle.meta.title
        const zh = title && typeof title === 'object' && typeof title.zh === 'string' ? title.zh.trim() : ''
        if (zh) {
          const card = store.cards[key] || {}
          if (!card.note) store.cards[key] = { ...card, note: zh }
        }
      }
      log('experimental folder +', keys.length, 'bundles')
      layoutChanged = true
    }

    if (layoutChanged) writeStore(store)
  } catch (error) {
    log('warn', '初始化实验性文件夹失败：', String(error))
  }
}

function ensureAutoIcons(bundles) {
  if (!Array.isArray(bundles) || bundles.length === 0) return
  const store = loadStore()
  let changed = false

  // 迁移：旧版本曾给「作者自带图标」的插件写过自动图标，这里清掉只含自动图标、没有自定义内容的名片
  for (const bundle of bundles) {
    if (!bundle || typeof bundle.name !== 'string') continue
    if (!(bundle.meta && typeof bundle.meta.icon === 'string' && bundle.meta.icon.length > 0)) continue
    const card = store.cards[bundle.name]
    if (!card || card.autoAssigned === true) continue
    if (card.description || card.note) continue
    if (typeof card.icon !== 'string') continue
    const expected = 'builtin:' + guessIcon(bundle.name, textOf(bundle.meta.description))
    if (card.icon === expected) {
      delete store.cards[bundle.name]
      changed = true
    }
  }

  for (const bundle of bundles) {
    if (!bundle || typeof bundle.name !== 'string') continue
    const existing = store.cards[bundle.name]
    if (existing && (existing.icon || existing.autoIcon === false)) continue
    // 作者自带的图标优先，不做自动覆盖
    if (bundle.meta && typeof bundle.meta.icon === 'string' && bundle.meta.icon.length > 0) continue
    const description = textOf(bundle.meta && bundle.meta.description)
    store.cards[bundle.name] = { ...(existing || {}), icon: 'builtin:' + guessIcon(bundle.name, description), autoAssigned: true }
    changed = true
  }
  if (changed) {
    try { writeStore(store) } catch (error) { log('warn', '自动分配图标写盘失败：', String(error)) }
  }
}

/* ------------------------------------------------------------------ */
/* 名片 → meta 装饰                                                    */
/* ------------------------------------------------------------------ */

function iconUrl(icon) {
  if (typeof icon !== 'string') return undefined
  if (icon.startsWith('builtin:')) return ROUTE + '/icon/builtin/' + icon.slice(8) + '.svg'
  if (icon.startsWith('file:')) return ROUTE + '/icon/file/' + icon.slice(5)
  return undefined
}

function decorateMeta(meta, card) {
  const source = meta && typeof meta === 'object' ? meta : {}
  const next = { ...source }
  // 备注 = 显示名称（取代原包名）；中文说明 = 名称下面那一行介绍。
  if (card.note) next.title = card.note
  if (card.description) next.description = card.description
  const icon = iconUrl(card.icon)
  if (icon && !(card.autoAssigned === true && typeof source.icon === 'string' && source.icon.length > 0)) next.icon = icon
  return next
}

function decorateList(list, store) {
  if (!Array.isArray(list)) return list
  if (store.enabled === false) return list
  const cards = store.cards || {}
  return list.map((pkg) => {
    if (!pkg || typeof pkg !== 'object' || typeof pkg.name !== 'string') return pkg
    const own = cards[pkg.name]
    const next = own === undefined ? pkg : { ...pkg, meta: decorateMeta(pkg.meta, own) }
    if (Array.isArray(next.rows) && next.rows.length > 0) {
      next.rows = next.rows.map((row) => {
        if (!row || typeof row !== 'object' || typeof row.rowId !== 'string') return row
        const card = cards[pkg.name + '#' + row.rowId]
        return card === undefined ? row : { ...row, meta: decorateMeta(row.meta, card) }
      })
    }
    return next
  })
}

/* ------------------------------------------------------------------ */
/* 布局动作                                                            */
/* ------------------------------------------------------------------ */

function newFolderId() {
  return 'f_' + Math.random().toString(36).slice(2, 10)
}

function folderById(layout, id) {
  return layout.folders.find((folder) => folder.id === id)
}

function remember(layout, container, key) {
  const list = Array.isArray(layout.manual[container]) ? layout.manual[container] : []
  if (!list.includes(key)) layout.manual[container] = [...list, key]
}

function forget(layout, container, key) {
  if (Array.isArray(layout.manual[container])) layout.manual[container] = layout.manual[container].filter((item) => item !== key)
}

function applyLayoutAction(store, body) {
  const action = typeof body.action === 'string' ? body.action : ''
  const layout = store.layout
  const folders = layout.folders

  if (action === 'folder.create') {
    if (folders.length >= 60) throw new Error('too many folders')
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, LIMIT.name) : '新文件夹'
    const folder = { id: newFolderId(), name, sort: 'manual', collapsed: false }
    folders.push(folder)
    layout.manual[folder.id] = []
    return { folder }
  }

  if (action === 'folder.rename') {
    const folder = folderById(layout, body.id)
    if (!folder) throw new Error('unknown folder')
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, LIMIT.name) : folder.name
    folder.name = name
    return { folder }
  }

  if (action === 'folder.delete') {
    const folder = folderById(layout, body.id)
    if (!folder) throw new Error('unknown folder')
    layout.folders = folders.filter((item) => item.id !== folder.id)
    for (const [key, folderId] of Object.entries(layout.assignments)) {
      if (folderId === folder.id) {
        delete layout.assignments[key]
        remember(layout, 'root', key)
      }
    }
    delete layout.manual[folder.id]
    return { removed: folder.id }
  }

  if (action === 'folder.reorder') {
    const ids = Array.isArray(body.ids) ? body.ids.filter((id) => folderById(layout, id)) : []
    const rest = folders.filter((folder) => !ids.includes(folder.id))
    layout.folders = [...ids.map((id) => folderById(layout, id)), ...rest]
    return {}
  }

  if (action === 'folder.sort') {
    const sort = body.sort === 'auto' ? 'auto' : 'manual'
    if (body.id === 'favorites') layout.favorites.sort = sort
    else {
      const folder = folderById(layout, body.id)
      if (!folder) throw new Error('unknown folder')
      folder.sort = sort
    }
    return {}
  }

  if (action === 'folder.collapse') {
    const collapsed = body.collapsed === true
    if (body.id === 'favorites') layout.favorites.collapsed = collapsed
    else {
      const folder = folderById(layout, body.id)
      if (!folder) throw new Error('unknown folder')
      folder.collapsed = collapsed
    }
    return {}
  }

  if (action === 'assign') {
    const key = typeof body.key === 'string' ? body.key : ''
    if (!SAFE_KEY.test(key)) throw new Error('bad key')
    const folderId = body.folderId === null || body.folderId === undefined ? null : body.folderId
    for (const container of Object.keys(layout.manual)) forget(layout, container, key)
    if (folderId === null) {
      delete layout.assignments[key]
      remember(layout, 'root', key)
    } else {
      const folder = folderById(layout, folderId)
      if (!folder) throw new Error('unknown folder')
      layout.assignments[key] = folder.id
      remember(layout, folder.id, key)
    }
    return {}
  }

  if (action === 'favorite') {
    const key = typeof body.key === 'string' ? body.key : ''
    if (!SAFE_KEY.test(key)) throw new Error('bad key')
    const keys = new Set(layout.favorites.keys)
    if (body.favorite === false) {
      keys.delete(key)
      forget(layout, 'favorites', key)
    } else {
      keys.add(key)
      remember(layout, 'favorites', key)
    }
    layout.favorites.keys = [...keys]
    return {}
  }

  if (action === 'order') {
    const container = typeof body.container === 'string' ? body.container : ''
    if (container !== 'root' && container !== 'favorites' && !folderById(layout, container)) throw new Error('unknown container')
    layout.manual[container] = cleanKeys(body.keys)
    return {}
  }

  if (action === 'view') {
    layout.view = body.mode === 'grid' ? 'grid' : 'list'
    return { view: layout.view }
  }

  throw new Error('unknown layout action')
}

/* ------------------------------------------------------------------ */
/* HTTP 工具                                                           */
/* ------------------------------------------------------------------ */

function sendJson(res, status, value) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(value))
}
function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.statusCode = status
  res.setHeader('Content-Type', contentType)
  res.end(text)
}
function sendFile(res, file, contentType) {
  try {
    const data = readFileSync(file)
    res.statusCode = 200
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'no-cache')
    res.end(data)
  } catch {
    sendText(res, 404, 'not found')
  }
}
function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > LIMIT.body) {
        reject(new Error('body too large'))
        try { req.destroy() } catch {}
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolvePromise(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}
async function readJson(req) {
  const buf = await readBody(req)
  if (buf.length === 0) return {}
  return JSON.parse(buf.toString('utf8'))
}
function isLoopback(req) {
  const address = req.socket && req.socket.remoteAddress
  if (typeof address !== 'string' || address === '') return true
  return address === '::1' || address === '127.0.0.1' || address.startsWith('::ffff:127.') || address.startsWith('127.')
}

/* ------------------------------------------------------------------ */
/* 路由                                                                */
/* ------------------------------------------------------------------ */

function makeHandlers(ctx, originalList) {
  async function listOriginal() {
    const pm = managerOf(ctx)
    if (!pm || typeof pm.listBundles !== 'function') return []
    try {
      const fn = originalList.current || pm.listBundles
      const result = await fn.call(pm)
      return Array.isArray(result) ? result : []
    } catch (error) {
      log('warn', '读取已装插件失败：', String(error))
      return []
    }
  }

  function metaSummary(meta) {
    if (!meta || typeof meta !== 'object') return undefined
    return {
      title: meta.title,
      description: meta.description,
      icon: typeof meta.icon === 'string' ? meta.icon : undefined,
      error: typeof meta.error === 'string' ? meta.error : undefined
    }
  }

  async function state() {
    const bundles = (await listOriginal()).filter((pkg) => pkg && typeof pkg === 'object' && typeof pkg.name === 'string')
    ensureAutoIcons(bundles)
    seedExperimentalFolder(bundles)
    const store = loadStore()
    return {
      ok: true,
      enabled: store.enabled !== false,
      cards: store.cards,
      layout: store.layout,
      builtin: builtinIcons(),
      bundles: bundles.map((pkg) => ({
        name: pkg.name,
        version: pkg.version,
        enabled: pkg.enabled === true,
        installed: pkg.installed !== false,
        official: pkg.official === true,
        removable: pkg.removable === true,
        readOnlyReason: typeof pkg.readOnlyReason === 'string' ? pkg.readOnlyReason : undefined,
        original: metaSummary(pkg.meta),
        rows: Array.isArray(pkg.rows)
          ? pkg.rows
              .filter((row) => row && typeof row.rowId === 'string')
              .map((row) => ({
                rowId: row.rowId,
                moduleName: row.moduleName,
                entryId: row.entryId,
                enabled: row.enabled === true,
                readOnlyReason: typeof row.readOnlyReason === 'string' ? row.readOnlyReason : undefined,
                original: metaSummary(row.meta)
              }))
          : []
      }))
    }
  }

  async function toggle(body) {
    const pm = managerOf(ctx)
    if (!pm) throw new Error('pluginManager unavailable')
    const name = typeof body.name === 'string' ? body.name : ''
    const enabled = body.enabled === true
    if (!SAFE_KEY.test(name)) throw new Error('bad name')
    if (body.kind === 'row') {
      const rowId = typeof body.rowId === 'string' ? body.rowId : ''
      const list = await listOriginal()
      const pkg = list.find((item) => item.name === name)
      const row = pkg && Array.isArray(pkg.rows) ? pkg.rows.find((item) => item.rowId === rowId) : undefined
      if (!row || typeof row.entryId !== 'string') throw new Error('这一行不能单独开关')
      if (typeof pm.setPluginEnabled !== 'function') throw new Error('setPluginEnabled unavailable')
      await pm.setPluginEnabled(row.entryId, enabled)
      return { target: 'row' }
    }
    if (typeof pm.setBundleEnabled !== 'function') throw new Error('setBundleEnabled unavailable')
    await pm.setBundleEnabled(name, enabled)
    return { target: 'bundle' }
  }

  async function handle(req, res, path) {
    if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'loopback only' })
    const method = (req.method || 'GET').toUpperCase()

    if (method === 'GET' && path === ROUTE + '/state') return sendJson(res, 200, await state())

    if (method === 'GET' && path === ROUTE + '/_debug/list' && (process.env.PLUGIN_NAMECARDS_DEBUG || process.env.PLUGIN_CARDS_DEBUG) === '1') {
      const pm = managerOf(ctx)
      const decorated = pm && typeof pm.listBundles === 'function' ? await pm.listBundles() : []
      return sendJson(res, 200, { ok: true, count: Array.isArray(decorated) ? decorated.length : 0, decorated })
    }

    if (method === 'GET' && path === ROUTE + '/export') {
      res.setHeader('Content-Disposition', 'attachment; filename="dsh-plugin-namecards.json"')
      return sendJson(res, 200, exportStore())
    }

    if (method === 'GET' && path.startsWith(ROUTE + '/icon/builtin/')) {
      const id = path.slice((ROUTE + '/icon/builtin/').length).replace(/\.svg$/, '')
      if (!SAFE_BUILTIN.test(id)) return sendText(res, 404, 'not found')
      return sendFile(res, join(ASSETS_DIR, 'icons', id + '.svg'), MIME['.svg'])
    }

    if (method === 'GET' && path.startsWith(ROUTE + '/icon/file/')) {
      const name = path.slice((ROUTE + '/icon/file/').length)
      if (!SAFE_FILE.test(name)) return sendText(res, 404, 'not found')
      const file = join(iconsDir(), name)
      if (!resolve(file).startsWith(resolve(iconsDir()) + sep)) return sendText(res, 404, 'not found')
      return sendFile(res, file, MIME[extname(name).toLowerCase()] || 'application/octet-stream')
    }

    if (method === 'POST') {
      let body
      try { body = await readJson(req) } catch (error) { return sendJson(res, 400, { ok: false, error: 'bad json: ' + String(error) }) }

      if (path === ROUTE + '/save') {
        const key = typeof body.key === 'string' ? body.key : ''
        if (!SAFE_KEY.test(key)) return sendJson(res, 400, { ok: false, error: 'bad key' })
        const store = loadStore()
        const card = normalizeCard(body.card)
        if (card === undefined) delete store.cards[key]
        else {
          delete card.autoAssigned
          store.cards[key] = card
        }
        writeStore(store)
        return sendJson(res, 200, { ok: true, cards: store.cards })
      }

      if (path === ROUTE + '/reset') {
        const key = typeof body.key === 'string' ? body.key : ''
        if (!SAFE_KEY.test(key)) return sendJson(res, 400, { ok: false, error: 'bad key' })
        const store = loadStore()
        // 保留 autoIcon:false：清空自定义内容，同时明确表示「不要自动补图标」。
        store.cards[key] = { autoIcon: false }
        writeStore(store)
        return sendJson(res, 200, { ok: true, cards: store.cards })
      }

      if (path === ROUTE + '/upload') {
        const key = typeof body.key === 'string' ? body.key : ''
        const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : ''
        if (!SAFE_KEY.test(key)) return sendJson(res, 400, { ok: false, error: 'bad key' })
        const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl)
        if (match === null) return sendJson(res, 400, { ok: false, error: 'bad data url' })
        const ext = UPLOAD_MIME_EXT[match[1].toLowerCase()]
        if (ext === undefined) return sendJson(res, 400, { ok: false, error: 'unsupported image type' })
        const bytes = Buffer.from(match[2], 'base64')
        if (bytes.length === 0) return sendJson(res, 400, { ok: false, error: 'empty image' })
        if (bytes.length > LIMIT.icon) return sendJson(res, 400, { ok: false, error: 'image too large (max 600 KiB)' })
        ensureDirs()
        const token = createHash('sha256').update(bytes).digest('hex').slice(0, 16) + ext
        writeFileSync(join(iconsDir(), token), bytes)
        return sendJson(res, 200, { ok: true, token: 'file:' + token, url: iconUrl('file:' + token) })
      }

      if (path === ROUTE + '/settings') {
        const store = loadStore()
        store.enabled = body.enabled !== false
        writeStore(store)
        return sendJson(res, 200, { ok: true, enabled: store.enabled })
      }

      if (path === ROUTE + '/layout') {
        const store = loadStore()
        try {
          const result = applyLayoutAction(store, body)
          writeStore(store)
          return sendJson(res, 200, { ok: true, layout: store.layout, ...result })
        } catch (error) {
          return sendJson(res, 400, { ok: false, error: String(error && error.message ? error.message : error) })
        }
      }

      if (path === ROUTE + '/toggle') {
        try {
          const result = await toggle(body)
          return sendJson(res, 200, { ok: true, ...result })
        } catch (error) {
          return sendJson(res, 400, { ok: false, error: String(error && error.message ? error.message : error) })
        }
      }

      if (path === ROUTE + '/import') {
        const raw = body.store && typeof body.store === 'object' ? body.store : body
        // 导出的 JSON 里带着上传图标的 base64：先落盘，卡片里的 file: token 才能继续用
        if (raw && raw.icons && typeof raw.icons === 'object') {
          ensureDirs()
          for (const [name, item] of Object.entries(raw.icons)) {
            if (!SAFE_FILE.test(name) || !item || typeof item.data !== 'string') continue
            try { writeFileSync(join(iconsDir(), name), Buffer.from(item.data, 'base64')) } catch {}
          }
        }
        const store = normalizeStore(raw)
        writeStore(store)
        return sendJson(res, 200, { ok: true, cards: store.cards, layout: store.layout })
      }
    }

    return sendJson(res, 404, { ok: false, error: 'not found' })
  }

  return { handle }
}

/* ------------------------------------------------------------------ */
/* 包装 pluginManager.listBundles                                      */
/* ------------------------------------------------------------------ */

function installWrap(sub, originalList) {
  const pm = realService(sub.pluginManager)
  if (!pm || typeof pm.listBundles !== 'function' || pm[PATCHED] === true) return
  const original = pm.listBundles
  originalList.current = original
  const wrapped = async function (...args) {
    const result = await original.apply(pm, args)
    try {
      ensureAutoIcons(result)
      return decorateList(result, loadStore())
    } catch (error) {
      log('warn', '名片装饰失败，返回原始数据：', String(error))
      return result
    }
  }
  try {
    pm.listBundles = wrapped
    pm[PATCHED] = true
  } catch (error) {
    log('warn', '无法包装 pluginManager.listBundles：', String(error))
    return
  }
  sub.effect(() => () => {
    if (pm.listBundles === wrapped) {
      try { pm.listBundles = original } catch {}
    }
    try { delete pm[PATCHED] } catch {}
  }, 'dsh-plugin-namecards: restore listBundles')
}

/* ------------------------------------------------------------------ */
/* 插件入口                                                            */
/* ------------------------------------------------------------------ */

export function apply(ctx) {
  const originalList = { current: undefined }
  const { handle } = makeHandlers(ctx, originalList)

  ctx.effect(() => {
    try {
      return ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE,
        handler: async (req, res) => {
          try {
            const url = new URL(req.url || ROUTE, 'http://localhost')
            await handle(req, res, url.pathname)
          } catch (error) {
            log('warn', '路由处理失败：', String(error))
            try { sendJson(res, 500, { ok: false, error: String(error) }) } catch {}
          }
        }
      })
    } catch (error) {
      log('warn', '注册 /dsh-plugin-namecards 路由失败：', String(error))
      return () => {}
    }
  }, 'dsh-plugin-namecards: routes')

  try {
    ctx.inject(['pluginManager'], (sub) => {
      installWrap(sub, originalList)
    })
  } catch (error) {
    log('warn', 'pluginManager 注入失败：', String(error))
  }
}
