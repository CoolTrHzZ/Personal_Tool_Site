/*!
 * Toolbox Bridge SDK v1
 * 工具站宿主（iframe parent）与静态工具（iframe 内）之间的 postMessage 通信层。
 *
 * 用法：在工具 HTML 中加入（相对路径，任意部署子路径均可用）：
 *   <script src="../../toolbox-bridge.js"></script>
 * 之后使用全局 window.Toolbox：
 *   await Toolbox.clipboard.writeText('hello')
 *   Toolbox.toast.show('已复制', 'success')
 *   const { mode } = await Toolbox.theme.get()
 *   await Toolbox.storage.set('key', { any: 'json' })
 *   Toolbox.openExternal('https://example.com')
 *   Toolbox.resize.report(640)             // 手动上报高度
 *   Toolbox.resize.enableAuto()            // 自动随内容高度上报（默认开启）
 *
 * 协议（双向，source 均为 "toolbox-bridge"）：
 *   工具 → 宿主  { source, version, type: <method>, id, payload }
 *   宿主 → 工具  { source, type: 'response', id, ok, payload }
 *   宿主 → 工具  { source, type: 'theme-changed', payload }
 */
(function () {
  'use strict'
  if (window.Toolbox) return

  var PROTOCOL = 'toolbox-bridge'
  var VERSION = 1
  var REQUEST_TIMEOUT = 5000
  var seq = 0
  var pending = new Map()
  var themeListeners = []
  var autoResizeObserver = null

  function post(message) {
    parent.postMessage(Object.assign({ source: PROTOCOL, version: VERSION }, message), '*')
  }

  function request(type, payload) {
    if (window.parent === window) return Promise.reject(new Error('toolbox-bridge 只能在 iframe 中使用'))
    return new Promise(function (resolve, reject) {
      var id = ++seq
      pending.set(id, { resolve: resolve, reject: reject })
      post({ type: type, id: id, payload: payload || {} })
      setTimeout(function () {
        if (pending.has(id)) {
          pending.delete(id)
          reject(new Error('toolbox-bridge timeout: ' + type))
        }
      }, REQUEST_TIMEOUT)
    })
  }

  window.addEventListener('message', function (event) {
    var data = event.data
    if (!data || data.source !== PROTOCOL) return
    if (data.type === 'response' && data.id && pending.has(data.id)) {
      var waiter = pending.get(data.id)
      pending.delete(data.id)
      if (data.ok) waiter.resolve(data.payload)
      else waiter.reject(new Error(data.payload && data.payload.message || 'toolbox-bridge error'))
      return
    }
    if (data.type === 'theme-changed') {
      for (var index = 0; index < themeListeners.length; index++) themeListeners[index](data.payload || {})
    }
  })

  function reportHeight(height) {
    var value = Number(height) || Math.max(
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0
    )
    post({ type: 'resize', payload: { height: Math.max(1, Math.round(value)) } })
  }

  var Toolbox = {
    version: VERSION,
    ready: true,
    clipboard: {
      writeText: function (text) { return request('clipboard.write', { text: String(text) }) },
      readText: function () { return request('clipboard.read', {}).then(function (payload) { return payload.text || '' }) },
    },
    toast: {
      show: function (message, level) { return request('toast.show', { message: String(message), level: level || 'info' }) },
      success: function (message) { return request('toast.show', { message: String(message), level: 'success' }) },
      error: function (message) { return request('toast.show', { message: String(message), level: 'error' }) },
    },
    theme: {
      get: function () { return request('theme.get', {}) },
      watch: function (listener) {
        if (typeof listener === 'function') {
          themeListeners.push(listener)
          Toolbox.theme.get().then(listener).catch(function () {})
        }
      },
    },
    storage: {
      get: function (key) { return request('storage.get', { key: String(key) }).then(function (payload) { return payload.value }) },
      set: function (key, value) { return request('storage.set', { key: String(key), value: value }) },
      remove: function (key) { return request('storage.remove', { key: String(key) }) },
      keys: function () { return request('storage.keys', {}).then(function (payload) { return payload.keys || [] }) },
    },
    resize: {
      report: reportHeight,
      enableAuto: function () {
        if (autoResizeObserver || typeof ResizeObserver === 'undefined') return
        autoResizeObserver = new ResizeObserver(function () { reportHeight() })
        autoResizeObserver.observe(document.documentElement)
        if (document.body) autoResizeObserver.observe(document.body)
      },
      disableAuto: function () {
        if (!autoResizeObserver) return
        autoResizeObserver.disconnect()
        autoResizeObserver = null
      },
    },
    openExternal: function (url) { return request('openExternal', { url: String(url) }) },
  }

  // 默认开启自动高度上报；加载完成与资源就绪后立即上报一次
  Toolbox.resize.enableAuto()
  window.addEventListener('load', function () { reportHeight() })
  if (document.readyState === 'complete') reportHeight()
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(reportHeight, 0) })

  window.Toolbox = Toolbox
})()
