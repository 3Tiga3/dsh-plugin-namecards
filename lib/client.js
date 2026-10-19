/**
 * 插件名片 · 浏览器半边（v0.2）
 *
 * 页签：
 *  - 备注管理：按文件夹/收藏分组，组合包可折叠子行；右侧编辑图标/说明/备注
 *  - 插件管理：列表 / 铺陈两种视图，文件夹、收藏、拖拽排序、启用开关
 * 详情页：保留「名片」区块
 */
window.__ModuleLoader__.load({
  id: "dsh-plugin-namecards",
  factory: (require) => {
    const react = require("react")
    const { useCallback, useEffect, useMemo, useRef, useState } = react
    const { jsx, jsxs } = require("react/jsx-runtime")

    const name = "dsh-plugin-namecards"
    const inject = ["slots"]
    const BASE = "/dsh-plugin-namecards"
    const MAX_DESC = 300
    const MAX_NOTE = 60
    const COLLATOR = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" })

    /* ---------------- 工具 ---------------- */

    function iconUrl(token) {
      if (typeof token !== "string") return undefined
      if (token.indexOf("builtin:") === 0) return BASE + "/icon/builtin/" + token.slice(8) + ".svg"
      if (token.indexOf("file:") === 0) return BASE + "/icon/file/" + token.slice(5)
      return undefined
    }

    function rowKey(bundleName, rowId) { return bundleName + "#" + rowId }

    function resolveText(value) {
      if (typeof value === "string") return value
      if (value === null || typeof value !== "object") return undefined
      const lang = String((document.documentElement && document.documentElement.lang) || navigator.language || "zh").toLowerCase()
      if (typeof value[lang] === "string") return value[lang]
      if (lang.indexOf("zh") === 0 && typeof value.zh === "string") return value.zh
      if (typeof value.en === "string") return value.en
      const values = Object.keys(value).map((k) => value[k]).filter((v) => typeof v === "string")
      return values.length > 0 ? values[0] : undefined
    }

    function isHan(text) { return /[\u3400-\u9fff]/.test(String(text || "")) }

    async function apiGet(path) {
      const response = await fetch(BASE + path, { headers: { Accept: "application/json" }, credentials: "same-origin" })
      if (!response.ok) throw new Error("HTTP " + response.status)
      return response.json()
    }

    async function apiPost(path, body) {
      const response = await fetch(BASE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body)
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.ok === false) throw new Error(data.error || ("HTTP " + response.status))
      return data
    }

    /* @dsh-plugin-namecards-css-start */
    const CSS_TEXT = ".dpc-root{display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary,#e9ecf2);font-size:13px;line-height:20px;max-width:100%}\n.dpc-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px}\n.dpc-spacer{flex:1}\n.dpc-hint{color:var(--dsw-alias-label-tertiary,#8e96a5);font-size:12px;line-height:18px}\n.dpc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l3,#2a2f3a);background:transparent;color:inherit;font:inherit;cursor:pointer;text-decoration:none;box-sizing:border-box}\n.dpc-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#1f242e)}\n.dpc-btn[disabled]{opacity:.5;cursor:default}\n.dpc-btn--primary{background:var(--dsw-alias-state-business-primary,#5b8cff);border-color:transparent;color:#0b1220;font-weight:600}\n.dpc-btn--danger{color:#f27373}\n.dpc-input,.dpc-textarea{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l3,#2a2f3a);border-radius:9px;background:var(--dsw-alias-bg-l1,#14171d);color:inherit;font:inherit;padding:8px 10px;resize:vertical}\n.dpc-input:focus,.dpc-textarea:focus{outline:2px solid var(--dsw-alias-state-business-primary,#5b8cff);outline-offset:-1px;border-color:transparent}\n.dpc-search{width:260px;height:30px;padding:4px 10px}\n.dpc-seg{display:inline-flex;border:1px solid var(--dsw-alias-border-l3,#2a2f3a);border-radius:8px;padding:2px;gap:2px;background:#141821}\n.dpc-segbtn{border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#8e96a5);font:inherit;font-size:11.5px;padding:3px 12px;border-radius:6px;cursor:pointer}\n.dpc-segbtn.is-on{background:#2A3140;color:var(--dsw-alias-label-primary,#e9ecf2);font-weight:600}\n.dpc-caret{border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#8e96a5);cursor:pointer;font-size:11px;padding:2px 4px;line-height:1}\n.dpc-caret--inline{margin-right:2px}\n.dpc-ctitle{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary,#e9ecf2)}\n.dpc-ccount{font-size:11px;color:var(--dsw-alias-label-tertiary,#8e96a5)}\n.dpc-ricon{width:18px;height:18px;flex:none;display:flex;align-items:center;justify-content:center}\n/* editor */\n.dpc-editor{display:flex;flex-direction:column;gap:12px}\n.dpc-editor--compact{gap:10px}\n.dpc-preview{display:flex;align-items:center;gap:12px;padding:10px;border:1px dashed var(--dsw-alias-border-l3,#2a2f3a);border-radius:10px;background:#14171d}\n.dpc-preview img{border-radius:10px;object-fit:contain}\n.dpc-preview .dpc-ph{width:44px;height:44px;border-radius:10px;flex:none;background:#222833;display:flex;align-items:center;justify-content:center;color:#9aa3b2}\n.dpc-preview-main{min-width:0;flex:1}\n.dpc-preview-title{font-weight:600;font-size:13px}\n.dpc-preview-desc{color:var(--dsw-alias-label-secondary,#8e96a5);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.dpc-field{display:flex;flex-direction:column;gap:6px}\n.dpc-label{display:flex;align-items:center;gap:8px;font-weight:600;font-size:12px;flex-wrap:wrap}\n.dpc-label .dpc-hint{margin-left:auto;font-weight:400}\n.dpc-count{font-size:11px;color:var(--dsw-alias-label-tertiary,#8e96a5);text-align:right}\n.dpc-icons{display:flex;flex-wrap:wrap;gap:8px;align-items:center}\n.dpc-icon{width:38px;height:38px;padding:0;border-radius:9px;border:2px solid transparent;background:transparent;cursor:pointer;overflow:hidden;flex:none}\n.dpc-icon img{width:100%;height:100%;display:block;border-radius:7px}\n.dpc-icon.is-on{border-color:var(--dsw-alias-state-business-primary,#5b8cff)}\n.dpc-icon--upload{display:flex;align-items:center;justify-content:center;border:1px dashed var(--dsw-alias-border-l3,#2a2f3a);color:var(--dsw-alias-label-tertiary,#8e96a5);font-size:17px}\n.dpc-switch{display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none;font-size:12px}\n.dpc-switch input{accent-color:var(--dsw-alias-state-business-primary,#5b8cff);width:15px;height:15px}\n.dpc-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}\n.dpc-toast{padding:6px 10px;border-radius:8px;background:#1f2a3d;color:#bcd2ff;font-size:12px;align-self:flex-start}\n.dpc-toast--floating{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:90;box-shadow:0 6px 24px rgba(0,0,0,.35)}\n/* manager list */\n.dpc-manager-list{display:flex;flex-direction:column;gap:10px;padding-bottom:40px}\n.dpc-mcontainer{border:1px solid var(--dsw-alias-border-l3,#2a2f3a);border-radius:12px;background:#12151c;overflow:hidden}\n.dpc-mchead{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#14171d;border-bottom:1px solid var(--dsw-alias-border-l3,#2a2f3a)}\n.dpc-mitems{display:flex;flex-direction:column;gap:2px;padding:6px}\n.dpc-mbundle{border-radius:8px}\n.dpc-mbundle.is-drag,.dpc-icon-cell.is-drag{opacity:.5}\n.dpc-mrow{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-l1,#171a21);cursor:pointer}\n.dpc-mrow:hover{background:var(--dsw-alias-interactive-bg-hover,#1f242e)}\n.dpc-mrow--sub{background:transparent;padding:4px 10px;font-size:12px}\n.dpc-mrow--sub:hover{background:#1b1f27}\n.dpc-drag{color:var(--dsw-alias-label-tertiary,#646c7a);cursor:grab;font-size:12px;flex:none;width:12px;text-align:center}\n.dpc-micon{width:34px;height:34px;flex:none;display:flex;align-items:center;justify-content:center}\n.dpc-micon img{border-radius:8px;object-fit:contain}\n.dpc-mmain{min-width:0;flex:1}\n.dpc-mname{font-size:12.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.dpc-mname--sub{font-weight:400;font-size:11.5px;flex:1}\n.dpc-mdesc{font-size:11px;color:var(--dsw-alias-label-tertiary,#8e96a5);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.dpc-more{border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#8e96a5);cursor:pointer;font-size:13px;padding:2px 6px;border-radius:6px}\n.dpc-more:hover{background:var(--dsw-alias-interactive-bg-hover,#1f242e);color:var(--dsw-alias-label-primary,#e9ecf2)}\n.dpc-mempty{padding:8px}\n.dpc-mrows{display:flex;flex-direction:column;gap:1px;padding:2px 0 4px 34px}\n/* stars & mini switch */\n.dpc-star{border:0;background:transparent;cursor:pointer;font-size:15px;color:#6b7280;padding:2px 6px;border-radius:6px;flex:none}\n.dpc-star.is-on{color:#F5C451}\n.dpc-star--small{font-size:12px;padding:0 4px}\n.dpc-star:hover{background:#232833}\n.dpc-mini-switch{position:relative;display:inline-flex;flex:none;width:32px;height:18px;cursor:pointer}\n.dpc-mini-switch input{position:absolute;opacity:0;width:0;height:0}\n.dpc-mini-track{width:32px;height:18px;border-radius:9px;background:#3A3F4B;transition:background .15s}\n.dpc-mini-track:after{content:\"\";position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:#0E1015;transition:left .15s}\n.dpc-mini-switch input:checked + .dpc-mini-track{background:#3DDC97}\n.dpc-mini-switch input:checked + .dpc-mini-track:after{left:16px}\n.dpc-mini-switch input:disabled + .dpc-mini-track{opacity:.4}\n/* grid */\n.dpc-gridwrap{display:flex;flex-direction:column;gap:26px;padding-bottom:60px}\n.dpc-tiles{display:flex;flex-wrap:wrap;gap:26px}\n.dpc-tile{border:0;background:transparent;color:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:8px;padding:0;font:inherit}\n.dpc-tilebox{width:132px;height:132px;border-radius:26px;background:#1B1F27;border:1px solid #303643;display:flex;align-items:center;justify-content:center;position:relative}\n.dpc-tile:hover .dpc-tilebox{border-color:#4a5568}\n.dpc-tilegrid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}\n.dpc-tilemini{width:26px;height:26px;display:flex;align-items:center;justify-content:center}\n.dpc-tilemini img{border-radius:6px;object-fit:contain}\n.dpc-tilemini .dpc-ph{border-radius:6px;background:#2a3040;display:flex;align-items:center;justify-content:center;color:#9aa3b2}\n.dpc-tilestar{position:absolute;left:10px;top:8px;color:#F5C451;font-size:12px}\n.dpc-tilename{font-size:12px;color:var(--dsw-alias-label-secondary,#8e96a5);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.dpc-tile--new .dpc-tilebox{border-style:dashed;background:transparent}\n.dpc-tileplus{font-size:30px;color:#4a5568}\n.dpc-rootgrid{display:flex;flex-direction:column;gap:10px}\n.dpc-iconrow{display:flex;flex-wrap:wrap;gap:18px}\n.dpc-icon-cell{width:104px;display:flex;flex-direction:column;align-items:center;gap:6px;position:relative;cursor:pointer;padding:6px;border-radius:12px}\n.dpc-icon-cell:hover{background:#171b23}\n.dpc-iconbox img{border-radius:14px;object-fit:contain}\n.dpc-iconbox .dpc-ph{border-radius:14px;background:#222833;display:flex;align-items:center;justify-content:center;color:#9aa3b2}\n.dpc-iconstar{position:absolute;right:2px;top:0}\n.dpc-iconswitch{margin-top:2px}\n/* folder overlay */\n.dpc-overlay{position:fixed;inset:0;background:rgba(6,8,12,.72);display:flex;align-items:center;justify-content:center;z-index:80}\n.dpc-overlay-grid{display:flex;flex-wrap:wrap;gap:18px}\n/* editor drawer */\n.dpc-drawer{position:fixed;top:120px;right:24px;bottom:24px;width:380px;max-width:92vw;overflow:auto;background:#12151c;border:1px solid #2a2f3a;border-radius:16px;padding:14px;z-index:70;box-shadow:0 12px 40px rgba(0,0,0,.45)}\n.dpc-drawer-head{display:flex;align-items:center;justify-content:space-between;font-weight:600;font-size:13px;margin-bottom:10px}\n.dpc-empty{padding:24px;text-align:center;color:var(--dsw-alias-label-tertiary,#8e96a5);border:1px dashed var(--dsw-alias-border-l3,#2a2f3a);border-radius:12px}\n.dpc-section{border:1px solid var(--dsw-alias-border-l3,#2a2f3a);border-radius:12px;padding:14px;margin-top:12px;display:flex;flex-direction:column;gap:12px}\n.dpc-section h4{margin:0;font-size:13px;font-weight:600}\n@media (max-width:900px){.dpc-drawer{left:16px;right:16px;width:auto;top:auto;bottom:16px;max-height:70vh}}\n\n/* ---- v0.2.2: 合并页 + 更大的点击目标 + 内容区内弹层 ---- */\n.dpc-root{position:relative;min-height:480px}\n.dpc-caret{font-size:14px;padding:6px 9px;min-width:26px;min-height:26px;border-radius:6px}\n.dpc-caret:hover{background:#232833}\n.dpc-drag{width:18px;font-size:14px;padding:6px 3px}\n.dpc-star{font-size:18px;padding:4px 9px;min-width:34px;min-height:32px;line-height:1}\n.dpc-star--small{font-size:15px;padding:2px 7px;min-width:28px;min-height:26px}\n.dpc-more{font-size:16px;padding:4px 10px;min-width:30px;min-height:30px}\n.dpc-mrow{padding:10px 12px;gap:12px}\n.dpc-mname{font-size:13px}\n.dpc-mdesc{font-size:11.5px}\n.dpc-micon{width:36px;height:36px}\n.dpc-micon img{border-radius:9px}\n.dpc-mchead{padding:10px 14px;gap:10px}\n.dpc-ctitle{font-size:13.5px}\n.dpc-mini-switch{width:38px;height:22px}\n.dpc-mini-track{width:38px;height:22px;border-radius:11px}\n.dpc-mini-track:after{width:18px;height:18px;left:2px;top:2px}\n.dpc-mini-switch input:checked + .dpc-mini-track:after{left:18px}\n.dpc-mrows{padding:2px 0 6px 42px}\n.dpc-segbtn{padding:4px 14px;font-size:12px}\n.dpc-btn{height:32px}\n.dpc-overlay{position:absolute;inset:0;background:rgba(6,8,12,.72);display:flex;align-items:center;justify-content:center;padding:28px;z-index:60;border-radius:12px}\n.dpc-overlay--dialog{z-index:75}\n.dpc-modal{width:min(980px,96%);max-height:88%;display:flex;flex-direction:column;background:#12151c;border:1px solid #2a2f3a;border-radius:18px;overflow:hidden;box-shadow:0 18px 60px rgba(0,0,0,.5)}\n.dpc-modal-head{display:flex;align-items:center;gap:10px;padding:14px 18px;background:#151922;border-bottom:1px solid #262b36;flex:none}\n.dpc-modal-body{padding:18px;overflow:auto;min-height:80px}\n.dpc-modal-foot{display:flex;justify-content:flex-end;gap:10px;padding:12px 18px;border-top:1px solid #262b36;flex:none}\n.dpc-modal--dialog{width:min(430px,92%)}\n.dpc-menu{display:flex;flex-direction:column;gap:6px}\n.dpc-menuitem{text-align:left;padding:10px 12px;border-radius:8px;border:1px solid #2a2f3a;background:#171a21;color:inherit;font:inherit;cursor:pointer}\n.dpc-menuitem:hover{background:#202631}\n.dpc-menuitem.is-danger{color:#f27373}\n.dpc-overlay-grid{display:flex;flex-wrap:wrap;gap:18px}\n@media (max-width:900px){.dpc-overlay{padding:12px}.dpc-modal{max-height:92%}}\n\n/* ---- v0.2.3: 更大的网格图标 + 图标下备注名 ---- */\n.dpc-icon-cell{width:122px;gap:8px}\n.dpc-iconbox img{width:72px;height:72px;border-radius:16px}\n.dpc-iconbox .dpc-ph{width:72px;height:72px;border-radius:16px;font-size:26px}\n.dpc-iconname{font-size:12px;line-height:16px;max-width:116px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;color:var(--dsw-alias-label-primary,#e9ecf2)}\n.dpc-overlay-grid .dpc-icon-cell{width:128px}\n.dpc-modal{position:relative;z-index:2}\n.dpc-tilemini{width:30px;height:30px}\n.dpc-tilemini img{border-radius:7px}\n.dpc-drawer{top:96px}\n\n/* ---- v0.2.4: 文件夹弹窗无标题栏，点空白退出；按备注名排序 ---- */\n.dpc-btn.is-on{background:#2A3140;border-color:#3a4353;color:var(--dsw-alias-label-primary,#e9ecf2)}\n.dpc-modal--folder{width:min(980px,96%);max-height:88%;background:#12151c;border:1px solid #2a2f3a;border-radius:18px;box-shadow:0 18px 60px rgba(0,0,0,.55);overflow:auto;cursor:default}\n.dpc-modal--folder .dpc-modal-body{padding:26px}\n\n/* ---- v0.2.7: 编辑器里的文件夹选择 + 导入导出合并 ---- */\n.dpc-select{box-sizing:border-box;width:100%;height:32px;border:1px solid var(--dsw-alias-border-l3,#2a2f3a);border-radius:9px;background:var(--dsw-alias-bg-l1,#14171d);color:inherit;font:inherit;padding:0 10px}\n.dpc-select:focus{outline:2px solid var(--dsw-alias-state-business-primary,#5b8cff);outline-offset:-1px;border-color:transparent}\n\n/* ---- v0.3.5: 文件夹拖拽排序 ---- */\n.dpc-mchead.dpc-draggable{cursor:grab}\n.dpc-mchead.dpc-draggable:active{cursor:grabbing}\n.dpc-tile[draggable=\"true\"]{cursor:grab}\n.dpc-mcontainer.is-drag,.dpc-tile.is-drag{opacity:.5}\n\n\n/* ---- v0.5.0: 中文说明多行 ---- */\n.dpc-preview-desc{white-space:pre-wrap;overflow:visible;text-overflow:clip;word-break:break-word;max-height:140px;overflow-y:auto}\n\n/* ---- v0.6.0: 文件夹弹窗美化 ---- */\n.dpc-overlay{background:rgba(5,7,11,.66);backdrop-filter:blur(10px) saturate(1.15);-webkit-backdrop-filter:blur(10px) saturate(1.15)}\n.dpc-modal--folder{width:min(900px,94vw);max-height:min(76vh,780px);background:linear-gradient(180deg,rgba(26,31,42,.98),rgba(17,21,29,.99));border:1px solid rgba(122,162,255,.20);border-radius:20px;box-shadow:0 28px 90px rgba(0,0,0,.60),inset 0 1px 0 rgba(255,255,255,.05);overflow:hidden}\n.dpc-modal--folder .dpc-modal-body{padding:22px;overflow:auto;max-height:calc(76vh - 4px);scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.20) transparent}\n.dpc-modal--folder .dpc-modal-body::-webkit-scrollbar{width:10px}\n.dpc-modal--folder .dpc-modal-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.16);border-radius:8px;border:2px solid transparent;background-clip:content-box}\n.dpc-modal--folder .dpc-modal-body::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.28);background-clip:content-box}\n.dpc-overlay-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:12px;align-items:start}\n.dpc-overlay-grid .dpc-icon-cell{width:auto;min-width:0;padding:12px 8px 10px;gap:8px;border-radius:14px;border:1px solid rgba(255,255,255,.055);background:rgba(255,255,255,.025);transition:background .15s ease,border-color .15s ease,transform .15s ease,box-shadow .15s ease}\n.dpc-overlay-grid .dpc-icon-cell:hover{background:rgba(255,255,255,.06);border-color:rgba(122,162,255,.38);transform:translateY(-2px);box-shadow:0 10px 24px rgba(0,0,0,.28)}\n.dpc-overlay-grid .dpc-iconbox img{width:64px;height:64px;border-radius:16px;box-shadow:0 6px 16px rgba(0,0,0,.28)}\n.dpc-overlay-grid .dpc-iconbox .dpc-ph{width:64px;height:64px;border-radius:16px;font-size:24px}\n.dpc-overlay-grid .dpc-iconname{max-width:100%;font-size:12px;line-height:16px;opacity:.92}\n.dpc-overlay-grid .dpc-iconstar{right:5px;top:3px;opacity:.7;transition:opacity .15s ease}\n.dpc-overlay-grid .dpc-icon-cell:hover .dpc-iconstar{opacity:1}\n.dpc-overlay-grid .dpc-iconswitch{margin-top:0}\n.dpc-overlay-grid .dpc-mini-switch{transform:scale(.94)}\n"
    /* @dsh-plugin-namecards-css-end */

    function injectCssInto(target, doc) {
      try {
        if (!target || typeof target.appendChild !== "function") return false
        if (target.querySelector && target.querySelector("style[data-dsh-plugin-namecards]")) return true
        const style = doc.createElement("style")
        style.setAttribute("data-dsh-plugin-namecards", "1")
        style.textContent = CSS_TEXT
        target.appendChild(style)
        return true
      } catch (error) {
        console.warn("[dsh-plugin-namecards] 注入样式失败：", error)
        return false
      }
    }

    function installStyles() {
      injectCssInto(document.head, document)
    }

    let lastUiRoot = null

    /** 收集 document 以及可达 shadow root，便于跨影子 DOM 找官方按钮。 */
    function searchRoots() {
      const roots = []
      try {
        if (typeof document !== 'undefined') roots.push(document)
        if (lastUiRoot && !roots.includes(lastUiRoot)) roots.push(lastUiRoot)
        const walk = (node, depth) => {
          if (!node || depth > 4 || typeof node.querySelectorAll !== 'function') return
          for (const el of Array.from(node.querySelectorAll('*'))) {
            if (el.shadowRoot && !roots.includes(el.shadowRoot)) {
              roots.push(el.shadowRoot)
              walk(el.shadowRoot, depth + 1)
            }
          }
        }
        walk(document, 0)
      } catch (error) {}
      return roots
    }

    let globalToastTimer = null

    /** 提示：挂在 document.body 上，不随 React 组件重挂载而消失；2 秒后自动消失。 */
    function showGlobalToast(text) {
      try {
        if (typeof document === 'undefined' || !document.body) return
        let node = document.getElementById('dpc-global-toast')
        if (!node) {
          node = document.createElement('div')
          node.id = 'dpc-global-toast'
          node.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;background:rgba(30,36,48,.96);color:#e8ecf5;font-family:inherit;font-size:13px;line-height:1.5;box-shadow:0 8px 24px rgba(0,0,0,.35);border:1px solid rgba(120,180,255,.35);max-width:min(560px,80vw)'
          const label = document.createElement('span')
          label.className = 'dpc-global-toast-text'
          const close = document.createElement('button')
          close.type = 'button'
          close.textContent = '×'
          close.setAttribute('aria-label', '关闭提示')
          close.style.cssText = 'background:none;border:none;color:#9fb0c9;font-size:16px;line-height:1;cursor:pointer;padding:0 0 0 2px'
          close.addEventListener('click', function () { try { node.remove() } catch (error) {} })
          node.appendChild(label)
          node.appendChild(close)
          document.body.appendChild(node)
        }
        const label = node.querySelector('.dpc-global-toast-text')
        if (label) label.textContent = text
        if (globalToastTimer) clearTimeout(globalToastTimer)
        globalToastTimer = setTimeout(function () {
          try { node.remove() } catch (error) {}
          globalToastTimer = null
        }, 2000)
      } catch (error) {}
    }

    /** 点击官方插件页「添加插件」旁边的刷新按钮，让官方列表立即重拉。 */
    function clickOfficialRefresh() {
      try {
        if (typeof document === 'undefined') return false
        const roots = searchRoots()
        const all = []
        for (const root of roots) {
          if (!root || typeof root.querySelectorAll !== 'function') continue
          for (const btn of Array.from(root.querySelectorAll('button'))) all.push(btn)
        }
        const addBtn = all.find((btn) => {
          const text = (btn.textContent || '').replace(/\s+/g, '')
          return text === '添加插件' || text === '＋添加插件' || text === '+添加插件'
        })
        if (addBtn && addBtn.parentElement) {
          const siblings = Array.from(addBtn.parentElement.querySelectorAll('button'))
          const index = siblings.indexOf(addBtn)
          const before = (index < 0 ? siblings : siblings.slice(0, index)).filter((btn) => !(btn.textContent || '').trim())
          if (before.length > 0) { before[before.length - 1].click(); return true }
        }
        const hit = all.find((btn) => {
          try { if (btn.closest('.dpc-root')) return false } catch (error) {}
          const label = String(btn.getAttribute('aria-label') || '') + ' ' + String(btn.getAttribute('title') || '')
          return /刷新|refresh/i.test(label)
        })
        if (hit) { hit.click(); return true }
      } catch (error) {}
      return false
    }

    function useInjectCss(ref) {
      useEffect(() => {
        const node = ref && ref.current
        if (!node) return
        const doc = node.ownerDocument || document
        try { lastUiRoot = node.getRootNode ? node.getRootNode() : doc } catch (error) {}
        injectCssInto(doc.head, doc)
        try {
          const root = node.getRootNode ? node.getRootNode() : null
          if (root && root !== doc && root !== doc.documentElement) injectCssInto(root, doc)
        } catch (error) { console.warn("[dsh-plugin-namecards] 影子根样式注入失败：", error) }
      }, [ref])
    }

    /* ---------------- 数据 ---------------- */

    function useCardsState() {
      const [state, setState] = useState({ status: "loading", data: null, error: null })
      const load = useCallback(async () => {
        setState((prev) => ({ status: prev.data ? "refreshing" : "loading", data: prev.data, error: null }))
        try {
          const data = await apiGet("/state")
          setState({ status: "ready", data, error: null })
        } catch (error) {
          setState((prev) => ({ status: "error", data: prev.data, error: String(error && error.message ? error.message : error) }))
        }
      }, [])
      useEffect(() => { load() }, [load])
      return { state, reload: load }
    }

    function cardOf(data, key) { return data && data.cards ? data.cards[key] : undefined }

    function sortNameOf(bundle, card) {
      // 排序用的「中文名」= 备注（显示名称）；没有备注就按包名。
      if (card && card.note) return card.note
      const title = resolveText(bundle.original && bundle.original.title)
      if (title && isHan(title)) return title
      return bundle.name
    }

    function buildModel(data) {
      const layout = (data && data.layout) || { folders: [], assignments: {}, favorites: { keys: [], sort: "manual", collapsed: false }, manual: {}, view: "list" }
      const BUILTIN_PROFILE_BUNDLES = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@deepseek-ai/dsh-headless", "@deepseek-ai/dsh-sdk-app", "@deepseek-ai/dsh-acp-app", "@deepseek-ai/dsh-sdk-minimal"]
      const bundles = ((data && data.bundles) || []).filter((bundle) => BUILTIN_PROFILE_BUNDLES.indexOf(bundle.name) < 0)
      const byName = new Map(bundles.map((bundle) => [bundle.name, bundle]))
      const manual = layout.manual || {}
      const displayName = (key) => {
        const card = cardOf(data, key)
        if (card && card.note) return card.note
        const bundle = byName.get(String(key).split("#")[0])
        if (!bundle) return key
        if (key.indexOf("#") >= 0) {
          const rowId = key.slice(key.indexOf("#") + 1)
          const row = (bundle.rows || []).find((item) => item.rowId === rowId)
          return (row && (row.moduleName || rowId)) || rowId
        }
        return bundle.name
      }
      const descriptionOf = (key) => {
        const card = cardOf(data, key)
        if (card && card.description) return card.description
        return resolveText((byName.get(String(key).split("#")[0]) || {}).original && (byName.get(String(key).split("#")[0]) || {}).original.description) || "（未写说明）"
      }
      const nameOf = (key) => {
        const bundle = byName.get(key)
        return bundle ? sortNameOf(bundle, cardOf(data, key)) : key
      }
      const ordered = (keys, container) => {
        const uniq = [...new Set(keys)]
        const index = new Map((manual[container] || []).map((key, i) => [key, i]))
        return uniq.sort((a, b) => {
          const ia = index.has(a) ? index.get(a) : 1e9
          const ib = index.has(b) ? index.get(b) : 1e9
          return ia !== ib ? ia - ib : COLLATOR.compare(nameOf(a), nameOf(b))
        })
      }
      const favKeys = new Set((layout.favorites && layout.favorites.keys) || [])
      const favoriteBundles = bundles
        .filter((bundle) => favKeys.has(bundle.name) || (bundle.rows || []).some((row) => favKeys.has(rowKey(bundle.name, row.rowId))))
        .map((bundle) => bundle.name)
      const containers = []
      containers.push({
        id: "favorites", kind: "favorites", title: "收藏",
        collapsed: Boolean(layout.favorites && layout.favorites.collapsed),
        keys: ordered(favoriteBundles, "favorites")
      })
      for (const folder of layout.folders || []) {
        const keys = bundles.filter((bundle) => layout.assignments[bundle.name] === folder.id).map((bundle) => bundle.name)
        containers.push({
          id: folder.id, kind: "folder", title: folder.name,
          collapsed: folder.collapsed === true,
          keys: ordered(keys, folder.id)
        })
      }
      const rootKeys = bundles.filter((bundle) => !layout.assignments[bundle.name]).map((bundle) => bundle.name)
      containers.push({ id: "root", kind: "root", title: "未分组", collapsed: false, keys: ordered(rootKeys, "root") })
      return {
        data, bundles, byName, layout, containers, favKeys,
        containerOf: (id) => containers.find((item) => item.id === id),
        displayName, descriptionOf
      }
    }

    function targetOf(model, key) {
      const bundle = model.byName.get(String(key).split("#")[0])
      const card = cardOf(model.data, key)
      if (!bundle) return null
      if (key.indexOf("#") >= 0) {
        const rowId = key.slice(key.indexOf("#") + 1)
        const row = (bundle.rows || []).find((item) => item.rowId === rowId)
        if (!row) return null
        return {
          key, title: model.displayName(key),
          subtitle: bundle.name + " · 行 " + rowId,
          fallbackIcon: row.original && row.original.icon,
          originalDescription: resolveText(row.original && row.original.description),
          originalIcon: row.original && row.original.icon,
          kind: "row", bundleName: bundle.name, rowId
        }
      }
      return {
        key, title: model.displayName(key),
        subtitle: bundle.version ? "v" + bundle.version : undefined,
        fallbackIcon: bundle.original && bundle.original.icon,
        originalDescription: resolveText(bundle.original && bundle.original.description),
        originalIcon: bundle.original && bundle.original.icon,
        kind: "bundle", bundleName: bundle.name,
        removable: bundle.removable === true
      }
    }

    /* ---------------- 编辑器 ---------------- */

    function draftFromCard(card) {
      return {
        description: (card && card.description) || "",
        note: (card && card.note) || "",
        icon: card && card.icon,
        autoIcon: card && card.autoIcon === false ? false : undefined
      }
    }

    function CardEditor(props) {
      const data = props.data
      const target = props.target
      const onSaved = props.onSaved
      const compact = props.compact === true
      const folders = props.folders
      const folderId = props.folderId
      const onMoveFolder = props.onMoveFolder
      const onDelete = props.onDelete
      const [draft, setDraft] = useState(() => draftFromCard(cardOf(data, target.key)))
      const [busy, setBusy] = useState(false)
      const [message, setMessage] = useState(null)
      const fileRef = useRef(null)

      useEffect(() => {
        setDraft(draftFromCard(cardOf(data, target.key)))
        setMessage(null)
      }, [data, target.key])

      const previewIcon = draft.icon ? iconUrl(draft.icon) : (target.fallbackIcon || iconUrl(target.originalIcon))
      const previewDescription = draft.description || target.originalDescription || "（还没写说明，卡片会显示作者原文）"
      const update = (patch) => setDraft((prev) => Object.assign({}, prev, patch))

      async function save() {
        setBusy(true); setMessage(null)
        try {
          await apiPost("/save", { key: target.key, card: { description: draft.description.replace(/\r\n?/g, "\n").trim() || undefined, note: draft.note.trim() || undefined, icon: draft.icon, autoIcon: draft.autoIcon === false ? false : undefined } })
          setMessage(null)
          showGlobalToast("已保存（当前列表已更新；官方「已安装」页刷新后生效）")
          if (onSaved) onSaved()
          setTimeout(function () { clickOfficialRefresh() }, 250)
        } catch (error) { setMessage("保存失败：" + (error && error.message ? error.message : String(error))) }
        finally { setBusy(false) }
      }

      function reset() {
        // 只重置草稿，点「保存」后才真正写入
        setDraft({ description: "", note: "", icon: undefined, autoIcon: false })
        setMessage("已恢复默认草稿，点「保存」后生效。")
      }

      function upload(file) {
        if (!file) return
        const reader = new FileReader()
        reader.onload = async () => {
          setBusy(true); setMessage(null)
          try {
            const result = await apiPost("/upload", { key: target.key, dataUrl: String(reader.result) })
            update({ icon: result.token, autoIcon: undefined })
            setMessage("图标已上传，记得点保存。")
          } catch (error) { setMessage("上传失败：" + (error && error.message ? error.message : String(error))) }
          finally { setBusy(false) }
        }
        reader.onerror = () => setMessage("读取图片失败。")
        reader.readAsDataURL(file)
      }

      const builtin = data && Array.isArray(data.builtin) ? data.builtin : []

      return jsxs("div", { className: "dpc-editor" + (compact ? " dpc-editor--compact" : ""), children: [
        jsxs("div", { className: "dpc-preview", children: [
          previewIcon ? jsx("img", { src: previewIcon, alt: "" }) : jsx("div", { className: "dpc-ph", children: "无" }),
          jsxs("div", { className: "dpc-preview-main", children: [
            jsx("div", { className: "dpc-preview-title", children: (draft.note && draft.note.trim()) || target.title }),
            jsx("div", { className: "dpc-preview-desc", children: previewDescription }),
            target.subtitle ? jsx("div", { className: "dpc-hint", children: target.subtitle }) : null
          ] })
        ] }),
        folders && onMoveFolder ? jsxs("div", { className: "dpc-field", children: [
          jsxs("div", { className: "dpc-label", children: [
            jsx("span", { children: "所在文件夹" }),
            jsx("span", { className: "dpc-hint", children: "移入文件夹；子行跟随组合包" })
          ] }),
          jsx("select", {
            className: "dpc-select",
            value: folderId || "",
            onChange: (event) => onMoveFolder(event.target.value || null),
            children: [
              jsx("option", { value: "", children: "未分组" }),
              ...folders.map((folder) => jsx("option", { value: folder.id, children: folder.title }, folder.id))
            ]
          })
        ] }) : null,
        jsxs("div", { className: "dpc-field", children: [
          jsxs("div", { className: "dpc-label", children: [
            jsx("span", { children: "图标" }),
            jsx("span", { className: "dpc-hint", children: "内置图标或上传图片（≤600 KB）" }),
            jsx("button", { type: "button", className: "dpc-btn", onClick: () => update({ icon: undefined, autoIcon: false }), children: "用回默认" })
          ] }),
          jsxs("div", { className: "dpc-icons", children: [
            builtin.map((icon) => jsx("button", {
              type: "button", title: icon.zh || icon.id,
              className: "dpc-icon" + (draft.icon === "builtin:" + icon.id ? " is-on" : ""),
              onClick: () => update({ icon: "builtin:" + icon.id, autoIcon: undefined }),
              children: jsx("img", { src: iconUrl("builtin:" + icon.id), alt: icon.zh || icon.id })
            }, icon.id)),
            jsx("button", { type: "button", className: "dpc-icon dpc-icon--upload", title: "上传图片", disabled: busy, onClick: () => fileRef.current && fileRef.current.click(), children: "+" }),
            jsx("input", { ref: fileRef, type: "file", accept: "image/png,image/jpeg,image/webp,image/svg+xml,image/gif", style: { display: "none" }, onChange: (event) => { const files = event.target.files; const file = files && files[0]; event.target.value = ""; upload(file) } })
          ] })
        ] }),
        jsxs("div", { className: "dpc-field", children: [
          jsxs("div", { className: "dpc-label", children: [jsx("span", { children: "中文说明" }), jsx("span", { className: "dpc-hint", children: "名称下面那一行介绍；留空 = 作者原文" })] }),
          jsx("textarea", { className: "dpc-textarea", rows: compact ? 3 : 4, maxLength: MAX_DESC, value: draft.description, placeholder: "一句话说清它是干嘛的", onChange: (event) => update({ description: event.target.value }) }),
          jsx("div", { className: "dpc-count", children: draft.description.length + " / " + MAX_DESC })
        ] }),
        jsxs("div", { className: "dpc-field", children: [
          jsxs("div", { className: "dpc-label", children: [jsx("span", { children: "备注（显示名称）" }), jsx("span", { className: "dpc-hint", children: "取代原包名显示；原名在详情页查看" })] }),
          jsx("input", { className: "dpc-input", maxLength: MAX_NOTE, value: draft.note, placeholder: "给它起个中文名，比如：灵枢记忆", onChange: (event) => update({ note: event.target.value }) })
        ] }),
        jsxs("div", { className: "dpc-actions", children: [
          jsx("button", { type: "button", className: "dpc-btn dpc-btn--primary", disabled: busy, onClick: save, children: busy ? "处理中…" : "保存" }),
          jsx("button", { type: "button", className: "dpc-btn dpc-btn--danger", disabled: busy, onClick: reset, children: "恢复默认" }),
          onDelete && target.removable ? jsx("button", { type: "button", className: "dpc-btn dpc-btn--danger", disabled: busy, onClick: () => onDelete(target), children: "删除插件" }) : null
        ] }),
        message ? jsx("div", { className: "dpc-toast", role: "status", children: message }) : null
      ] })
    }

    /* ---------------- 公共：图标与开关 ---------------- */

    function artwork(model, key, size) {
      const card = cardOf(model.data, key)
      const bundle = model.byName.get(String(key).split("#")[0])
      const row = key.indexOf("#") >= 0 && bundle ? (bundle.rows || []).find((item) => rowKey(bundle.name, item.rowId) === key) : undefined
      const icon = (card && card.icon) || (row && row.original && row.original.icon) || (bundle && bundle.original && bundle.original.icon)
      const url = iconUrl(card && card.icon) || (icon && (icon.indexOf("data:") === 0 || icon.indexOf("/") === 0 || icon.indexOf("http") === 0 ? icon : undefined))
      if (url) return jsx("img", { src: url, alt: "", style: { width: size, height: size } })
      const label = (bundle ? bundle.name : key).replace(/^@[^/]+\//, "").slice(0, 1).toUpperCase()
      return jsx("div", { className: "dpc-ph", style: { width: size, height: size, fontSize: Math.max(10, size * 0.38) }, children: label })
    }

    function starButton(fav, onClick, small) {
      return jsx("button", {
        type: "button",
        className: "dpc-star" + (fav ? " is-on" : "") + (small ? " dpc-star--small" : ""),
        title: fav ? "取消收藏" : "加入收藏",
        onClick: (event) => { event.stopPropagation(); onClick() },
        children: fav ? "★" : "☆"
      })
    }

    function enabledSwitch(enabled, readOnly, onChange) {
      return jsx("label", { className: "dpc-mini-switch", title: readOnly ? "这一项不能在这里开关" : (enabled ? "点击停用" : "点击启用") , onClick: (event) => event.stopPropagation(), children: [
        jsx("input", { type: "checkbox", checked: enabled, disabled: readOnly, onChange: (event) => onChange(event.target.checked) }),
        jsx("span", { className: "dpc-mini-track" })
      ] })
    }

    function useLayoutActions(reload) {
      const run = useCallback(async (body) => {
        await apiPost("/layout", body)
        await reload()
      }, [reload])
      return run
    }

    function useToggle(reload, notify) {
      return useCallback(async (kind, bundleName, rowId, enabled) => {
        try {
          await apiPost("/toggle", { kind, name: bundleName, rowId, enabled })
          notify(enabled ? "已启用，正在生效…" : "已停用，正在生效…")
          await new Promise((r) => setTimeout(r, 900))
          await reload()
        } catch (error) {
          notify("开关失败：" + (error && error.message ? error.message : String(error)))
        }
      }, [reload, notify])
    }

    /* ---------------- 备注管理（编辑 + 文件夹管理合并） ---------------- */

    /* ---------------- 插件管理 ---------------- */

    function Dialog(props) {
      const state = props.state
      const [value, setValue] = useState(state && state.value !== undefined ? state.value : "")
      useEffect(() => { setValue(state && state.value !== undefined ? state.value : "") }, [state])
      if (!state) return null
      const kind = state.kind
      return jsx("div", { className: "dpc-overlay dpc-overlay--dialog", children: jsxs("div", { className: "dpc-modal dpc-modal--dialog", children: [
        jsx("div", { className: "dpc-modal-head", children: jsx("span", { children: state.title || "提示" }) }),
        jsxs("div", { className: "dpc-modal-body", children: [
          state.text ? jsx("div", { className: "dpc-hint", children: state.text }) : null,
          kind === "prompt" ? jsx("input", {
            className: "dpc-input", autoFocus: true, value: value,
            placeholder: state.placeholder || "",
            onChange: (event) => setValue(event.target.value),
            onKeyDown: (event) => { if (event.key === "Enter") { event.preventDefault(); props.onClose(); state.onOk && state.onOk(value) } }
          }) : null,
          kind === "menu" ? jsx("div", { className: "dpc-menu", children: (state.items || []).map((item, index) => jsx("button", {
            type: "button",
            className: "dpc-menuitem" + (item.danger ? " is-danger" : ""),
            onClick: () => { props.onClose(); item.onSelect && item.onSelect() },
            children: item.label
          }, index)) }) : null
        ] }),
        jsxs("div", { className: "dpc-modal-foot", children: [
          jsx("button", { type: "button", className: "dpc-btn", onClick: props.onClose, children: kind === "menu" ? "关闭" : "取消" }),
          kind === "prompt" || kind === "confirm" ? jsx("button", { type: "button", className: "dpc-btn dpc-btn--primary", onClick: () => { props.onClose(); state.onOk && state.onOk(value) }, children: state.okText || "确定" }) : null
        ] })
      ] }) })
    }

    function ManagerTab(props) {
      const rootRef = useRef(null)
      const { state, reload } = useCardsState()
      const data = state.data
      const model = useMemo(() => (data ? buildModel(data) : null), [data])
      const layoutAction = useLayoutActions(reload)
      const [notice, setNotice] = useState(null)
      const [query, setQuery] = useState("")
      const [selected, setSelected] = useState(null)
      const drawerRef = useRef(null)
      const [openFolder, setOpenFolder] = useState(null)
      const [drag, setDrag] = useState(null)
      const [dragFolder, setDragFolder] = useState(null)
      const [expandedRows, setExpandedRows] = useState(() => new Set())
      const [dialog, setDialog] = useState(null)
      const importRef = useRef(null)
      useInjectCss(rootRef)
      const msg = (error) => String(error && error.message ? error.message : error)
      const dragRef = useRef(null)
      const folderDragRef = useRef(null)
      const notify = (text) => { setNotice(text); setTimeout(() => setNotice(null), 2600) }
      const doToggle = useToggle(reload, notify)

      const view = (data && data.layout && data.layout.view) || "list"
      const [nameSort, setNameSort] = useState(() => {
        try {
          const current = window.localStorage.getItem("dsh-plugin-namecards:nameSort")
          if (current !== null) return current === "1"
          return window.localStorage.getItem("dsh-plugin-cards:nameSort") === "1"
        } catch { return false }
      })
      function toggleNameSort() {
        const next = !nameSort
        setNameSort(next)
        try { window.localStorage.setItem("dsh-plugin-namecards:nameSort", next ? "1" : "0") } catch {}
      }

      function confirmRemove(target) {
        const name = target.bundleName
        setDialog({
          kind: "confirm", title: "删除插件",
          text: "将把「" + target.title + "」从当前 profile 中卸载（" + name + "）。插件文件会从 profile 移除，可随时重新安装。",
          okText: "删除插件",
          onOk: async () => {
            try {
              const result = await apiPost("/remove", { name })
              if (result && result.ok === false) throw new Error(result.error || "卸载失败")
              setSelected(null)
              notify("已删除插件：" + name)
              await reload()
              setTimeout(function () { clickOfficialRefresh() }, 250)
            } catch (error) { notify("删除失败：" + msg(error)) }
          }
        })
      }

      async function resetPreset() {
        try {
          await apiPost("/preset", {})
          await reload()
          notify("已恢复预设：默认图标、实验性插件/子代理插件文件夹、官方中文备注")
          setTimeout(function () { clickOfficialRefresh() }, 250)
        } catch (error) { notify("恢复预设失败：" + msg(error)) }
      }

      function confirmPreset() {
        setDialog({
          kind: "confirm", title: "恢复预设",
          text: "将清空你的自定义名片（图标/备注/说明/文件夹/排序），恢复默认图标、实验性插件与子代理插件文件夹，以及官方中文备注。此操作不可撤销，但可先用「导出」备份。",
          okText: "恢复预设",
          onOk: resetPreset
        })
      }

      async function setView(mode) {
        try { await apiPost("/layout", { action: "view", mode }); await reload() } catch (error) { notify("切换失败：" + String(error && error.message || error)) }
      }

      async function assign(key, folderId) {
        try {
          await layoutAction({ action: "assign", key, folderId })
          notify(folderId ? "已移入文件夹" : "已移出文件夹")
        } catch (error) { notify("移动失败：" + String(error && error.message || error)) }
      }

      async function moveFolder(folderId, beforeId) {
        try {
          const ids = (model.layout.folders || []).map((folder) => folder.id).filter((id) => id !== folderId)
          const index = beforeId ? ids.indexOf(beforeId) : -1
          ids.splice(index < 0 ? ids.length : index, 0, folderId)
          await layoutAction({ action: "folder.reorder", ids })
          notify("文件夹顺序已更新")
        } catch (error) { notify("移动文件夹失败：" + msg(error)) }
      }

      async function reorder(container, key, beforeKey) {
        try {
          const current = model.containerOf(container)
          if (!current) return
          const keys = current.keys.filter((item) => item !== key)
          const index = keys.indexOf(beforeKey)
          keys.splice(index < 0 ? keys.length : index, 0, key)
          const assignment = model.layout.assignments[key]
          const currentContainer = assignment || "root"
          if (container !== "favorites" && currentContainer !== container) {
            await apiPost("/layout", { action: "assign", key, folderId: container === "root" ? null : container })
          }
          await apiPost("/layout", { action: "order", container, keys })
          await reload()
        } catch (error) { notify("排序失败：" + String(error && error.message || error)) }
      }

      async function toggleFavorite(key, on) {
        try { await layoutAction({ action: "favorite", key, favorite: on }) } catch (error) { notify("收藏失败：" + String(error && error.message || error)) }
      }

      async function toggleEnabledAll() {
        try { await apiPost("/settings", { enabled: !(data.enabled !== false) }); await reload() } catch (error) { notify("切换失败：" + msg(error)) }
      }

      function doImport(file) {
        if (!file) return
        const reader = new FileReader()
        reader.onload = async () => {
          try {
            const parsed = JSON.parse(String(reader.result))
            await apiPost("/import", { store: parsed })
            if (parsed && parsed.settings && parsed.settings.nameSort !== undefined) {
              const on = parsed.settings.nameSort === true
              setNameSort(on)
              try { window.localStorage.setItem("dsh-plugin-namecards:nameSort", on ? "1" : "0") } catch {}
            }
            notify("已导入词库")
            await reload()
          } catch (error) { notify("导入失败：" + msg(error)) }
        }
        reader.readAsText(file)
      }

      async function exportAll() {
        try {
          const data = await apiGet("/export")
          data.settings = { nameSort, view }
          const text = JSON.stringify(data, null, 2)
          const blob = new Blob([text], { type: "application/json" })
          const url = URL.createObjectURL(blob)
          const link = document.createElement("a")
          link.href = url
          link.download = "dsh-plugin-namecards-全部导出.json"
          document.body.appendChild(link)
          link.click()
          link.remove()
          setTimeout(() => URL.revokeObjectURL(url), 3000)
          notify("已导出：图标 / 备注名 / 中文说明 / 文件夹与内容 / 排序")
        } catch (error) { notify("导出失败：" + msg(error)) }
      }

      function createFolder() {
        setDialog({
          kind: "prompt", title: "新建文件夹", value: "新文件夹", okText: "创建",
          onOk: async (name) => {
            const trimmed = String(name || "").trim()
            if (!trimmed) return
            try { await layoutAction({ action: "folder.create", name: trimmed }) } catch (error) { notify("创建失败：" + msg(error)) }
          }
        })
      }

      function renameFolder(folder) {
        setDialog({
          kind: "prompt", title: "重命名文件夹", value: folder.title, okText: "保存",
          onOk: async (name) => {
            const trimmed = String(name || "").trim()
            if (!trimmed) return
            try { await layoutAction({ action: "folder.rename", id: folder.id, name: trimmed }) } catch (error) { notify("重命名失败：" + msg(error)) }
          }
        })
      }

      function deleteFolder(folder) {
        setDialog({
          kind: "confirm", title: "删除文件夹", text: "删除「" + folder.title + "」后，里面的插件会回到未分组。", okText: "删除",
          onOk: async () => {
            try { await layoutAction({ action: "folder.delete", id: folder.id }) } catch (error) { notify("删除失败：" + msg(error)) }
          }
        })
      }

      function onDropOnItem(container, targetKey) {
        const dragged = dragRef.current
        if (!dragged || dragged === targetKey) return
        reorder(container, dragged, targetKey)
        dragRef.current = null
        setDrag(null)
      }

      function onDropOnFolder(folderId) {
        const dragged = dragRef.current
        if (!dragged) return
        assign(dragged, folderId)
        dragRef.current = null
        setDrag(null)
      }

      function bundleMatches(bundleName) {
        if (!query.trim()) return true
        const q = query.trim().toLowerCase()
        const bundle = model.byName.get(bundleName)
        const card = cardOf(data, bundleName)
        const text = [bundleName, card && card.description, card && card.note, resolveText(bundle && bundle.original && bundle.original.description)].filter(Boolean).join(" ").toLowerCase()
        return text.indexOf(q) >= 0
      }

      function visibleKeys(container) {
        return container.keys.filter(bundleMatches)
      }

      function toggleRows(bundleName) {
        setExpandedRows((prev) => {
          const next = new Set(prev)
          if (next.has(bundleName)) next.delete(bundleName)
          else next.add(bundleName)
          return next
        })
      }

      function renderManagerRow(container, bundleName) {
        const bundle = model.byName.get(bundleName)
        const card = cardOf(data, bundleName)
        const fav = model.favKeys.has(bundleName) || (bundle.rows || []).some((row) => model.favKeys.has(rowKey(bundleName, row.rowId)))
        const name = model.displayName(bundleName)
        const desc = model.descriptionOf(bundleName)
        const rowsOpen = expandedRows.has(bundleName)
        return jsxs("div", { className: "dpc-mbundle" + (drag === bundleName ? " is-drag" : ""), children: [
          jsxs("div", {
            className: "dpc-mrow",
            draggable: !nameSort,
            onDragStart: () => { dragRef.current = bundleName; setDrag(bundleName) },
            onDragEnd: () => { dragRef.current = null; setDrag(null) },
            onDragOver: (event) => event.preventDefault(),
            onDrop: (event) => { event.preventDefault(); event.stopPropagation(); onDropOnItem(container.id, bundleName) },
            onClick: () => setSelected(bundleName),
            children: [
              jsx("div", { className: "dpc-drag", children: "⠿" }),
              jsx("button", { type: "button", className: "dpc-caret dpc-caret--inline", onClick: (event) => { event.stopPropagation(); toggleRows(bundleName) }, children: rowsOpen ? "▾" : "▸" }),
              jsx("div", { className: "dpc-micon", children: artwork(model, bundleName, 34) }),
              jsxs("div", { className: "dpc-mmain", children: [
                jsx("div", { className: "dpc-mname", children: name }),
                jsx("div", { className: "dpc-mdesc", children: desc })
              ] }),
              starButton(fav, () => toggleFavorite(bundleName, !fav)),
              enabledSwitch(bundle.enabled, Boolean(bundle.readOnlyReason), (next) => doToggle("bundle", bundleName, undefined, next)),
              jsx("button", { type: "button", className: "dpc-more", title: "更多", onClick: (event) => { event.stopPropagation(); openBundleMenu(bundleName) }, children: "⋯" })
            ]
          }),
          rowsOpen ? jsxs("div", { className: "dpc-mrows", children: (bundle.rows || []).length === 0
            ? jsx("div", { className: "dpc-hint dpc-mempty", children: "没有子行" })
            : bundle.rows.map((row) => {
                const key = rowKey(bundleName, row.rowId)
                const rowFav = model.favKeys.has(key)
                return jsxs("div", {
                  className: "dpc-mrow dpc-mrow--sub",
                  onDragOver: (event) => event.preventDefault(),
                  onDrop: (event) => { event.preventDefault(); event.stopPropagation(); onDropOnItem(container.id, bundleName) },
                  onClick: () => setSelected(key),
                  children: [
                    jsx("div", { className: "dpc-ricon", children: artwork(model, key, 18) }),
                    jsx("div", { className: "dpc-mname dpc-mname--sub", children: row.moduleName || row.rowId }),
                    starButton(rowFav, () => toggleFavorite(key, !rowFav), true),
                    enabledSwitch(row.enabled, Boolean(row.readOnlyReason), (next) => doToggle("row", bundleName, row.rowId, next))
                  ]
                }, key)
              }) }) : null
        ] })
      }

      function openBundleMenu(bundleName) {
        const fav = model.favKeys.has(bundleName)
        const folders = model.containers.filter((item) => item.kind === "folder")
        const items = [
          { label: "编辑名片", onSelect: () => setSelected(bundleName) },
          ...(props && typeof props.openPackage === "function" ? [{ label: "打开插件详情", onSelect: () => props.openPackage(bundleName) }] : []),
          { label: fav ? "取消收藏" : "加入收藏", onSelect: () => toggleFavorite(bundleName, !fav) },
          { label: "移出文件夹（回未分组）", onSelect: () => assign(bundleName, null) },
          { label: "移入文件夹…", onSelect: () => setDialog({ kind: "menu", title: "把「" + bundleName + "」移入", items: folders.length === 0 ? [{ label: "（还没有文件夹）" }] : folders.map((folder) => ({ label: folder.title, onSelect: () => assign(bundleName, folder.id) })) }) }
        ]
        setDialog({ kind: "menu", title: bundleName, items })
      }

      function renderContainer(container) {
        const baseKeys = visibleKeys(container)
        const keys = nameSort
          ? [...baseKeys].sort((a, b) => COLLATOR.compare(model.displayName(a), model.displayName(b)))
          : baseKeys
        return jsxs("div", {
          className: "dpc-mcontainer" + (dragFolder === container.id ? " is-drag" : ""),
          children: [
            jsxs("div", {
              className: "dpc-mchead" + (container.kind === "folder" ? " dpc-draggable" : ""),
              draggable: container.kind === "folder",
              onDragStart: (event) => {
                if (container.kind !== "folder") return
                folderDragRef.current = container.id
                setDragFolder(container.id)
                try { event.dataTransfer.setData("text/plain", "folder:" + container.id) } catch {}
              },
              onDragEnd: () => { folderDragRef.current = null; setDragFolder(null) },
              onDragOver: (event) => event.preventDefault(),
              onDrop: (event) => {
                event.preventDefault()
                const folderId = folderDragRef.current
                if (folderId) {
                  if (folderId !== container.id) moveFolder(folderId, container.kind === "folder" ? container.id : null)
                  folderDragRef.current = null
                  setDragFolder(null)
                  return
                }
                const key = dragRef.current
                if (!key) return
                if (container.kind === "favorites") toggleFavorite(key, true)
                else if (container.kind === "folder") assign(key, container.id)
                dragRef.current = null
                setDrag(null)
              },
              children: [
                jsx("button", { type: "button", className: "dpc-caret", onClick: () => layoutAction({ action: "folder.collapse", id: container.kind === "favorites" ? "favorites" : container.id, collapsed: !container.collapsed }), children: container.collapsed ? "▸" : "▾" }),
                jsx("span", { className: "dpc-ctitle", children: (container.kind === "favorites" ? "★ " : "") + container.title }),
                jsx("span", { className: "dpc-ccount", children: "(" + container.keys.length + ")" }),
                container.kind === "folder" ? jsx("button", { type: "button", className: "dpc-more", onClick: () => renameFolder(container), title: "重命名", children: "✎" }) : null,
                container.kind === "folder" ? jsx("button", { type: "button", className: "dpc-more", onClick: () => deleteFolder(container), title: "删除文件夹", children: "🗑" }) : null
              ]
            }),
            container.collapsed ? null : jsxs("div", { className: "dpc-mitems", children: keys.length === 0 ? jsx("div", { className: "dpc-hint dpc-mempty", children: "（空）拖插件到这里" }) : keys.map((key) => renderManagerRow(container, key)) })
          ]
        }, container.id)
      }

      function renderGrid() {
        const folderContainers = model.containers.filter((item) => item.kind !== "root")
        const root = model.containerOf("root")
        return jsxs("div", { className: "dpc-gridwrap", children: [
          jsxs("div", { className: "dpc-tiles", children: [
            folderContainers.map((container) => jsxs("button", {
              type: "button",
              className: "dpc-tile" + (dragFolder === container.id ? " is-drag" : ""),
              draggable: container.kind === "folder",
              onClick: () => setOpenFolder(container.id),
              onDragStart: (event) => {
                if (container.kind !== "folder") return
                folderDragRef.current = container.id
                setDragFolder(container.id)
                try { event.dataTransfer.setData("text/plain", "folder:" + container.id) } catch {}
              },
              onDragEnd: () => { folderDragRef.current = null; setDragFolder(null) },
              onDragOver: (event) => event.preventDefault(),
              onDrop: (event) => {
                event.preventDefault(); event.stopPropagation()
                const folderId = folderDragRef.current
                if (folderId) {
                  if (folderId !== container.id && container.kind === "folder") moveFolder(folderId, container.id)
                  folderDragRef.current = null
                  setDragFolder(null)
                  return
                }
                const key = dragRef.current
                if (!key) return
                if (container.kind === "favorites") { toggleFavorite(key, true) } else { assign(key, container.id) }
                dragRef.current = null
                setDrag(null)
              },
              children: [
                jsxs("div", { className: "dpc-tilebox", children: [
                  container.kind === "favorites" ? jsx("span", { className: "dpc-tilestar", children: "★" }) : null,
                  jsxs("div", { className: "dpc-tilegrid", children: container.keys.slice(0, 9).map((key) => jsx("div", { className: "dpc-tilemini", children: artwork(model, key, 26) }, key)) })
                ] }),
                jsx("div", { className: "dpc-tilename", children: container.title + "（" + container.keys.length + "）" })
              ]
            }, container.id)),
            jsxs("div", {
              className: "dpc-tile dpc-tile--new",
              onClick: createFolder,
              children: [jsx("div", { className: "dpc-tilebox", children: jsx("div", { className: "dpc-tileplus", children: "+" }) }), jsx("div", { className: "dpc-tilename", children: "新建文件夹" })]
            })
          ] }),
          jsxs("div", { className: "dpc-rootgrid", children: [
            jsx("div", { className: "dpc-hint", children: "未分组" }),
            jsxs("div", { className: "dpc-iconrow", children: root.keys.filter(bundleMatches).map((key) => renderGridIcon(root, key)) })
          ] })
        ] })
      }

      function renderGridIcon(container, key) {
        const bundle = model.byName.get(key)
        const fav = model.favKeys.has(key) || (bundle.rows || []).some((row) => model.favKeys.has(rowKey(key, row.rowId)))
        const name = model.displayName(key)
        const desc = model.descriptionOf(key)
        return jsxs("div", {
          className: "dpc-icon-cell" + (drag === key ? " is-drag" : ""),
          draggable: !nameSort,
          title: name + "\n" + desc,
          onDragStart: () => { dragRef.current = key; setDrag(key) },
          onDragEnd: () => { dragRef.current = null; setDrag(null) },
          onDragOver: (event) => event.preventDefault(),
          onDrop: (event) => { event.preventDefault(); event.stopPropagation(); onDropOnItem(container.id, key) },
          onClick: () => setSelected(key),
          children: [
            jsx("div", { className: "dpc-iconbox", children: artwork(model, key, 72) }),
            jsx("div", { className: "dpc-iconstar", children: starButton(fav, () => toggleFavorite(key, !fav), true) }),
            jsx("div", { className: "dpc-iconswitch", children: enabledSwitch(bundle.enabled, Boolean(bundle.readOnlyReason), (next) => doToggle("bundle", key, undefined, next)) }),
            jsx("div", { className: "dpc-iconname", children: name })
          ]
        }, key)
      }

      function renderOverlay() {
        const container = openFolder ? model.containerOf(openFolder) : null
        if (!container) return null
        const baseKeys = visibleKeys(container)
        const keys = nameSort
          ? [...baseKeys].sort((a, b) => COLLATOR.compare(model.displayName(a), model.displayName(b)))
          : baseKeys
        return jsx("div", {
          className: "dpc-overlay",
          onMouseDown: (event) => { if (event.target === event.currentTarget) setOpenFolder(null) },
          onDragOver: (event) => event.preventDefault(),
          onDrop: (event) => {
            event.preventDefault()
            const key = dragRef.current
            if (!key) return
            dragRef.current = null
            setDrag(null)
            if (container.kind === "folder") assign(key, null)
          },
          children: jsx("div", {
            className: "dpc-modal dpc-modal--folder",
            onMouseDown: (event) => event.stopPropagation(),
            children: jsx("div", {
              className: "dpc-modal-body",
              onMouseDown: (event) => { if (event.target === event.currentTarget) setOpenFolder(null) },
              children: keys.length === 0
                ? jsx("div", { className: "dpc-empty", children: "（空）从外面拖插件进来" })
                : jsxs("div", { className: "dpc-overlay-grid", children: keys.map((key) => renderGridIcon(container, key)) })
            })
          })
        })
      }

      useEffect(() => {
        if (!selected) return
        const onDown = (event) => {
          const drawer = drawerRef.current
          if (drawer && drawer.contains(event.target)) return
          const target = event.target
          if (target && target.closest && target.closest(".dpc-mrow, .dpc-icon-cell, .dpc-mchead, .dpc-bar, .dpc-modal, .dpc-overlay, .dpc-tile")) return
          setSelected(null)
        }
        const onKey = (event) => { if (event.key === "Escape") setSelected(null) }
        document.addEventListener("mousedown", onDown, true)
        window.addEventListener("keydown", onKey)
        return () => {
          document.removeEventListener("mousedown", onDown, true)
          window.removeEventListener("keydown", onKey)
        }
      }, [selected])

      if (state.status === "loading" || !model) return jsx("div", { className: "dpc-empty", children: "正在读取…" })
      if (state.status === "error" && !data) return jsx("div", { className: "dpc-empty", children: "读取失败：" + state.error })

      const target = selected ? targetOf(model, selected) : null

      return jsxs("div", { ref: rootRef, className: "dpc-root", children: [
        jsxs("div", { className: "dpc-bar", children: [
          jsx("input", { className: "dpc-input dpc-search", value: query, placeholder: "搜索插件 / 备注", onChange: (event) => setQuery(event.target.value) }),
          jsxs("div", { className: "dpc-seg", children: [
            jsx("button", { type: "button", className: "dpc-segbtn" + (view !== "grid" ? " is-on" : ""), onClick: () => setView("list"), children: "列表" }),
            jsx("button", { type: "button", className: "dpc-segbtn" + (view === "grid" ? " is-on" : ""), onClick: () => setView("grid"), children: "铺陈" })
          ] }),
          jsx("button", { type: "button", className: "dpc-btn", onClick: createFolder, children: "＋ 新建文件夹" }),
          view !== "grid" ? jsx("button", { type: "button", className: "dpc-btn" + (nameSort ? " is-on" : ""), onClick: toggleNameSort, title: "按备注名称（拼音）排序", children: "按备注名排序" }) : null,
          jsx("span", { className: "dpc-spacer" }),
          jsxs("label", { className: "dpc-switch", children: [
            jsx("input", { type: "checkbox", checked: data.enabled !== false, onChange: toggleEnabledAll }),
            jsx("span", { children: "启用名片覆盖" })
          ] }),
          jsx("button", { type: "button", className: "dpc-btn", onClick: confirmPreset, children: "恢复预设" }),
          jsx("button", { type: "button", className: "dpc-btn", onClick: () => importRef.current && importRef.current.click(), children: "导入" }),
          jsx("button", { type: "button", className: "dpc-btn", onClick: exportAll, children: "导出" }),
          jsx("button", { type: "button", className: "dpc-btn", onClick: reload, children: "刷新" }),
          jsx("input", { ref: importRef, type: "file", accept: "application/json,.json", style: { display: "none" }, onChange: (event) => { const f = event.target.files && event.target.files[0]; event.target.value = ""; doImport(f) } })
        ] }),
        view === "grid" ? renderGrid() : jsxs("div", { className: "dpc-manager-list", children: model.containers.map((container) => renderContainer(container)) }),
        target ? jsx("div", { ref: drawerRef, className: "dpc-drawer", children: [
          jsxs("div", { className: "dpc-drawer-head", children: [
            jsx("span", { children: "编辑名片" }),
            jsx("button", { type: "button", className: "dpc-more", onClick: () => setSelected(null), children: "✕" })
          ] }),
          jsx("div", { className: "dpc-hint", children: "原名：" + (target.kind === "row" ? target.bundleName + " · " + target.rowId : target.bundleName) }),
          jsx(CardEditor, {
            data, target, onSaved: reload, onDelete: confirmRemove, compact: true,
            folders: model.containers.filter((item) => item.kind === "folder").map((item) => ({ id: item.id, title: item.title })),
            folderId: target && target.bundleName ? (model.layout.assignments[target.bundleName] || null) : null,
            onMoveFolder: (nextFolderId) => target && target.bundleName ? assign(target.bundleName, nextFolderId) : undefined
          })
        ] }) : null,
        renderOverlay(),
        jsx(Dialog, { state: dialog, onClose: () => setDialog(null) }),
        notice ? jsx("div", { className: "dpc-toast dpc-toast--floating", role: "status", children: notice }) : null
      ] })
    }

    /* ---------------- 详情页区块 ---------------- */

    function DetailSection(props) {
      const subject = props.subject
      const rootRef = useRef(null)
      const { state, reload } = useCardsState()
      useInjectCss(rootRef)
      const data = state.data
      if (!subject || (subject.kind !== "bundle" && subject.kind !== "row")) return null
      const pkg = subject.pkg
      if (!pkg || typeof pkg.name !== "string") return null
      const model = data ? buildModel(data) : null
      const key = subject.kind === "row" && subject.row ? rowKey(pkg.name, subject.row.rowId) : pkg.name
      const target = model ? targetOf(model, key) : null
      if (state.status === "loading") return jsx("section", { className: "dpc-section", children: jsx("div", { className: "dpc-hint", children: "正在读取名片…" }) })
      if (!data) return null
      if (!target) return null
      async function moveToFolder(nextFolderId) {
        try {
          await apiPost("/layout", { action: "assign", key: target.bundleName, folderId: nextFolderId })
          await reload()
        } catch (error) { console.warn("[dsh-plugin-namecards] 移入文件夹失败：", error) }
      }

      return jsxs("section", { ref: rootRef, className: "dpc-section", children: [
        jsx("h4", { children: "名片" }),
        jsx("div", { className: "dpc-hint", children: "原名：" + (subject.kind === "row" ? pkg.name + " · " + subject.row.rowId : pkg.name) }),
        jsx(CardEditor, {
          data, target, onSaved: () => { reload(); setTimeout(() => { clickOfficialRefresh() }, 250) }, compact: true,
          folders: model.containers.filter((item) => item.kind === "folder").map((item) => ({ id: item.id, title: item.title })),
          folderId: target.bundleName ? (model.layout.assignments[target.bundleName] || null) : null,
          onMoveFolder: moveToFolder
        })
      ] })
    }

    /* ---------------- 注册 ---------------- */

    function apply(ctx) {
      installStyles()
      try {
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          const scheduleRefresh = (delay) => { setTimeout(function () { clickOfficialRefresh() }, delay || 300) }
          // 返回（后退）或切回「已安装」页签时，自动刷新官方插件列表
          window.addEventListener('popstate', function () { scheduleRefresh(350) })
          window.addEventListener('hashchange', function () { scheduleRefresh(350) })
          document.addEventListener('click', function (event) {
            try {
              const target = event.target
              const item = target && target.closest ? target.closest('button, a, [role="tab"]') : null
              if (!item) return
              const text = (item.textContent || '').replace(/\s+/g, '')
              if (text === '已安装' || text === '插件') scheduleRefresh(300)
            } catch (error) {}
          }, true)
        }
      } catch (error) {}
      ctx.slots.inject("plugins.tab", () => ctx.slots.register({
        name: "plugins.tab", id: "dsh-plugin-namecards", order: 20, label: () => "插件管理"
      }, ManagerTab))
      ctx.slots.inject("plugins.detail.section", () => ctx.slots.register({
        name: "plugins.detail.section", id: "dsh-plugin-namecards-section", order: 60
      }, DetailSection))
    }

    const module = { exports: {} }
    module.exports = { apply, inject, name }
    return module.exports
  }
})
