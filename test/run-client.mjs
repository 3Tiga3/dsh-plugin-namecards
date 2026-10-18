// 客户端 bundle 冒烟测试：用 vm 提供 window.__ModuleLoader__ / react / jsx-runtime / DOM 桩
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

let captured = null
const styleNodes = []
const sandbox = {
  console,
  fetch: async () => { throw new Error('fetch not stubbed') },
  document: {
    documentElement: { lang: 'zh-CN' },
    getElementById: () => null,
    createElement: (tag) => ({ tagName: tag, attrs: {}, textContent: '', setAttribute(key, value) { this.attrs[key] = value } }),
    head: { querySelector: () => null, appendChild: (el) => styleNodes.push(el) }
  },
  navigator: { language: 'zh-CN' },
  window: { __ModuleLoader__: { load(entry) { captured = entry } } }
}
vm.createContext(sandbox)
vm.runInContext(code, sandbox)

assert.ok(captured !== null, 'client 应调用 window.__ModuleLoader__.load')
assert.equal(captured.id, 'dsh-plugin-namecards')

const fakeReact = {
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useRef: (init) => ({ current: init })
}
const fakeJsx = (type, props) => ({ type, props })
const requireStub = (name) => {
  if (name === 'react') return fakeReact
  if (name === 'react/jsx-runtime') return { jsx: fakeJsx, jsxs: fakeJsx, Fragment: 'Fragment' }
  throw new Error('unexpected require: ' + name)
}

const exportsObj = captured.factory(requireStub)
assert.equal(exportsObj.name, 'dsh-plugin-namecards')
assert.deepEqual(Array.from(exportsObj.inject), ['slots'])
assert.equal(typeof exportsObj.apply, 'function')

const registrations = []
const ctx = {
  slots: {
    inject(slotName, callback) { callback() },
    register(options, component) {
      registrations.push({
        slot: options.name, id: options.id, order: options.order,
        label: typeof options.label === 'function' ? options.label() : options.label,
        component
      })
      return () => {}
    }
  }
}
exportsObj.apply(ctx)

assert.equal(registrations.length, 2, '应注册一个页签 + 一个详情区块')
const tab = registrations.find((item) => item.slot === 'plugins.tab' && item.id === 'dsh-plugin-namecards')
const section = registrations.find((item) => item.slot === 'plugins.detail.section')
assert.ok(tab, '缺少备注管理页签')
assert.ok(section, '缺少详情页区块')
assert.equal(tab.label, '插件管理')
assert.equal(typeof tab.component, 'function')
assert.equal(typeof section.component, 'function')
assert.equal(styleNodes.length, 1, '应注入一份内联样式表')
assert.equal(styleNodes[0].tagName, 'style')
assert.equal(styleNodes[0].attrs['data-dsh-plugin-namecards'], '1')
assert.ok(styleNodes[0].textContent.includes('.dpc-root'), '样式内容应内联在 client.js 中')
assert.ok(styleNodes[0].textContent.length > 5000)

console.log('client smoke ok: ' + registrations.map((item) => item.slot + '#' + item.id).join(', '))
