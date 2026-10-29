import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PersonalDataPanel from '../src/components/workspace/PersonalDataPanel'
import { PERSONAL_KEYS } from '../src/utils/personal-backup'
import { clearPersonalPending, writePersonalRaw } from '../src/utils/personal-storage'

const files = vi.hoisted(() => ({ readTextFile: vi.fn(), downloadText: vi.fn() }))
vi.mock('../src/utils/tool-files', () => files)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const NOTE = 'devos.workspace.note'
const READING = '正在读取备份，尚未导入'
const CANCEL = '取消本次读取'
const CONFIRM = '确认导入个人数据'
let host, root, storage, requests, restored

function isolatedStorage() {
  const values = new Map()
  return {
    get length() { return values.size },
    key: vi.fn(index => [...values.keys()][index] ?? null),
    getItem: vi.fn(key => values.get(String(key)) ?? null),
    setItem: vi.fn((key, value) => { values.set(String(key), String(value)) }),
    removeItem: vi.fn(key => { values.delete(String(key)) }),
    clear: vi.fn(() => values.clear()),
  }
}

const backup = (note = '新便笺', partial = false) => ({
  kind: 'devos-personal-data', version: 1, exportedAt: '2026-10-22',
  entries: { [NOTE]: JSON.stringify(note) },
  ...(partial ? { unavailableKeys: ['favoriteTools'] } : {}),
})
const preview = () => host.querySelector('.personal-import-preview')
const findButton = text => [...host.querySelectorAll('button')].find(item => item.textContent === text)
function button(text) {
  const matches = [...host.querySelectorAll('button')].filter(item => item.textContent === text)
  expect(matches).toHaveLength(1)
  return matches[0]
}
const input = () => host.querySelector('input[aria-label="导入个人备份"]')
const reading = () => [...host.querySelectorAll('[role="status"]')].find(item => item.textContent === READING)
const click = text => act(() => button(text).click())
const settle = action => act(async () => { action() })
const setMode = value => act(() => {
  const select = host.querySelector('select[aria-label="导入方式"]')
  expect(select).not.toBeNull()
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
})

function choose(file) {
  act(() => {
    const target = input()
    expect(target).not.toBeNull()
    Object.defineProperty(target, 'files', { configurable: true, value: file ? [file] : [] })
    target.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function startRead(name = 'synthetic-personal.json') {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  const request = { resolve, reject, promise }
  requests.push(request)
  files.readTextFile.mockReturnValueOnce(promise)
  const file = new globalThis.File(['synthetic fixture'], name, { type: 'application/json' })
  choose(file)
  expect(files.readTextFile).toHaveBeenLastCalledWith(file, 32 * 1024 * 1024)
  expect(input().value).toBe('')
  return request
}

async function finishRead(request, value = backup()) {
  await settle(() => request.resolve(JSON.stringify(value)))
}

async function lateResult(request, outcome) {
  if (outcome === 'resolve') await finishRead(request, backup('已过期的文件内容'))
  else await settle(() => request.reject(new Error('已过期的读取错误')))
}

function seed(key, value) {
  storage.setItem(key, value)
  storage.setItem.mockClear()
}

function expectNoImport() {
  expect(storage.setItem).not.toHaveBeenCalled()
  expect(storage.removeItem).not.toHaveBeenCalled()
  expect(restored).not.toHaveBeenCalled()
}

function expectPending() {
  expect(reading()).toBeDefined()
  expect(button(CANCEL).disabled).toBe(false)
  expect(preview()).toBeNull()
  expect(findButton(CONFIRM)).toBeUndefined()
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expectNoImport()
}

function expectIdle() {
  expect(reading()).toBeUndefined()
  expect(findButton(CANCEL)).toBeUndefined()
  expect(findButton(CONFIRM)).toBeUndefined()
  expect(preview()).toBeNull()
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expectNoImport()
}

beforeEach(() => {
  vi.clearAllMocks()
  files.readTextFile.mockReset()
  storage = isolatedStorage()
  vi.stubGlobal('localStorage', storage)
  localStorage.clear()
  PERSONAL_KEYS.forEach(clearPersonalPending)
  requests = []
  restored = vi.fn()
  window.addEventListener('devos:personal-data-restored', restored)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(h(PersonalDataPanel)))
})

afterEach(async () => {
  if (root) act(() => root.unmount())
  // Finish any deliberately pending fixtures only after unmount invalidates them.
  await settle(() => requests.forEach(request => request.resolve(JSON.stringify(backup()))))
  host.remove()
  window.removeEventListener('devos:personal-data-restored', restored)
  vi.restoreAllMocks()
  localStorage.clear()
  PERSONAL_KEYS.forEach(clearPersonalPending)
  vi.unstubAllGlobals()
})

it('shows a pending read immediately, before any preview or storage mutation', () => {
  seed(NOTE, '"原便笺"')
  expectIdle()
  startRead()
  expectPending()
  expect(button(CANCEL).closest('.personal-import-preview')).toBeNull()
  expect(storage.getItem(NOTE)).toBe('"原便笺"')
  expect(files.downloadText).not.toHaveBeenCalled()
})

it.each(['resolve', 'reject'])('keeps B pending when superseded A later %s (including A finally)', async outcome => {
  const old = startRead('A.json')
  const current = startRead('B.json')
  await lateResult(old, outcome)
  expectPending()
  await finishRead(current, backup('B'))
  expect(reading()).toBeUndefined()
  expect(findButton(CANCEL)).toBeUndefined()
  expect(preview().querySelector('li').textContent).toBe('便笺：无记录 → 1 字符')
  expect(button(CONFIRM).disabled).toBe(false)
  expectNoImport()
})

it.each(['resolve', 'reject'])('cancels a read immediately and ignores its late %s', async outcome => {
  seed(NOTE, '"保留原文"')
  const old = startRead()
  click(CANCEL)
  expectIdle()
  await lateResult(old, outcome)
  expectIdle()
  expect(storage.getItem(NOTE)).toBe('"保留原文"')
  expect(files.downloadText).not.toHaveBeenCalled()
})

it.each(['resolve', 'reject'])('keeps B pending after cancel A, select B, then A %s', async outcome => {
  const old = startRead('cancel-A.json')
  click(CANCEL)
  const current = startRead('current-B.json')
  await lateResult(old, outcome)
  expectPending()
  await finishRead(current, backup('有效 B'))
  expect(reading()).toBeUndefined()
  expect(preview().querySelector('li').textContent).toBe('便笺：无记录 → 4 字符')
  expectNoImport()
})

it.each(['resolve', 'reject'])('does not replace a ready B preview with canceled A late %s', async outcome => {
  const old = startRead('cancel-A.json')
  click(CANCEL)
  const current = startRead('current-B.json')
  await finishRead(current, backup('有效 B'))
  const ready = preview().textContent
  await lateResult(old, outcome)
  expect(preview().textContent).toBe(ready)
  expect(reading()).toBeUndefined()
  expect(findButton(CANCEL)).toBeUndefined()
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expectNoImport()
})

it('supports repeated cancel rounds and makes detached cancel buttons harmless', async () => {
  const canceled = [], detached = []
  for (const name of ['first.json', 'second.json']) {
    canceled.push(startRead(name))
    const cancel = button(CANCEL)
    detached.push(cancel)
    act(() => { cancel.click(); cancel.click() })
    expect(cancel.isConnected).toBe(false)
    expectIdle()
  }
  const current = startRead('third.json')
  act(() => detached.forEach(cancel => { cancel.click(); cancel.click() }))
  expectPending()
  await finishRead(canceled[0])
  await settle(() => canceled[1].reject(new Error('旧轮次失败')))
  expectPending()
  await finishRead(current, backup('第三轮'))
  const ready = preview().textContent
  act(() => detached.forEach(cancel => cancel.click()))
  expect(preview().textContent).toBe(ready)
  expect(files.readTextFile).toHaveBeenCalledTimes(3)
  expect(files.downloadText).not.toHaveBeenCalled()
  expectNoImport()
})

it('returns early on no file without starting, canceling, or clearing the current read or preview', async () => {
  choose(undefined)
  expect(files.readTextFile).not.toHaveBeenCalled()
  expectIdle()
  const current = startRead()
  choose(undefined)
  expectPending()
  expect(files.readTextFile).toHaveBeenCalledOnce()
  await finishRead(current)
  const ready = preview().textContent
  choose(undefined)
  expect(preview().textContent).toBe(ready)
  expect(reading()).toBeUndefined()
  expect(findButton(CANCEL)).toBeUndefined()
  expect(button(CONFIRM).disabled).toBe(false)
  expect(files.readTextFile).toHaveBeenCalledOnce()
  expectNoImport()
})

it.each(['read rejection', 'invalid backup'])('clears reading after current %s and permits a clean retry', async failure => {
  const failed = startRead()
  const error = failure === 'read rejection' ? '合成文件读取失败' : '便笺数据格式无效或超过数量限制'
  if (failure === 'read rejection') await settle(() => failed.reject(new Error(error)))
  else await finishRead(failed, { ...backup(), entries: { [NOTE]: '42' } })
  expect(reading()).toBeUndefined()
  expect(findButton(CANCEL)).toBeUndefined()
  expect(preview()).toBeNull()
  expect(host.querySelector('[role="alert"]').textContent).toBe(error)
  expect(input().disabled).toBe(false)
  expectNoImport()
  const retry = startRead('retry.json')
  expectPending()
  await finishRead(retry)
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(reading()).toBeUndefined()
  expect(button(CONFIRM).disabled).toBe(false)
  expectNoImport()
})

it.each(['resolve', 'reject'])('ignores late read %s after unmount, including after a fresh mount', async outcome => {
  const old = startRead()
  act(() => root.unmount())
  root = null
  expect(host.textContent).toBe('')
  await lateResult(old, outcome)
  expect(host.textContent).toBe('')
  expectNoImport()
  root = createRoot(host)
  act(() => root.render(h(PersonalDataPanel)))
  expectIdle()
  expect(files.downloadText).not.toHaveBeenCalled()
})

it('retains replace mode when selecting another file and prepares that file with the retained mode', async () => {
  seed(NOTE, '"abc"')
  await finishRead(startRead('first.json'), backup('xyz'))
  setMode('replace')
  const next = startRead('next.json')
  expectPending()
  await finishRead(next, backup('next'))
  expect(host.querySelector('[aria-label="导入方式"]').value).toBe('replace')
  expect(preview().querySelector('li').textContent).toBe('便笺：3 字符 → 4 字符')
  expectNoImport()
  click(CONFIRM)
  expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(NOTE, '"next"')
  expect(storage.removeItem).not.toHaveBeenCalled()
  expect(restored).toHaveBeenCalledOnce()
})

it('retains the existing ready-preview cancel behavior, including its export message', async () => {
  seed(NOTE, '"现有便笺"')
  await finishRead(startRead(), backup('恢复便笺', true))
  expect(host.querySelector('[role="alert"]').textContent).toContain('这是部分恢复备份')
  click('导出个人备份')
  const message = host.querySelector('[role="status"]').textContent
  expect(message).toBe('个人备份已下载。保存在文件中的内容仅属于此浏览器。')
  click('取消导入')
  expectIdle()
  expect(host.querySelector('[role="status"]').textContent).toBe(message)
  expect(storage.getItem(NOTE)).toBe('"现有便笺"')
  await finishRead(startRead('retry.json'))
  expect(host.querySelector('[role="status"]')).toBeNull()
  expect(button(CONFIRM).disabled).toBe(false)
  expectNoImport()
})

it('labels an abc to xyz replacement as a count summary and writes only on exact explicit confirmation', async () => {
  seed(NOTE, '"abc"')
  await finishRead(startRead(), backup('xyz'))
  setMode('replace')
  click('刷新导入预览')
  const area = preview(), list = area.querySelector('ul')
  const summary = [...area.querySelectorAll('*')].find(item => item.textContent === '导入摘要：当前→导入后')
  const caveat = [...area.querySelectorAll('*')].find(item => item.textContent === '仅数量与名称摘要，不是正文差异')
  expect(summary).toBeDefined()
  expect(caveat).toBeDefined()
  expect(summary.compareDocumentPosition(list) & globalThis.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(caveat.compareDocumentPosition(list) & globalThis.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(list.querySelector('li').textContent).toBe('便笺：3 字符 → 3 字符')
  expect(area.textContent).not.toContain('abc')
  expect(area.textContent).not.toContain('xyz')
  expect(area.textContent).not.toContain('无变化')
  expect(storage.getItem(NOTE)).toBe('"abc"')
  expectNoImport()
  click(CONFIRM)
  expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(NOTE, '"xyz"')
  expect(storage.removeItem).not.toHaveBeenCalled()
  expect(restored).toHaveBeenCalledOnce()
  expect(preview()).toBeNull()
  expect(host.querySelector('[role="status"]').textContent).toBe('个人数据已导入。主题、动效与首页视图偏好将在刷新后应用。')
  expect(host.querySelector('[role="alert"]')).toBeNull()
})

it('preserves partial recovery warnings and omitted records, then accepts a complete import', async () => {
  seed('favoriteTools', '["json"]')
  const partial = startRead('partial.json')
  expectPending()
  await finishRead(partial, backup('部分恢复', true))
  expect(reading()).toBeUndefined()
  expect(host.querySelector('[role="alert"]').textContent).toBe('这是部分恢复备份，未包含：工具收藏。只导入文件中包含的项目，其他记录不会删除。')
  setMode('replace')
  expectNoImport()
  click(CONFIRM)
  expect(storage.getItem(NOTE)).toBe('"部分恢复"')
  expect(storage.getItem('favoriteTools')).toBe('["json"]')
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(host.querySelector('[role="status"]').textContent).toContain('个人数据已导入')
  storage.setItem.mockClear(); restored.mockClear()
  const full = startRead('complete.json')
  expectPending()
  await finishRead(full, backup('完整恢复'))
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expectNoImport()
  click(CONFIRM)
  expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(NOTE, '"完整恢复"')
  expect(storage.removeItem).not.toHaveBeenCalled()
  expect(host.querySelector('[role="status"]').textContent).toBe('个人数据已导入。主题、动效与首页视图偏好将在刷新后应用。')
})

it('preserves explicit partial and complete export feedback when canceling a pending read', () => {
  startRead()
  storage.setItem.mockImplementationOnce(() => { throw new Error('合成存储拒绝') })
  expect(() => writePersonalRaw(NOTE, '"待抢救修改"')).toThrow('合成存储拒绝')
  storage.setItem.mockClear()
  const getItem = storage.getItem.getMockImplementation()
  storage.getItem.mockImplementation(() => { throw new Error('合成存储拒绝') })
  click('导出个人备份')
  const [partialName, partialRaw, mime] = files.downloadText.mock.calls[0]
  expect(partialName).toBe('devos-personal-recovery.json')
  expect(mime).toBe('application/json')
  expect(JSON.parse(partialRaw).entries[NOTE]).toBe('"待抢救修改"')
  expect(JSON.parse(partialRaw).unavailableKeys).toContain('favoriteTools')
  const partialError = host.querySelector('[role="alert"]').textContent
  expect(partialError).toContain('这不是完整备份，未能读取：')
  expect(reading()).toBeDefined()
  click(CANCEL)
  expect(host.querySelector('[role="alert"]').textContent).toBe(partialError)
  expect(host.querySelector('[role="status"]').textContent).toBe('已下载可读取内容的恢复备份，包含当前会话中保留的未保存修改。')
  storage.getItem.mockImplementation(getItem)
  startRead('complete-export.json')
  expectPending()
  click('导出个人备份')
  const [completeName, completeRaw] = files.downloadText.mock.calls[1]
  expect(completeName).toBe('devos-personal-backup.json')
  expect(JSON.parse(completeRaw).entries[NOTE]).toBe('"待抢救修改"')
  expect(JSON.parse(completeRaw)).not.toHaveProperty('unavailableKeys')
  expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(reading()).toBeDefined()
  click(CANCEL)
  expect(host.querySelector('[role="status"]').textContent).toBe('个人备份已下载。保存在文件中的内容仅属于此浏览器。')
  expect(reading()).toBeUndefined()
  expect(findButton(CANCEL)).toBeUndefined()
  expectNoImport()
})
