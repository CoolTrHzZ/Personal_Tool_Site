import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'
import { TextDecoder, TextEncoder } from 'node:util'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import CfgWorkbench from '../src/tools/packages/cs2-cfg'
import { CFG_STORAGE_KEY, MAX_VERSIONS } from '../src/tools/packages/cs2-cfg/store'
import { MAX_CFG_BYTES } from '../src/tools/packages/cs2-cfg/share'
import { clearPersonalPending } from '../src/utils/personal-storage'

// Mount the real workbench, parser, store, file decoder and download serializer.
// Every record and file is synthetic; only browser I/O sinks are replaced.
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, router, records, storage, downloads, blobs, clipboard, previousClipboard, fetcher
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const draft = (name = '合成当前草稿', content = 'echo synthetic-current\n') => ({ name, content })
const version = (index = 1) => ({ name: `合成保存版本 ${index}`, content: `echo synthetic-version-${index}\n`, id: `synthetic-version-${index}`, savedAt: `2026-10-${String(index).padStart(2, '0')}T12:00:00.000Z` })
const byLabel = label => host.querySelector(`[aria-label="${label}"]`)
const button = (label, scope = host) => [...scope.querySelectorAll('button')].find(node => node.textContent === label)
const preview = () => byLabel('CFG 导入预览')
const editor = () => byLabel('CFG 编辑器')
const alerts = () => [...host.querySelectorAll('[role="alert"]')].map(node => node.textContent)
const stored = () => JSON.parse(records.get(CFG_STORAGE_KEY))
const click = target => act(() => {
  const node = typeof target === 'string' ? button(target) : target
  expect(node).toBeTruthy(); node.click()
})
const edit = (label, value) => act(() => {
  const node = byLabel(label)
  expect(node).toBeTruthy()
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set.call(node, value)
  node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
})
const tab = label => click(button(label, byLabel('CFG 检查视图')))
const save = () => click(button('保存版本', host.querySelector('.cfg-file-toolbar')))
const settle = callback => act(async () => { callback() })
async function mount(data) {
  if (data) records.set(CFG_STORAGE_KEY, JSON.stringify(data))
  router = createMemoryRouter([{ path: '/tools/cs2-cfg', element: h(CfgWorkbench) }], { initialEntries: ['/tools/cs2-cfg'] })
  await act(async () => root.render(h(RouterProvider, { router })))
}
async function chooseFile(file) {
  const input = byLabel('导入 CFG 文件')
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(input.value).toBe('')
}
function controlledFile(name, content) {
  const pending = deferred(), file = new NodeFile([content], name, { type: 'text/plain' })
  const arrayBuffer = vi.fn(() => pending.promise)
  Object.defineProperty(file, 'arrayBuffer', { configurable: true, value: arrayBuffer })
  return { file, arrayBuffer, resolve: () => pending.resolve(new TextEncoder().encode(content).buffer), reject: pending.reject }
}
function download(target) {
  vi.useFakeTimers()
  try { click(target); act(() => vi.runOnlyPendingTimers()) }
  finally { vi.useRealTimers() }
}
async function expectDownload(index, filename, content) {
  expect(downloads[index]).toEqual({ filename, href: `blob:synthetic-cfg-${index + 1}` })
  expect(blobs[index].type).toBe('text/plain;charset=utf-8')
  expect(Array.from(new Uint8Array(await blobs[index].arrayBuffer()))).toEqual(Array.from(new TextEncoder().encode(content)))
}
function press(node, key, code) {
  const event = new window.KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true })
  act(() => { node.dispatchEvent(event) })
  return event
}

beforeEach(() => {
  records = new Map(); downloads = []; blobs = []
  storage = {
    getItem: vi.fn(key => records.get(key) ?? null),
    setItem: vi.fn((key, value) => records.set(key, String(value))),
    removeItem: vi.fn(key => records.delete(key)),
    clear: vi.fn(() => records.clear()),
    key: vi.fn(index => [...records.keys()][index] ?? null),
    get length() { return records.size },
  }
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('Blob', NodeBlob); vi.stubGlobal('File', NodeFile)
  vi.stubGlobal('TextEncoder', TextEncoder); vi.stubGlobal('TextDecoder', TextDecoder)
  const NativeURL = URL
  vi.stubGlobal('URL', class extends NativeURL {
    static createObjectURL = vi.fn(blob => { blobs.push(blob); return `blob:synthetic-cfg-${blobs.length}` })
    static revokeObjectURL = vi.fn()
  })
  vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    expect(this.href).toMatch(/^blob:synthetic-cfg-/)
    downloads.push({ filename: this.download, href: this.href })
  })
  clipboard = { writeText: vi.fn().mockResolvedValue(undefined), readText: vi.fn() }
  previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
  fetcher = vi.fn(() => { throw new Error('Unexpected network request in local CFG workbench') })
  vi.stubGlobal('fetch', fetcher)
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  clearPersonalPending(CFG_STORAGE_KEY)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount()); router?.dispose(); host.remove()
  expect(fetcher).not.toHaveBeenCalled()
  expect(clipboard.readText).not.toHaveBeenCalled(); expect(clipboard.writeText).not.toHaveBeenCalled()
  clearPersonalPending(CFG_STORAGE_KEY)
  if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard)
  else delete navigator.clipboard
  vi.restoreAllMocks(); vi.unstubAllGlobals()
  router = undefined
})

it('identifies the current draft and separates source controls, draft actions and saved versions', async () => {
  const current = draft(), snapshot = version()
  await mount({ draft: current, versions: [snapshot] })
  const overview = host.querySelector('.cfg-draft-overview')
  expect(overview.textContent).toContain('当前草稿')
  expect(overview.querySelector('.cfg-draft-title').textContent).toBe(current.name)
  expect(host.querySelector('.cfg-editor-card').contains(byLabel('配置名称'))).toBe(true)
  expect(byLabel('配置名称').value).toBe(current.name)
  expect(editor().value).toBe(current.content)
  const sources = host.querySelector('.cfg-draft-source'), actions = host.querySelector('.cfg-draft-actions')
  expect(sources.contains(byLabel('导入 CFG 文件'))).toBe(true)
  expect(button('载入示例', sources)).toBeTruthy()
  expect([...actions.querySelectorAll('button')].map(node => node.textContent)).toEqual(['保存版本', '下载 CFG', '生成分享链接'])
  for (const node of [byLabel('配置名称'), editor(), byLabel('导入 CFG 文件'), ...actions.querySelectorAll('button')]) expect(node.closest('details')).toBeNull()
  const risk = host.querySelector('.cfg-draft-output .cfg-sensitive-note')
  expect(risk.textContent).toContain('复制、下载或分享前检查敏感内容')
  expect(risk.closest('details')).toBeNull()
  const help = host.querySelector('.cfg-help'), summary = help.querySelector('summary'), originalEditor = editor()
  expect(help.open).toBe(false)
  act(() => summary.focus()); click(summary); expect(help.open).toBe(true)
  click(summary); expect(help.open).toBe(false); expect(document.activeElement).toBe(summary)
  expect(editor()).toBe(originalEditor); expect(editor().value).toBe(current.content)
  expect(preview()).toBeNull()
  tab('保存版本')
  expect(host.querySelector('.cfg-versions-note').textContent).toContain('草稿自动保存，版本由你手动保存。跨机器请使用分享链接或下载文件。')
  expect(host.querySelector('.cfg-versions-note').closest('details')).toBeNull()
  expect(host.querySelector('.cfg-version-list strong').textContent).toBe(snapshot.name)
  expect(editor().value).toBe(current.content)
  expect(storage.setItem).not.toHaveBeenCalled()
})

it('previews exact imported bytes without applying them and downloads preview and draft as distinct documents', async () => {
  const current = draft(), snapshot = version()
  const content = '\ufeff// 合成导入 🎯\r\nbind x say \u0006彩色\u000b\r\necho "<script>synthetic()</script>"\r\n'
  await mount({ draft: current, versions: [snapshot] })
  await chooseFile(new NodeFile([content], '合成导入.CFG', { type: 'text/plain' }))
  expect(preview().querySelector('.cfg-preview-state').textContent).toBe('预览 · 尚未载入')
  expect(preview().textContent).toContain('导入文件 · 合成导入')
  expect(preview().querySelector('pre').textContent).toBe(content)
  expect(preview().querySelector('script')).toBeNull()
  expect(preview().textContent).toContain('先查看内容，再决定是否替换编辑区。已有保存版本会保留。')
  expect(preview().querySelector('.cfg-sensitive-note').textContent).toContain('下载前检查敏感内容')
  expect(preview().querySelector('.cfg-sensitive-note').closest('details')).toBeNull()
  expect(preview().contains(editor())).toBe(false)
  expect(editor().value).toBe(current.content); expect(byLabel('配置名称').value).toBe(current.name)
  expect(stored()).toEqual({ draft: current, versions: [snapshot] }); expect(storage.setItem).not.toHaveBeenCalled()
  download('直接下载此 CFG'); await expectDownload(0, '合成导入.cfg', content)
  download('下载 CFG'); await expectDownload(1, `${current.name}.cfg`, current.content)
  expect(preview()).not.toBeNull(); expect(storage.setItem).not.toHaveBeenCalled()
  click('取消载入')
  expect(preview()).toBeNull(); expect(editor().value).toBe(current.content)
  expect(stored()).toEqual({ draft: current, versions: [snapshot] })
  await chooseFile(new NodeFile([content], '合成导入.cfg'))
  click('载入到编辑器')
  expect(preview()).toBeNull(); expect(editor().value).toBe(content.replace(/\r\n?/g, '\n'))
  expect(byLabel('配置名称').value).toBe('合成导入')
  expect(stored()).toEqual({ draft: { name: '合成导入', content }, versions: [snapshot] })
  download('下载 CFG'); await expectDownload(2, '合成导入.cfg', content)
})

it.each(['success', 'failure'])('ignores an old file %s after a newer file preview and application', async outcome => {
  const current = draft(), old = controlledFile('合成旧文件.cfg', 'echo obsolete-file\r\n')
  await mount({ draft: current, versions: [] })
  await chooseFile(old.file)
  expect(old.arrayBuffer).toHaveBeenCalledOnce(); expect(preview()).toBeNull()
  await chooseFile(new NodeFile(['echo newest-file\r\n'], '合成新文件.cfg'))
  expect(preview().textContent).toContain('导入文件 · 合成新文件')
  click('载入到编辑器')
  const applied = stored(), writes = storage.setItem.mock.calls.length
  await settle(() => outcome === 'success' ? old.resolve() : old.reject(new Error('obsolete synthetic read failure')))
  expect(preview()).toBeNull(); expect(alerts()).toEqual([])
  expect(editor().value).toBe('echo newest-file\n'); expect(stored()).toEqual(applied)
  expect(storage.setItem).toHaveBeenCalledTimes(writes)
})

it.each(['success', 'failure'])('does not revive a canceled example preview after a pending file %s', async outcome => {
  const current = draft(), old = controlledFile('合成待读文件.cfg', 'echo canceled-file\n')
  await mount({ draft: current, versions: [] })
  await chooseFile(old.file)
  click('载入示例')
  expect(preview().textContent).toContain('配置示例 · autoexec')
  click('取消载入')
  await settle(() => outcome === 'success' ? old.resolve() : old.reject(new Error('canceled synthetic read failure')))
  expect(preview()).toBeNull(); expect(alerts()).toEqual([])
  expect(editor().value).toBe(current.content); expect(stored().draft).toEqual(current)
  expect(storage.setItem).not.toHaveBeenCalled()
})

it('keeps only the newest of repeated file selections, including the same filename', async () => {
  const current = draft(), first = controlledFile('合成重复.cfg', 'echo first\n'), second = controlledFile('合成重复.cfg', 'echo second\n'), third = controlledFile('合成重复.cfg', 'echo third\n')
  await mount({ draft: current, versions: [] })
  await chooseFile(first.file); await chooseFile(second.file); await chooseFile(third.file)
  await settle(third.resolve)
  expect(preview().querySelector('pre').textContent).toBe('echo third\n')
  await settle(first.resolve); await settle(second.resolve)
  expect(preview().querySelector('pre').textContent).toBe('echo third\n')
  expect(editor().value).toBe(current.content); expect(storage.setItem).not.toHaveBeenCalled()
  click('取消载入'); expect(preview()).toBeNull()
})

it('loads the original example immediately into an empty draft, retaining saved versions', async () => {
  const snapshot = version()
  await mount({ draft: draft('空白合成草稿', ' \n\t'), versions: [snapshot] })
  click('载入示例')
  const expected = '// 日常配置示例：数值需在游戏内确认\nsensitivity "1.2"\nvolume "0.5"\nbind "SPACE" "+jump"\nbind "MOUSE4" "+voicerecord"\nbind "f" "+lookatweapon"\necho "autoexec loaded"\n'
  expect(preview()).toBeNull(); expect(editor().value).toBe(expected)
  expect(stored()).toEqual({ draft: { name: 'autoexec', content: expected }, versions: [snapshot] })
})

it('requires explicit application of the example when the current draft is nonempty', async () => {
  const current = draft(), snapshot = version()
  await mount({ draft: current, versions: [snapshot] })
  click('载入示例')
  const exampleContent = preview().querySelector('pre').textContent
  expect(preview().textContent).toContain('配置示例 · autoexec')
  expect(editor().value).toBe(current.content); expect(storage.setItem).not.toHaveBeenCalled()
  click('取消载入'); expect(editor().value).toBe(current.content)
  click('载入示例'); click('载入到编辑器')
  expect(preview()).toBeNull(); expect(editor().value).toBe(exampleContent)
  expect(stored()).toEqual({ draft: { name: 'autoexec', content: exampleContent }, versions: [snapshot] })
})

it('uses real binding inspection, passes through Tab and Escape, and captures ordinary keys without editing', async () => {
  const content = 'bind "SPACE" "+jump"\nbind "SPACE" "+duck"\nbind "=" "say synthetic equal"\nbind "MOUSE4" "+voicerecord"\n'
  await mount({ draft: draft('合成绑定', content), versions: [] })
  tab('绑定预览')
  expect([...byLabel('预览按键').options].map(option => option.value)).toEqual(['', 'SPACE', '=', 'MOUSE4'])
  edit('预览按键', 'MOUSE4')
  expect(host.querySelector('.cfg-binding-output').textContent).toBe('MOUSE4 → +voicerecord')
  const capture = host.querySelector('.cfg-key-capture')
  act(() => capture.focus()); expect(document.activeElement).toBe(capture)
  for (const key of ['Tab', 'Escape']) {
    expect(press(capture, key, key).defaultPrevented).toBe(false)
    expect(host.querySelector('.cfg-binding-output').textContent).toBe('MOUSE4 → +voicerecord')
  }
  expect(press(capture, '=', 'Equal').defaultPrevented).toBe(true)
  expect(host.querySelector('.cfg-binding-output').textContent).toBe('= → say synthetic equal')
  expect(press(capture, ' ', 'Space').defaultPrevented).toBe(true)
  expect(host.querySelector('.cfg-binding-output').textContent).toBe('SPACE → +duck')
  expect(press(capture, 'q', 'KeyQ').defaultPrevented).toBe(true)
  expect(host.querySelector('.cfg-binding-output').textContent).toBe('Q → 当前文件未设置此绑定')
  expect(editor().value).toBe(content); expect(storage.setItem).not.toHaveBeenCalled()
})

it('appends the exact binding payload, preserves BOM and CRLF, and clears only successful input', async () => {
  const content = '\ufeff// 合成原文\r\nbind F4 +use // 保留原文', command = 'say \u0007合成彩色\u000b; +jump'
  await mount({ draft: draft('合成追加', content), versions: [] })
  tab('绑定预览')
  const bindingEditor = host.querySelector('.cfg-binding-editor')
  expect(bindingEditor.contains(byLabel('绑定按键'))).toBe(true)
  expect(bindingEditor.contains(byLabel('绑定命令'))).toBe(true)
  const add = button('追加绑定到文件末尾', bindingEditor)
  expect(add.disabled).toBe(true); expect(add.closest('details')).toBeNull()
  edit('绑定按键', ' F4\t'); edit('绑定命令', `\t${command}  `)
  expect(add.disabled).toBe(false); click(add)
  const expected = `${content}\r\nbind "F4" "${command}"\r\n`
  expect(stored().draft.content).toBe(expected)
  expect(editor().value).toBe(expected.replace(/\r\n/g, '\n'))
  expect(byLabel('绑定按键').value).toBe(''); expect(byLabel('绑定命令').value).toBe('')
  expect(button('追加绑定到文件末尾').disabled).toBe(true)
  expect(host.textContent).toContain('已追加绑定；同一按键以文件中最后一条顶层设置为准。')
  edit('预览按键', 'F4'); expect(host.querySelector('.cfg-binding-output').textContent).toBe(`F4 → ${command}`)
  download('下载 CFG'); await expectDownload(0, '合成追加.cfg', expected)
  const before = records.get(CFG_STORAGE_KEY)
  edit('绑定按键', 'x'); edit('绑定命令', 'say "invalid quoted command"'); click('追加绑定到文件末尾')
  expect(alerts().join(' ')).toContain('不能包含双引号')
  expect(byLabel('绑定按键').value).toBe('x'); expect(byLabel('绑定命令').value).toBe('say "invalid quoted command"')
  expect(records.get(CFG_STORAGE_KEY)).toBe(before)
})

it('keeps empty checks, successful checks and the 150-diagnostic display cap distinct', async () => {
  await mount()
  expect(host.querySelector('.workbench-empty').textContent).toBe('输入 CFG 后，检查结果会显示在这里。')
  expect(host.querySelector('.cfg-check-ok')).toBeNull(); expect(host.querySelector('.workbench-issues')).toBeNull()
  for (const label of ['保存版本', '下载 CFG', '生成分享链接']) expect(button(label, host.querySelector('.cfg-file-toolbar')).disabled).toBe(true)
  edit('CFG 编辑器', '// 合成有效内容\nsensitivity 1.25\nbind x +use\necho synthetic\n')
  expect(host.querySelector('.cfg-check-ok').textContent).toContain('未发现基础语法或绑定覆盖问题。')
  expect(host.querySelector('.workbench-issues')).toBeNull()
  expect([...host.querySelectorAll('.workbench-stats b')].map(node => node.textContent)).toEqual(['3', '1', '0'])
  expect(host.querySelector('.cfg-settings').textContent).toContain('sensitivity1.25')
  const content = Array.from({ length: 151 }, (_, index) => `exec synthetic-${index}.cfg`).join('\n')
  edit('CFG 编辑器', content)
  const issues = host.querySelectorAll('.workbench-issues li')
  expect(issues).toHaveLength(150)
  expect(issues[0].textContent).toContain('L1'); expect(issues[149].textContent).toContain('L150')
  expect(button('L151')).toBeUndefined()
  expect(host.textContent).toContain('仅展示前 150 条，请先处理后继续检查。')
  expect([...host.querySelectorAll('.workbench-stats b')].map(node => node.textContent)).toEqual(['151', '0', '0'])
  expect(stored().draft.content).toBe(content)
})

it('moves the real editor focus and selection to the selected diagnostic line', async () => {
  const lines = ['// 合成跳转', 'echo first', 'echo second', 'bind x +use', 'bind x +jump', 'echo tail'], content = lines.join('\n')
  await mount({ draft: draft('合成诊断', content), versions: [] })
  expect(host.querySelector('.workbench-issues').textContent).toContain('按键 X 覆盖了第 4 行的绑定。')
  click('L5')
  const start = lines.slice(0, 4).reduce((sum, line) => sum + line.length + 1, 0)
  expect(document.activeElement).toBe(editor())
  expect(editor().selectionStart).toBe(start); expect(editor().selectionEnd).toBe(start + lines[4].length)
  expect(editor().value.slice(editor().selectionStart, editor().selectionEnd)).toBe('bind x +jump')
  expect(editor().scrollTop).toBe(42); expect(storage.setItem).not.toHaveBeenCalled()
})

it('keeps manual snapshots independent from current edits and only restores after preview confirmation', async () => {
  const current = draft()
  await mount({ draft: current, versions: [] })
  tab('保存版本')
  expect(host.querySelector('.workbench-empty').textContent).toBe('还没有保存版本。')
  expect(host.querySelector('.cfg-inspector').textContent).toContain('0 / 20')
  save()
  expect(host.querySelectorAll('.cfg-version-list li')).toHaveLength(1)
  const snapshot = stored().versions[0]
  expect(snapshot).toMatchObject(current); expect(snapshot.id).toBeTruthy(); expect(Number.isFinite(Date.parse(snapshot.savedAt))).toBe(true)
  expect(host.querySelector('.cfg-version-list time').dateTime).toBe(snapshot.savedAt)
  expect(host.textContent).toContain('已保存新版本，继续编辑不会修改此版本。')
  edit('配置名称', '合成修改后'); edit('CFG 编辑器', 'echo synthetic-after-save\n')
  const changed = stored().draft
  expect(stored().versions).toEqual([snapshot])
  click('预览 / 恢复')
  expect(preview().textContent).toContain(`保存版本 · ${current.name}`)
  expect(preview().querySelector('pre').textContent).toBe(current.content)
  expect(editor().value).toBe(changed.content); expect(stored().draft).toEqual(changed)
  click('取消载入'); expect(stored().draft).toEqual(changed)
  download(button('下载', host.querySelector('.cfg-version-list')))
  await expectDownload(0, `${current.name}.cfg`, current.content)
  expect(stored().draft).toEqual(changed)
  click('预览 / 恢复'); click('载入到编辑器')
  expect(stored()).toEqual({ draft: current, versions: [snapshot] }); expect(editor().value).toBe(current.content)
})

it('retains the twenty-version limit and confirmed deletion never changes the draft', async () => {
  const current = draft(), versions = Array.from({ length: MAX_VERSIONS }, (_, index) => version(index + 1))
  await mount({ draft: current, versions })
  tab('保存版本')
  expect(host.querySelectorAll('.cfg-version-list li')).toHaveLength(MAX_VERSIONS)
  expect(host.querySelector('.cfg-inspector').textContent).toContain('20 / 20')
  save()
  expect(alerts()).toContain('最多保存 20 个版本，请先下载并删除不再需要的旧版本。')
  expect(storage.setItem).not.toHaveBeenCalled(); expect(stored()).toEqual({ draft: current, versions })
  click(byLabel(`删除版本 ${versions[0].name}`))
  expect(window.confirm).toHaveBeenLastCalledWith(`删除已保存版本「${versions[0].name}」？当前编辑内容不会删除。`)
  expect(stored().versions).toEqual(versions); expect(storage.setItem).not.toHaveBeenCalled()
  window.confirm.mockReturnValue(true)
  click(byLabel(`删除版本 ${versions[0].name}`))
  expect(stored()).toEqual({ draft: current, versions: versions.slice(1) })
  expect(editor().value).toBe(current.content); expect(byLabel('配置名称').value).toBe(current.name)
  expect(host.querySelectorAll('.cfg-version-list li')).toHaveLength(19)
  save()
  expect(stored().versions).toHaveLength(MAX_VERSIONS)
  expect(stored().versions[0]).toMatchObject(current); expect(stored().versions.slice(1)).toEqual(versions.slice(1))
})

it('enforces the 80-character name and UTF-8 256 KiB content limits without partial changes', async () => {
  await mount({ draft: draft(), versions: [] })
  const name = '合'.repeat(80)
  expect(byLabel('配置名称').maxLength).toBe(80)
  edit('配置名称', name); expect(stored().draft.name).toBe(name)
  const beforeName = records.get(CFG_STORAGE_KEY)
  edit('配置名称', name + '成')
  expect(byLabel('配置名称').value).toBe(name); expect(records.get(CFG_STORAGE_KEY)).toBe(beforeName)
  expect(alerts()).toContain('CFG 最大 256 KB，名称最多 80 字符。本次修改未应用。')
  edit('配置名称', ''); expect(stored().draft.name).toBe('autoexec')
  const exact = '// ' + 'x'.repeat(MAX_CFG_BYTES - 3)
  edit('CFG 编辑器', exact)
  expect(editor().value).toBe(exact); expect(stored().draft.content).toBe(exact); expect(alerts()).toEqual([])
  const beforeContent = records.get(CFG_STORAGE_KEY)
  for (const tooLarge of [exact + 'x', '中'.repeat(Math.floor(MAX_CFG_BYTES / 3) + 1)]) {
    edit('CFG 编辑器', tooLarge)
    expect(editor().value).toBe(exact); expect(records.get(CFG_STORAGE_KEY)).toBe(beforeContent)
    expect(alerts()).toContain('CFG 最大 256 KB，名称最多 80 字符。本次修改未应用。')
  }
  tab('绑定预览'); edit('绑定按键', 'f'); edit('绑定命令', '+lookatweapon'); click('追加绑定到文件末尾')
  expect(editor().value).toBe(exact); expect(records.get(CFG_STORAGE_KEY)).toBe(beforeContent)
  expect(byLabel('绑定按键').value).toBe('f'); expect(byLabel('绑定命令').value).toBe('+lookatweapon')
  expect(host.textContent).not.toContain('已追加绑定；')
})

it('rejects oversize and invalid UTF-8 files through the actual decoder and retains the existing draft', async () => {
  const current = draft()
  await mount({ draft: current, versions: [] })
  const oversized = new NodeFile(['x'.repeat(MAX_CFG_BYTES + 1)], '合成超限.cfg')
  const read = vi.spyOn(oversized, 'arrayBuffer')
  await chooseFile(oversized)
  expect(read).not.toHaveBeenCalled(); expect(alerts().join(' ')).toContain('文件超过 256 KB 限制')
  expect(preview()).toBeNull(); expect(stored().draft).toEqual(current)
  await chooseFile(new NodeFile([new Uint8Array([0xff, 0xfe])], '合成无效编码.cfg'))
  expect(alerts().join(' ')).toContain('UTF-8'); expect(preview()).toBeNull()
  expect(editor().value).toBe(current.content); expect(storage.setItem).not.toHaveBeenCalled()
  const name = '合'.repeat(81), content = 'echo synthetic-valid\n'
  await chooseFile(new NodeFile([content], `${name}.cfg`))
  expect(alerts()).toEqual([]); expect(preview().textContent).toContain(`导入文件 · ${name.slice(0, 80)}`)
  click('载入到编辑器')
  expect(stored().draft).toEqual({ name: name.slice(0, 80), content })
})
