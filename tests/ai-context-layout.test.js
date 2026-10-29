import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'
import { TextEncoder } from 'node:util'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AiContextTool from '../src/tools/packages/ai-context'
import { CONTEXT_TASKS_KEY, MAX_CONTEXT_TASKS, MAX_TASK_STORE_BYTES } from '../src/tools/packages/ai-context/store'
import { contextBytes, contextFields, emptyContext, MAX_CONTEXT_BYTES, MAX_FILE_BYTES, MAX_MATERIALS } from '../src/tools/packages/ai-context/context'
import { clearPersonalPending, hasPersonalPending, readPersonalRaw, rememberPersonalPending } from '../src/utils/personal-storage'

// The component, router, validation, serialization and pending-storage layer remain real.
// Files, storage failures, clipboard settlement and downloads use synthetic browser sinks.
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, router, original, blobs, downloads, clipboardRequests, previousClipboard, writeText, readText, fetcher, xhrOpen, storageWrites
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const task = (id, name, draft = emptyContext()) => ({ id, name, draft, updated: '2026-10-01T00:00:00.000Z' })
const fixture = () => ({ version: 1, activeId: 'current-task', tasks: [task('current-task', '当前任务 · 原名称', { ...emptyContext(), project: '合成项目', goal: '保留原任务目标' }), task('other-task', '其他任务 · 必须保留', { ...emptyContext(), goal: '其他任务内容' })] })
const importedDraft = () => ({ ...emptyContext(), project: '导入的合成项目', goal: '导入后的目标', materials: [{ id: 'imported-material', name: '导入材料.md', content: '合成原文\r\n```\r\n' }] })
const stored = () => JSON.parse(localStorage.getItem(CONTEXT_TASKS_KEY))
const current = data => data.tasks.find(item => item.id === data.activeId)
const byLabel = label => host.querySelector(`[aria-label="${label}"]`)
const button = label => [...host.querySelectorAll('button')].find(node => node.textContent === label)
const field = label => [...host.querySelectorAll('label')].find(node => {
  const caption = node.cloneNode(true)
  // Textarea value text is not part of its wrapping label's accessible name.
  caption.querySelectorAll('input, textarea, select').forEach(control => control.remove())
  return caption.textContent === label
})?.control
const preview = () => byLabel('任务包导入预览')
const output = () => host.querySelector('[aria-labelledby="context-preview-heading"]')
const alerts = () => [...host.querySelectorAll('[role="alert"]')].map(node => node.textContent)
const click = target => act(() => { const node = typeof target === 'string' ? button(target) : target; expect(node).toBeTruthy(); node.click() })
const edit = (node, value) => act(() => {
  expect(node).toBeTruthy()
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set.call(node, value)
  node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
})
const blurName = () => act(() => field('任务名称').dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })))
const settle = callback => act(async () => { callback() })
const navigate = path => act(async () => { await router.navigate(path) })
const bytes = value => new TextEncoder().encode(value).buffer
function pendingFile(name, content = '') {
  const pending = deferred(), file = new NodeFile([content], name, { type: 'text/plain' })
  const arrayBuffer = vi.spyOn(file, 'arrayBuffer').mockReturnValue(pending.promise)
  return { file, arrayBuffer, ...pending }
}
const chooseFiles = (label, files) => act(async () => {
  const input = field(label)
  expect(input?.type).toBe('file')
  Object.defineProperty(input, 'files', { configurable: true, value: files })
  input.dispatchEvent(new Event('change', { bubbles: true }))
})
const importDraft = draft => chooseFiles('导入任务包 JSON', [new NodeFile([JSON.stringify(draft)], 'synthetic-context.json', { type: 'application/json' })])
function download(label) {
  vi.useFakeTimers()
  try { click(label); act(() => vi.runOnlyPendingTimers()) }
  finally { vi.useRealTimers() }
}
function mount(data = original) {
  localStorage.setItem(CONTEXT_TASKS_KEY, JSON.stringify(data))
  storageWrites.mockClear()
  router = createMemoryRouter([
    { path: '/tools/ai-context', element: h(AiContextTool) },
    { path: '/tools', element: h('p', null, '合成工具目录') },
    { path: '/away', element: h('p', null, '合成离开页') },
  ], { initialEntries: [{ pathname: '/tools/ai-context', search: '?keep=opaque', state: { returnTo: '/tools?q=context' } }] })
  act(() => root.render(h(RouterProvider, { router })))
}

beforeEach(() => {
  localStorage.clear(); clearPersonalPending(CONTEXT_TASKS_KEY)
  original = fixture(); blobs = []; downloads = []; clipboardRequests = []
  vi.stubGlobal('Blob', NodeBlob); vi.stubGlobal('File', NodeFile)
  const NativeURL = URL
  vi.stubGlobal('URL', class extends NativeURL {
    static createObjectURL = vi.fn(blob => { blobs.push(blob); return `blob:ai-context-synthetic-${blobs.length}` })
    static revokeObjectURL = vi.fn()
  })
  const originalClick = window.HTMLAnchorElement.prototype.click
  vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    if (this.href.startsWith('blob:ai-context-synthetic-')) downloads.push({ filename: this.download, href: this.href })
    else originalClick.call(this)
  })
  writeText = vi.fn(value => { const pending = deferred(); clipboardRequests.push({ value, ...pending }); return pending.promise })
  readText = vi.fn()
  previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText, readText } })
  fetcher = vi.fn(() => { throw Error('Unexpected network request in local AI context test') })
  vi.stubGlobal('fetch', fetcher)
  xhrOpen = vi.spyOn(window.XMLHttpRequest.prototype, 'open').mockImplementation(() => { throw Error('Unexpected XHR in local AI context test') })
  storageWrites = vi.spyOn(window.Storage.prototype, 'setItem')
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount()); router?.dispose(); host.remove()
  expect(fetcher).not.toHaveBeenCalled(); expect(xhrOpen).not.toHaveBeenCalled(); expect(readText).not.toHaveBeenCalled()
  if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard)
  else delete navigator.clipboard
  clearPersonalPending(CONTEXT_TASKS_KEY)
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers()
})

it('keeps the complete current-task identity, original field labels and three working cards visible beside explicit output risks', () => {
  original.tasks[0].name = '当前任务-' + '长名称'.repeat(38) + '终'
  expect(original.tasks[0].name.length).toBe(120)
  mount()
  expect(host.querySelector('.ai-context-workspace')).toBeTruthy()
  expect(host.querySelector('.ai-context-task-identity strong').textContent).toBe(original.tasks[0].name)
  expect(host.querySelector('.ai-context-output-identity strong').textContent).toBe(original.tasks[0].name)
  expect(byLabel('当前 AI 任务').selectedOptions[0].textContent).toBe(original.tasks[0].name)
  expect(field('任务名称').value).toBe(original.tasks[0].name)
  expect(field('任务名称').maxLength).toBe(120)
  for (const [id, text] of [['context-task-heading', '01 / 任务说明'], ['context-material-heading', '02 / 参考材料'], ['context-preview-heading', '03 / Markdown 预览']]) {
    expect(document.getElementById(id).textContent).toBe(text)
    expect(host.querySelector(`[aria-labelledby="${id}"]`).closest('details')).toBeNull()
  }
  const taskCard = host.querySelector('[aria-labelledby="context-task-heading"]')
  expect(taskCard.textContent).toContain('先写任务目标，其余按需。')
  expect([...taskCard.querySelectorAll('h2 ~ label')].map(node => node.control.getAttribute('aria-label'))).toEqual(contextFields.map(item => item.label))
  for (const item of contextFields) expect(byLabel(item.label).labels).toHaveLength(1)
  const risk = output().querySelector('.ai-context-export-risk')
  expect(risk).toBeTruthy(); expect(risk.closest('details')).toBeNull()
  expect(risk.textContent).toMatch(/敏感|隐私|密钥/)
  for (const label of ['复制 Markdown', '下载 Markdown', '导出任务包 JSON']) {
    expect(output().contains(button(label))).toBe(true)
    expect(button(label).closest('details')).toBeNull()
  }
  expect(field('Markdown 任务包').readOnly).toBe(true)
  expect(host.textContent).toContain('草稿已自动保存到此浏览器')
  expect(host.querySelector('.ai-context-task-identity').textContent).toContain('3 MiB')
  const limits = host.querySelector('.ai-context-capacities').textContent
  for (const limit of ['256 KiB', '1024 KiB']) expect(limits).toContain(limit)
  expect(host.querySelector('[aria-labelledby="context-material-heading"]').textContent).toContain('0 / 20 份材料')
  expect(host.textContent).toContain('不会调用模型')
  expect(storageWrites).not.toHaveBeenCalled(); expect(writeText).not.toHaveBeenCalled(); expect(downloads).toEqual([])
})

it('distinguishes a name draft from autosaved task content and keeps an invalid name visible until explicit cancellation', () => {
  mount(); edit(field('任务名称'), '尚未提交的名称')
  expect(host.querySelector('.ai-context-task-identity strong').textContent).toBe(original.tasks[0].name)
  expect(host.textContent).toContain('任务名称尚未保存；其他内容仍会自动保存。')
  edit(byLabel('任务目标'), '其他字段已经自动保存')
  expect(current(stored())).toMatchObject({ name: original.tasks[0].name, draft: { goal: '其他字段已经自动保存' } })
  edit(field('任务名称'), '   '); blurName()
  edit(byLabel('当前 AI 任务'), original.tasks[1].id)
  expect(byLabel('当前 AI 任务').value).toBe(original.activeId)
  expect(field('任务名称').value).toBe('   ')
  expect(field('任务名称').getAttribute('aria-invalid')).toBe('true')
  const error = document.getElementById('ai-task-name-error')
  expect(error.getAttribute('role')).toBe('alert'); expect(error.closest('details')).toBeNull()
  expect(field('任务名称').getAttribute('aria-describedby').split(' ')).toContain(error.id)
  click('撤销名称修改')
  expect(field('任务名称').value).toBe(original.tasks[0].name)
  expect(alerts()).toEqual([])
  edit(byLabel('当前 AI 任务'), original.tasks[1].id)
  expect(host.querySelector('.ai-context-task-identity strong').textContent).toBe(original.tasks[1].name)
  expect(byLabel('任务目标').value).toBe(original.tasks[1].draft.goal)
  expect(writeText).not.toHaveBeenCalled(); expect(downloads).toEqual([])
})

it('retains failed writes across remount and distinguishes the exact saved backup from the current pending task export', async () => {
  mount(); const savedRaw = localStorage.getItem(CONTEXT_TASKS_KEY)
  storageWrites.mockImplementation(() => { throw new window.DOMException('Synthetic quota refusal', 'QuotaExceededError') })
  edit(byLabel('任务目标'), '尚未写入存储的当前页面内容')
  expect(localStorage.getItem(CONTEXT_TASKS_KEY)).toBe(savedRaw)
  expect(hasPersonalPending(CONTEXT_TASKS_KEY)).toBe(true)
  expect(current(JSON.parse(readPersonalRaw(CONTEXT_TASKS_KEY))).draft.goal).toBe('尚未写入存储的当前页面内容')
  expect(host.textContent).toContain('草稿保存失败')
  await navigate('/away'); await navigate('/tools/ai-context')
  expect(byLabel('任务目标').value).toBe('尚未写入存储的当前页面内容')
  const recovery = host.querySelector('.ai-context-save-state')
  for (const label of ['下载已有草稿备份', '保存当前草稿并替换本地记录']) expect(recovery.contains(button(label))).toBe(true)
  expect(recovery.querySelector('[role="status"]').textContent).toContain('修改尚未保存')
  expect(recovery.querySelector('.ai-context-recovery-note').textContent).toMatch(/已保存|已有/)
  expect(recovery.querySelector('.ai-context-recovery-note').textContent).toMatch(/未保存/)
  expect(recovery.closest('details')).toBeNull(); expect(downloads).toEqual([])
  download('下载已有草稿备份'); download('导出任务包 JSON')
  expect(downloads.map(item => item.filename)).toEqual(['ai-context-stored-backup.json', 'ai-context.json'])
  expect(await blobs[0].text()).toBe(savedRaw)
  expect(await blobs[1].text()).toBe(JSON.stringify(current(JSON.parse(readPersonalRaw(CONTEXT_TASKS_KEY))).draft, null, 2))
  expect(JSON.parse(await blobs[1].text())).not.toHaveProperty('tasks')
  expect(localStorage.getItem(CONTEXT_TASKS_KEY)).toBe(savedRaw)
  storageWrites.mockRestore()
  click('保存当前草稿并替换本地记录')
  expect(current(stored()).draft.goal).toBe('尚未写入存储的当前页面内容')
  expect(stored().tasks[1]).toEqual(original.tasks[1])
  expect(hasPersonalPending(CONTEXT_TASKS_KEY)).toBe(false)
  expect(host.textContent).toContain('草稿已自动保存到此浏览器')
  expect(button('保存当前草稿并替换本地记录')).toBeUndefined()
  expect(writeText).not.toHaveBeenCalled()
})

it('keeps external-storage warnings beside recovery actions and preserves the edited task until explicit replacement', async () => {
  mount(); edit(byLabel('任务目标'), '本页当前内容')
  const external = fixture(); external.tasks[0].draft.goal = '其他标签页写入的内容'
  const raw = JSON.stringify(external, null, 2)
  localStorage.setItem(CONTEXT_TASKS_KEY, raw)
  act(() => window.dispatchEvent(new window.StorageEvent('storage', { key: CONTEXT_TASKS_KEY, newValue: raw })))
  edit(byLabel('约束条件'), '冲突后继续编辑的约束')
  expect(byLabel('任务目标').value).toBe('本页当前内容')
  expect(localStorage.getItem(CONTEXT_TASKS_KEY)).toBe(raw)
  expect(host.querySelector('.ai-context-save-state').textContent).toContain('其他标签页')
  expect(host.textContent).not.toContain('草稿已自动保存到此浏览器')
  download('下载已有草稿备份')
  expect(await blobs[0].text()).toBe(raw)
  click('保存当前草稿并替换本地记录')
  expect(current(stored()).draft).toMatchObject({ goal: '本页当前内容', constraints: '冲突后继续编辑的约束' })
  expect(stored().tasks[1]).toEqual(original.tasks[1])
  expect(hasPersonalPending(CONTEXT_TASKS_KEY)).toBe(false)
  expect(writeText).not.toHaveBeenCalled()
})

it('previews a parsed package without applying it and replaces only the fully identified current task', async () => {
  original.tasks[0].name = '替换目标-' + 'same-prefix-'.repeat(9) + '甲'
  mount(); const incoming = importedDraft(), raw = localStorage.getItem(CONTEXT_TASKS_KEY)
  await importDraft(incoming)
  expect(preview()).toBeTruthy(); expect(preview().closest('details')).toBeNull()
  expect(preview().textContent).toMatch(/尚未|未应用|未写入/)
  expect(preview().querySelector('.ai-context-import-target strong').textContent).toBe(original.tasks[0].name)
  expect(preview().textContent).toContain('其他任务保留')
  expect(preview().textContent).toContain(incoming.project)
  expect(localStorage.getItem(CONTEXT_TASKS_KEY)).toBe(raw)
  expect(byLabel('任务目标').value).toBe(original.tasks[0].draft.goal)
  expect(writeText).not.toHaveBeenCalled(); expect(downloads).toEqual([])
  click('导入并替换当前内容')
  const next = stored()
  expect(next.tasks).toHaveLength(2); expect(next.activeId).toBe(original.activeId)
  expect(current(next)).toMatchObject({ id: original.activeId, name: original.tasks[0].name, draft: incoming })
  expect(next.tasks[1]).toEqual(original.tasks[1])
  expect(preview()).toBeNull(); expect(byLabel('材料内容 1').value).toBe(incoming.materials[0].content.replace(/\r\n/g, '\n'))
})

it('imports as a new task while preserving every original task and keeps JSON scoped to that new draft', async () => {
  mount(); const incoming = importedDraft()
  await importDraft(incoming); click('作为新任务导入')
  const next = stored()
  expect(next.tasks).toHaveLength(3); expect(next.tasks.slice(0, 2)).toEqual(original.tasks)
  expect(next.activeId).not.toBe(original.activeId)
  expect(current(next)).toMatchObject({ name: incoming.project, draft: incoming })
  expect(host.querySelector('.ai-context-task-identity strong').textContent).toBe(incoming.project)
  expect(host.querySelector('.ai-context-output-identity strong').textContent).toBe(incoming.project)
  expect(preview()).toBeNull(); expect(downloads).toEqual([])
  download('导出任务包 JSON')
  expect(await blobs[0].text()).toBe(JSON.stringify(incoming, null, 2))
  expect(blobs[0].type).toBe('application/json'); expect(writeText).not.toHaveBeenCalled()
})

it('keeps malformed imports non-mutating and requires an explicit confirmation to delete the identified current task', async () => {
  original.tasks[0].name = '同名前缀'.repeat(20) + '当前删除目标'
  mount(); const raw = localStorage.getItem(CONTEXT_TASKS_KEY)
  await chooseFiles('导入任务包 JSON', [new NodeFile(['{broken'], 'malformed.json', { type: 'application/json' })])
  expect(alerts()).toContain('任务包不是有效的 JSON')
  expect(host.querySelector('[role="alert"]').closest('details')).toBeNull()
  expect(preview()).toBeNull(); expect(localStorage.getItem(CONTEXT_TASKS_KEY)).toBe(raw)
  expect(byLabel('任务目标').value).toBe(original.tasks[0].draft.goal)
  click('删除当前任务')
  const confirmation = host.querySelector('.ai-context-delete-confirm')
  expect(confirmation.textContent).toContain(`删除「${original.tasks[0].name}」`)
  expect(confirmation.closest('details')).toBeNull()
  expect(confirmation.contains(button('确认删除任务'))).toBe(true)
  expect(confirmation.contains(button('保留任务'))).toBe(true)
  expect(localStorage.getItem(CONTEXT_TASKS_KEY)).toBe(raw)
  click('保留任务')
  expect(host.querySelector('.ai-context-delete-confirm')).toBeNull()
  expect(localStorage.getItem(CONTEXT_TASKS_KEY)).toBe(raw)
  click('删除当前任务'); click('确认删除任务')
  expect(stored()).toEqual({ version: 1, activeId: original.tasks[1].id, tasks: [original.tasks[1]] })
  expect(host.querySelector('.ai-context-task-identity strong').textContent).toBe(original.tasks[1].name)
  expect(button('删除当前任务').disabled).toBe(true)
  expect(host.querySelector('.ai-context-delete-confirm')).toBeNull()
  expect(writeText).not.toHaveBeenCalled(); expect(downloads).toEqual([])
})

it('cancels only the import preview and discards a superseded import while an independent material read can finish', async () => {
  mount()
  const material = pendingFile('still-reading.txt', '材料'), oldImport = pendingFile('older.json', '{}')
  await chooseFiles('添加文本文件', [material.file]); await chooseFiles('导入任务包 JSON', [oldImport.file])
  await importDraft(importedDraft()); expect(preview()).toBeTruthy()
  click('取消导入'); expect(preview()).toBeNull()
  await settle(() => oldImport.resolve(bytes(JSON.stringify({ ...emptyContext(), goal: '过期导入内容' }))))
  expect(preview()).toBeNull(); expect(byLabel('任务目标').value).toBe(original.tasks[0].draft.goal)
  expect(field('添加文本文件').disabled).toBe(true)
  await settle(() => material.resolve(bytes('材料原文\r\n')))
  expect(current(stored()).draft.materials).toMatchObject([{ name: 'still-reading.txt', content: '材料原文\r\n' }])
  expect(field('添加文本文件').disabled).toBe(false)
  expect(alerts()).toEqual([]); expect(downloads).toEqual([]); expect(writeText).not.toHaveBeenCalled()
})

it.each(['success', 'failure'])('ignores late file and import %s after changing the active task', async outcome => {
  mount(); const material = pendingFile('old-task.txt', 'old'), bundle = pendingFile('old-task.json', '{}')
  await chooseFiles('添加文本文件', [material.file]); await chooseFiles('导入任务包 JSON', [bundle.file])
  expect(host.textContent).toContain('正在读取材料')
  edit(byLabel('当前 AI 任务'), original.tasks[1].id)
  const switched = localStorage.getItem(CONTEXT_TASKS_KEY)
  await settle(() => {
    if (outcome === 'success') { material.resolve(bytes('不得加入新任务')); bundle.resolve(bytes(JSON.stringify(importedDraft()))) }
    else { material.reject(Error('obsolete material failure')); bundle.reject(Error('obsolete import failure')) }
  })
  expect(byLabel('当前 AI 任务').value).toBe(original.tasks[1].id)
  expect(byLabel('任务目标').value).toBe(original.tasks[1].draft.goal)
  expect(field('添加文本文件').disabled).toBe(false)
  expect(current(stored()).draft.materials).toEqual([])
  expect(localStorage.getItem(CONTEXT_TASKS_KEY)).toBe(switched)
  expect(preview()).toBeNull(); expect(alerts()).toEqual([])
  expect(host.textContent).not.toContain('正在读取材料')
  expect(downloads).toEqual([]); expect(writeText).not.toHaveBeenCalled()
})

it('ignores pending reads after the actual tool route unmounts and returns with the original stored task', async () => {
  mount(); const material = pendingFile('unmounted.txt', 'old'), bundle = pendingFile('unmounted.json', '{}')
  await chooseFiles('添加文本文件', [material.file]); await chooseFiles('导入任务包 JSON', [bundle.file])
  const raw = localStorage.getItem(CONTEXT_TASKS_KEY)
  click(host.querySelector('a.back-link'))
  expect(router.state.location.pathname).toBe('/tools')
  expect(router.state.location.search).toBe('?q=context')
  await settle(() => { material.resolve(bytes('不得提交')); bundle.reject(Error('obsolete import failure')) })
  expect(host.textContent).toBe('合成工具目录')
  expect(localStorage.getItem(CONTEXT_TASKS_KEY)).toBe(raw)
  await navigate('/tools/ai-context')
  expect(byLabel('任务目标').value).toBe(original.tasks[0].draft.goal)
  expect(preview()).toBeNull(); expect(alerts()).toEqual([])
  expect(current(stored()).draft.materials).toEqual([])
  expect(writeText).not.toHaveBeenCalled(); expect(downloads).toEqual([])
})

it('keeps disclosure controls reversible and copies and downloads the exact decoded BOM, Unicode, CRLF and fence bytes only on request', async () => {
  original.tasks[0].draft = { ...emptyContext(), project: '合成项目', goal: '精确原文' }
  mount()
  const content = '\uFEFF// 中文 👩‍💻\r\nconst fence = "````";\r\n', name = '材料-' + 'long-name-'.repeat(20) + '.ts'
  await chooseFiles('添加文本文件', [new NodeFile([content], name, { type: 'text/plain' })])
  expect(current(stored()).draft.materials).toMatchObject([{ name, content }])
  const details = byLabel('材料内容 1').closest('details'), summary = details.querySelector('summary')
  expect(summary.textContent).toBe('1. ' + name); expect(details.open).toBe(true)
  const raw = localStorage.getItem(CONTEXT_TASKS_KEY)
  click(summary); expect(details.open).toBe(false)
  click(summary); expect(details.open).toBe(true)
  expect(localStorage.getItem(CONTEXT_TASKS_KEY)).toBe(raw)
  const help = [...host.querySelectorAll('details')].find(node => node !== details && !node.contains(details))
  expect(help).toBeTruthy(); expect(help.open).toBe(false)
  click(help.querySelector('summary')); expect(help.open).toBe(true)
  click(help.querySelector('summary')); expect(help.open).toBe(false)
  const expected = `# 合成项目\n\n## 任务目标\n\n精确原文\n\n## 参考材料\n\n以下为原始材料，请结合任务目标与约束理解。\n\n### ${name}\n\n\`\`\`\`\`\n${content}\`\`\`\`\`\n`
  expect(field('Markdown 任务包').value).toBe(expected.replace(/\r\n/g, '\n'))
  expect(writeText).not.toHaveBeenCalled(); expect(downloads).toEqual([])
  click('复制 Markdown'); expect(writeText).toHaveBeenCalledExactlyOnceWith(expected)
  expect(host.textContent).not.toContain('已复制')
  await settle(() => clipboardRequests[0].resolve())
  expect(output().textContent).toContain('已复制')
  download('下载 Markdown'); download('导出任务包 JSON')
  expect(downloads.map(item => item.filename)).toEqual(['ai-context.md', 'ai-context.json'])
  expect(blobs[0].type).toBe('text/markdown;charset=utf-8')
  expect(Array.from(new Uint8Array(await blobs[0].arrayBuffer()))).toEqual(Array.from(new TextEncoder().encode(expected)))
  expect(await blobs[1].text()).toBe(JSON.stringify(current(stored()).draft, null, 2))
})

it('shows clipboard failure beside output only after settlement and clears feedback when the copied task changes', async () => {
  mount(); click('复制 Markdown')
  expect(alerts()).toEqual([]); expect(host.textContent).not.toContain('已复制')
  await settle(() => clipboardRequests[0].reject(Error('Synthetic clipboard refusal')))
  const error = output().querySelector('[role="alert"]')
  expect(error.textContent).toBe('复制失败，请手动选择结果复制'); expect(error.closest('details')).toBeNull()
  click('复制 Markdown'); expect(alerts()).toEqual([])
  edit(byLabel('当前 AI 任务'), original.tasks[1].id)
  await settle(() => clipboardRequests[1].resolve())
  expect(host.textContent).not.toContain('已复制')
  click('复制 Markdown'); const expected = '# AI 任务上下文包\n\n## 任务目标\n\n其他任务内容\n'
  expect(writeText).toHaveBeenNthCalledWith(3, expected)
  await settle(() => clipboardRequests[2].resolve())
  expect(output().textContent).toContain('已复制')
  expect(downloads).toEqual([])
})

it('enforces the separate twenty-task and twenty-material counts while leaving replacement and removal available', async () => {
  original.tasks = Array.from({ length: MAX_CONTEXT_TASKS }, (_, index) => task(index ? `task-${index}` : original.activeId, `合成任务 ${index}`, emptyContext()))
  original.tasks[0].draft.materials = Array.from({ length: MAX_MATERIALS }, (_, index) => ({ id: `material-${index}`, name: `材料 ${index}`, content: '' }))
  mount()
  for (const label of ['新建任务', '新建示例任务', '复制当前任务', '添加文字片段']) expect(button(label).disabled).toBe(true)
  expect(button('删除当前任务').disabled).toBe(false)
  const extra = pendingFile('overflow.txt', 'x')
  await chooseFiles('添加文本文件', [extra.file])
  expect(extra.arrayBuffer).not.toHaveBeenCalled()
  expect(alerts()).toContain('最多添加 20 份材料')
  expect(current(stored()).draft.materials).toHaveLength(MAX_MATERIALS)
  await importDraft(importedDraft())
  expect(button('作为新任务导入').disabled).toBe(true)
  expect(button('导入并替换当前内容').disabled).toBe(false)
  click('取消导入'); click('删除材料：材料 0')
  expect(button('添加文字片段').disabled).toBe(false)
  expect(current(stored()).draft.materials).toHaveLength(MAX_MATERIALS - 1)
  expect(stored().tasks).toHaveLength(MAX_CONTEXT_TASKS)
  expect(writeText).not.toHaveBeenCalled(); expect(downloads).toEqual([])
})

it('accepts a 256 KiB material and rejects a larger file before reading or changing the saved draft', async () => {
  mount(); const content = 'x'.repeat(MAX_FILE_BYTES)
  await chooseFiles('添加文本文件', [new NodeFile([content], 'boundary.txt')])
  expect(current(stored()).draft.materials[0].content).toBe(content)
  const raw = localStorage.getItem(CONTEXT_TASKS_KEY), tooLarge = pendingFile('oversized.txt', content + 'x')
  await chooseFiles('添加文本文件', [tooLarge.file])
  expect(tooLarge.arrayBuffer).not.toHaveBeenCalled()
  expect(alerts().join(' ')).toContain('文件超过 256 KB')
  expect(host.querySelector('[role="alert"]').closest('details')).toBeNull()
  expect(localStorage.getItem(CONTEXT_TASKS_KEY)).toBe(raw)
  expect(field('添加文本文件').disabled).toBe(false)
  expect(writeText).not.toHaveBeenCalled(); expect(downloads).toEqual([])
})

it('rejects a task above 1 MiB without replacing the current preview or saved materials', () => {
  original.tasks[0].draft = { ...emptyContext(), materials: Array.from({ length: 4 }, (_, index) => ({ id: `material-${index}`, name: '', content: 'x'.repeat(MAX_FILE_BYTES) })) }
  expect(contextBytes(original.tasks[0].draft)).toBe(MAX_CONTEXT_BYTES)
  mount(); const raw = localStorage.getItem(CONTEXT_TASKS_KEY)
  edit(byLabel('任务目标'), 'x')
  expect(alerts()).toContain('任务内容总量不能超过 1 MiB，请减少材料')
  expect(byLabel('任务目标').value).toBe('')
  expect(localStorage.getItem(CONTEXT_TASKS_KEY)).toBe(raw)
  expect(current(stored()).draft.materials).toEqual(original.tasks[0].draft.materials)
  expect(hasPersonalPending(CONTEXT_TASKS_KEY)).toBe(false)
  expect(writeText).not.toHaveBeenCalled(); expect(downloads).toEqual([])
})

it('enforces the real 3 MiB store limit independently of the per-task limit and preserves all tasks on rejection', () => {
  const bounded = { ...emptyContext(), materials: Array.from({ length: 3 }, (_, index) => ({ id: `material-${index}`, name: '', content: 'x'.repeat(MAX_FILE_BYTES) })) }
  original.tasks = Array.from({ length: 4 }, (_, index) => task(index ? `task-${index}` : original.activeId, `总量边界任务 ${index}`, bounded))
  expect(original.tasks.reduce((sum, item) => sum + contextBytes(item.draft), 0)).toBe(MAX_TASK_STORE_BYTES)
  expect(contextBytes(bounded)).toBeLessThan(MAX_CONTEXT_BYTES)
  mount(); const raw = localStorage.getItem(CONTEXT_TASKS_KEY)
  edit(byLabel('任务目标'), 'x')
  expect(alerts()).toContain('AI 任务总材料超过 3 MiB，请先导出并删除暂时不用的任务')
  expect(byLabel('任务目标').value).toBe('')
  expect(localStorage.getItem(CONTEXT_TASKS_KEY)).toBe(raw)
  expect(stored().tasks).toEqual(original.tasks)
  expect(hasPersonalPending(CONTEXT_TASKS_KEY)).toBe(false)
  expect(writeText).not.toHaveBeenCalled(); expect(downloads).toEqual([])
})

it('loads an existing pending draft without claiming it is saved or automatically exporting, copying or replacing local records', () => {
  const pending = fixture(); pending.tasks[0].draft.goal = '先前失败的待保存内容'
  rememberPersonalPending(CONTEXT_TASKS_KEY, JSON.stringify(pending))
  mount()
  expect(byLabel('任务目标').value).toBe(pending.tasks[0].draft.goal)
  expect(current(stored()).draft.goal).toBe(original.tasks[0].draft.goal)
  expect(host.querySelector('.ai-context-save-state').textContent).toContain('修改尚未保存')
  expect(host.textContent).not.toContain('草稿已自动保存到此浏览器')
  expect(storageWrites).not.toHaveBeenCalled(); expect(downloads).toEqual([]); expect(writeText).not.toHaveBeenCalled()
})
