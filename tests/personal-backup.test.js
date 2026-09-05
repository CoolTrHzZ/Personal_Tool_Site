import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyPersonalImport, exportPersonalData, parsePersonalBackup, PERSONAL_KEYS, preparePersonalImport } from '../src/utils/personal-backup'
import { clearPersonalPending, readPersonalRaw, writePersonalRaw } from '../src/utils/personal-storage'
import { CONTEXT_STORAGE_KEY, emptyContext } from '../src/tools/packages/ai-context/context'
import { CONTEXT_TASKS_KEY, emptyContextStore, validateContextStore } from '../src/tools/packages/ai-context/store'
import { fillPrompt, promptVariables } from '../src/utils/prompt-template'

const backup = entries => ({ kind: 'devos-personal-data', version: 1, exportedAt: '2026-09-05', entries })
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); PERSONAL_KEYS.forEach(clearPersonalPending) })

describe('个人数据迁移', () => {
  it('导出只收录个人白名单且包含写失败的会话值，拒绝站点备份及错误结构', () => {
    localStorage.setItem('admin-secret', 'private')
    localStorage.setItem('favoriteTools', '["json"]')
    const prototype = Object.getPrototypeOf(localStorage)
    const set = vi.spyOn(prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(() => writePersonalRaw('devos.workspace.note', JSON.stringify('本页未保存'))).toThrow()
    expect(exportPersonalData().entries).toEqual({ favoriteTools: '["json"]', 'devos.workspace.note': '"本页未保存"' })
    set.mockRestore()
    expect(() => parsePersonalBackup(JSON.stringify({ kind: 'devos-site-backup', version: 1, entries: {} }))).toThrow('公开站点备份')
    expect(() => parsePersonalBackup(JSON.stringify(backup({ 'admin-secret': 'private' })))).toThrow('不支持')
    expect(() => parsePersonalBackup(JSON.stringify(backup({ 'devos.workspace.todos': '[{"id":"x","text":1,"done":false}]' })))).toThrow('格式')
  })

  it('合并保留旧版 AI 本机草稿，并保留同 ID 但不同内容的任务', () => {
    const legacy = { ...emptyContext(), project: '未迁移的本机项目' }
    localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(legacy))
    const incoming = emptyContextStore({ ...emptyContext(), project: '另一台机器的项目' })
    const plan = preparePersonalImport(backup({ [CONTEXT_TASKS_KEY]: JSON.stringify(incoming) }), 'merge')
    const merged = JSON.parse(plan.entries[CONTEXT_TASKS_KEY])
    expect(merged.tasks.map(task => task.draft.project)).toEqual(['未迁移的本机项目', '另一台机器的项目'])
    applyPersonalImport(plan)
    const changed = JSON.parse(JSON.stringify(merged))
    changed.tasks[0].draft.goal = '另一台机器上的修改'
    const next = preparePersonalImport(backup({ [CONTEXT_TASKS_KEY]: JSON.stringify(changed) }), 'merge')
    expect(JSON.parse(next.entries[CONTEXT_TASKS_KEY]).tasks).toHaveLength(3)
    expect(localStorage.getItem(CONTEXT_STORAGE_KEY)).toBe(JSON.stringify(legacy))
  })

  it('导入预览后发生修改时拒绝覆盖，容量超限合并不截断内容', () => {
    localStorage.setItem('devos.workspace.note', JSON.stringify('a'.repeat(9990)))
    expect(() => preparePersonalImport(backup({ 'devos.workspace.note': JSON.stringify('第二份便笺') }), 'merge')).toThrow('限制')
    const plan = preparePersonalImport(backup({ 'favoriteTools': '["json"]' }), 'replace')
    localStorage.setItem('favoriteTools', '["base64"]')
    expect(() => applyPersonalImport(plan)).toThrow('预览后')
    expect(localStorage.getItem('favoriteTools')).toBe('["base64"]')
    const legacyPlan = preparePersonalImport(backup({ [CONTEXT_STORAGE_KEY]: JSON.stringify(emptyContext()) }), 'merge')
    localStorage.setItem(CONTEXT_TASKS_KEY, JSON.stringify(emptyContextStore()))
    expect(() => applyPersonalImport(legacyPlan)).toThrow('预览后')
  })

  it('多项写入失败会回滚已经写入的值', () => {
    localStorage.setItem('favoriteTools', '["base64"]')
    const plan = preparePersonalImport(backup({ favoriteTools: '["json"]', 'devos.workspace.note': '"new"' }), 'replace')
    const prototype = Object.getPrototypeOf(localStorage)
    const setItem = prototype.setItem
    vi.spyOn(prototype, 'setItem').mockImplementation(function (key, value) { if (key === 'devos.workspace.note') throw new Error('quota'); return setItem.call(this, key, value) })
    expect(() => applyPersonalImport(plan)).toThrow('已恢复原有数据')
    expect(localStorage.getItem('favoriteTools')).toBe('["base64"]')
    expect(localStorage.getItem('devos.workspace.note')).toBeNull()
  })

  it('回滚删除也失败时，原本缺失的项不会污染恢复备份', () => {
    const plan = preparePersonalImport(backup({ favoriteTools: '["json"]', 'devos.workspace.note': '"new"' }), 'replace')
    const prototype = Object.getPrototypeOf(localStorage)
    const setItem = prototype.setItem
    vi.spyOn(prototype, 'setItem').mockImplementation(function (key, value) { if (key === 'devos.workspace.note') throw new Error('quota'); return setItem.call(this, key, value) })
    vi.spyOn(prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => applyPersonalImport(plan)).toThrow('部分存储无法恢复')
    expect(localStorage.getItem('favoriteTools')).toBe('["json"]')
    expect(readPersonalRaw('favoriteTools')).toBeNull()
    expect(exportPersonalData().entries.favoriteTools).toBeUndefined()
  })

  it('合并 CFG 保留本机草稿并把外来原文保存在版本中，项目置顶取并集', () => {
    const current = { draft: { name: 'local', content: 'sensitivity 1\\n' }, versions: [] }
    const incoming = { draft: { name: 'remote', content: '\uFEFF// 原文\r\nsensitivity 2\r\n' }, versions: [] }
    localStorage.setItem('devos.cfg.workbench.v1', JSON.stringify(current))
    localStorage.setItem('devos.projects.pinned', '["local"]')
    const plan = preparePersonalImport(backup({ 'devos.cfg.workbench.v1': JSON.stringify(incoming), 'devos.projects.pinned': '["remote"]' }), 'merge')
    const merged = JSON.parse(plan.entries['devos.cfg.workbench.v1'])
    expect(merged.draft).toEqual(current.draft)
    expect(merged.versions[0].content).toBe(incoming.draft.content)
    expect(JSON.parse(plan.entries['devos.projects.pinned'])).toEqual(['local', 'remote'])
  })

  it('AI 列表校验上限与当前任务，模板变量按原文替换并保留未填项', () => {
    const store = emptyContextStore()
    expect(validateContextStore(store)).toEqual(store)
    expect(() => validateContextStore({ ...store, activeId: 'missing' })).toThrow('不存在')
    expect(() => validateContextStore({ ...store, tasks: Array(21).fill(store.tasks[0]) })).toThrow('1–20')
    expect(fillPrompt('{{constructor}} {{__proto__}}', {})).toBe('{{constructor}} {{__proto__}}')
    expect(promptVariables('Explain {{topic}} then {{ topic }} in {{语言}}')).toEqual(['topic', '语言'])
    expect(fillPrompt('{{topic}} / {{topic}} / {{missing}}', { topic: '$&\n原文' })).toBe('$&\n原文 / $&\n原文 / {{missing}}')
  })
})
