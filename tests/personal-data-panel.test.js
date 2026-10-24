import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PersonalDataPanel from '../src/components/workspace/PersonalDataPanel'
import WorkspacePanel from '../src/components/workspace/WorkspacePanel'
import { PERSONAL_KEYS } from '../src/utils/personal-backup'
import { clearPersonalPending, writePersonalRaw } from '../src/utils/personal-storage'
import { CONTEXT_STORAGE_KEY, emptyContext } from '../src/tools/packages/ai-context/context'
import { CONTEXT_TASKS_KEY, emptyContextStore, newContextTask } from '../src/tools/packages/ai-context/store'

const files = vi.hoisted(() => ({ downloadText: vi.fn(), readTextFile: vi.fn() }))
vi.mock('../src/utils/tool-files', () => files)
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); PERSONAL_KEYS.forEach(clearPersonalPending)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  act(() => root.render(h(PersonalDataPanel)))
})
afterEach(() => {
  act(() => root.unmount()); host.remove(); vi.restoreAllMocks()
  localStorage.clear(); PERSONAL_KEYS.forEach(clearPersonalPending)
})
const click = text => act(() => [...host.querySelectorAll('button')].find(button => button.textContent === text).click())
const recovery = () => ({ kind: 'devos-personal-data', version: 1, exportedAt: '2026-10-22', entries: { 'devos.workspace.note': '"恢复便笺"' }, unavailableKeys: ['favoriteTools'] })
async function importBackup(value) {
  files.readTextFile.mockResolvedValue(JSON.stringify(value))
  const input = host.querySelector('[aria-label="导入个人备份"]')
  Object.defineProperty(input, 'files', { configurable: true, value: [new globalThis.File(['fixture'], 'recovery.json', { type: 'application/json' })] })
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
}

it('labels partial exports and clears their warning after a complete retry', () => {
  const storage = Object.getPrototypeOf(localStorage)
  const write = vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('storage denied') })
  expect(() => writePersonalRaw('devos.workspace.note', '"本页修改"')).toThrow()
  const read = vi.spyOn(storage, 'getItem').mockImplementation(() => { throw new Error('storage denied') })
  click('导出个人备份')
  const [name, raw, mime] = files.downloadText.mock.calls[0]
  expect(name).toBe('devos-personal-recovery.json')
  expect(mime).toBe('application/json')
  expect(JSON.parse(raw).entries['devos.workspace.note']).toBe('"本页修改"')
  expect(host.querySelector('[role="alert"]').textContent).toContain('这不是完整备份')
  expect(host.querySelector('[role="alert"]').textContent).toContain('工具收藏')
  expect(host.querySelector('[role="status"]').textContent).toContain('恢复备份')
  read.mockRestore(); write.mockRestore()
  click('导出个人备份')
  expect(files.downloadText.mock.calls[1][0]).toBe('devos-personal-backup.json')
  expect(JSON.parse(files.downloadText.mock.calls[1][1])).not.toHaveProperty('unavailableKeys')
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(host.querySelector('[role="status"]').textContent).toContain('个人备份已下载')
})

it('does not download an unreadable empty backup or leave an old success message', () => {
  click('导出个人备份')
  expect(files.downloadText).toHaveBeenCalledOnce()
  vi.spyOn(Object.getPrototypeOf(localStorage), 'getItem').mockImplementation(() => { throw new Error('storage denied') })
  click('导出个人备份')
  expect(files.downloadText).toHaveBeenCalledOnce()
  expect(host.querySelector('[role="status"]')).toBeNull()
  expect(host.querySelector('[role="alert"]').textContent).toContain('没有可导出')
})

it('warns during partial import preview and preserves omitted values when replacing', async () => {
  localStorage.setItem('favoriteTools', '["json"]')
  await importBackup(recovery())
  expect(host.querySelector('[role="alert"]').textContent).toContain('这是部分恢复备份')
  expect(host.querySelector('[role="alert"]').textContent).toContain('工具收藏')
  const mode = host.querySelector('[aria-label="导入方式"]')
  act(() => { mode.value = 'replace'; mode.dispatchEvent(new Event('change', { bubbles: true })) })
  click('确认导入个人数据')
  expect(localStorage.getItem('devos.workspace.note')).toBe('"恢复便笺"')
  expect(localStorage.getItem('favoriteTools')).toBe('["json"]')
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(host.querySelector('[role="status"]').textContent).toContain('个人数据已导入')
})

it('cancels partial import without touching current records and accepts an older full backup', async () => {
  localStorage.setItem('devos.workspace.note', '"本机原文"')
  await importBackup(recovery())
  click('取消导入')
  expect(localStorage.getItem('devos.workspace.note')).toBe('"本机原文"')
  expect(host.querySelector('.personal-import-preview')).toBeNull()
  const complete = recovery(); delete complete.unavailableKeys
  await importBackup(complete)
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(host.querySelector('.personal-import-preview')).not.toBeNull()
})

it.each(['unavailableKeys', 'unreadableKeys', 'both', 'none'])('legacy recovery preview protects two modern tasks for %s metadata', async field => {
  const current = emptyContextStore({ ...emptyContext(), project: '现代任务一' })
  current.tasks.push(newContextTask({ ...emptyContext(), project: '现代任务二' }, '任务二'))
  localStorage.setItem(CONTEXT_TASKS_KEY, JSON.stringify(current))
  const value = { kind: 'devos-personal-data', version: 1, exportedAt: '2026-10-22', entries: { [CONTEXT_STORAGE_KEY]: JSON.stringify({ ...emptyContext(), project: '旧版恢复任务' }) } }
  if (field !== 'none') value[field === 'both' ? 'unavailableKeys' : field] = [CONTEXT_TASKS_KEY]
  if (field === 'both') value.unreadableKeys = [CONTEXT_TASKS_KEY]
  await importBackup(value)
  expect(host.textContent).toContain('旧版备份只包含一个 AI 草稿')
  if (field !== 'none') expect(host.querySelector('[role="alert"]').textContent).toContain('这是部分恢复备份')
  const mode = host.querySelector('[aria-label="导入方式"]')
  act(() => { mode.value = 'replace'; mode.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(host.textContent).toContain('合并')
  expect([...host.querySelectorAll('button')].some(button => button.textContent === '确认导入个人数据')).toBe(false)
  expect(localStorage.getItem(CONTEXT_TASKS_KEY)).toBe(JSON.stringify(current))
  act(() => { mode.value = 'merge'; mode.dispatchEvent(new Event('change', { bubbles: true })) })
  click('确认导入个人数据')
  const restored = JSON.parse(localStorage.getItem(CONTEXT_TASKS_KEY))
  expect(restored.activeId).toBe(current.activeId)
  expect(restored.tasks.map(task => task.draft.project)).toEqual(['现代任务一', '现代任务二', '旧版恢复任务'])
  click('导出个人备份')
  const exported = JSON.parse(files.downloadText.mock.calls.at(-1)[1])
  expect(JSON.parse(exported.entries[CONTEXT_TASKS_KEY])).toEqual(restored)
  expect(exported.entries[CONTEXT_STORAGE_KEY]).toBeUndefined()
  expect(exported.unavailableKeys).toBeUndefined()
  expect(exported.unreadableKeys).toBeUndefined()
})

it('rescues a blocked-storage pending note through the mounted workspace, restores and re-exports it', async () => {
  localStorage.setItem('favoriteTools', '["json"]')
  act(() => root.render(h(WorkspacePanel)))
  const storage = Object.getPrototypeOf(localStorage)
  const read = vi.spyOn(storage, 'getItem').mockImplementation(() => { throw new Error('storage denied') })
  const write = vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('storage denied') })
  act(() => {
    const note = host.querySelector('#workspace-note')
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(note), 'value').set.call(note, '本页必须抢救的便笺')
    note.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(host.querySelector('#workspace-note-status').textContent).toContain('保存失败')
  click('导出个人备份')
  const [name, raw] = files.downloadText.mock.calls[0]
  expect(name).toBe('devos-personal-recovery.json')
  expect(JSON.parse(raw).entries['devos.workspace.note']).toBe('"本页必须抢救的便笺"')
  expect(JSON.parse(raw).unavailableKeys).toContain('favoriteTools')
  read.mockRestore(); write.mockRestore()
  await importBackup(JSON.parse(raw))
  const mode = host.querySelector('[aria-label="导入方式"]')
  act(() => { mode.value = 'replace'; mode.dispatchEvent(new Event('change', { bubbles: true })) })
  click('确认导入个人数据')
  expect(localStorage.getItem('devos.workspace.note')).toBe('"本页必须抢救的便笺"')
  expect(localStorage.getItem('favoriteTools')).toBe('["json"]')
  act(() => root.render(null))
  act(() => root.render(h(WorkspacePanel)))
  expect(host.querySelector('#workspace-note').value).toBe('本页必须抢救的便笺')
  click('导出个人备份')
  const [completeName, completeRaw] = files.downloadText.mock.calls.at(-1)
  const complete = JSON.parse(completeRaw)
  expect(completeName).toBe('devos-personal-backup.json')
  expect(complete.entries['devos.workspace.note']).toBe('"本页必须抢救的便笺"')
  expect(complete.entries.favoriteTools).toBe('["json"]')
  expect(complete).not.toHaveProperty('unavailableKeys')
  expect(complete).not.toHaveProperty('unreadableKeys')
})
