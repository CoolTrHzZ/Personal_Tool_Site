import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyPersonalImport, exportPersonalData, parsePersonalBackup, PERSONAL_KEYS, preparePersonalImport } from '../src/utils/personal-backup'
import { clearPersonalPending, readPersonalRaw, writePersonalRaw } from '../src/utils/personal-storage'
import { CONTEXT_STORAGE_KEY, emptyContext } from '../src/tools/packages/ai-context/context'
import { CONTEXT_TASKS_KEY, emptyContextStore, validateContextStore } from '../src/tools/packages/ai-context/store'
import { fillPrompt, promptVariables } from '../src/utils/prompt-template'

const backup = entries => ({ kind: 'devos-personal-data', version: 1, exportedAt: '2026-09-05', entries })
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); PERSONAL_KEYS.forEach(clearPersonalPending) })

describe('备份兼容', () => {
  const twoTasks = () => {
    const current = emptyContextStore({ ...emptyContext(), project: '本机任务一' })
    current.tasks.push(emptyContextStore({ ...emptyContext(), project: '本机任务二' }).tasks[0])
    return current
  }
  const legacyBackup = () => backup({ [CONTEXT_STORAGE_KEY]: JSON.stringify({ ...emptyContext(), project: '恢复的旧版草稿' }) })

  it.each(['unavailableKeys', 'unreadableKeys'])('%s 缺失现代列表时禁止用一项旧草稿替换两项任务，合并保留三项', field => {
    const current = twoTasks()
    const original = JSON.stringify(current)
    localStorage.setItem(CONTEXT_TASKS_KEY, original)
    const partial = { ...legacyBackup(), [field]: [CONTEXT_TASKS_KEY] }
    expect(() => preparePersonalImport(partial, 'replace')).toThrow('只能合并恢复')
    expect(localStorage.getItem(CONTEXT_TASKS_KEY)).toBe(original)
    const parsed = parsePersonalBackup(JSON.stringify(partial))
    expect(parsed.unavailableKeys).toEqual([CONTEXT_TASKS_KEY])
    expect(parsed).not.toHaveProperty('unreadableKeys')
    applyPersonalImport(preparePersonalImport(parsed, 'merge'))
    const restored = JSON.parse(localStorage.getItem(CONTEXT_TASKS_KEY))
    expect(restored.activeId).toBe(current.activeId)
    expect(restored.tasks.map(task => task.draft.project)).toEqual(['本机任务一', '本机任务二', '恢复的旧版草稿'])
  })

  it('两个缺失清单同集合时归一，顺序不同允许，集合冲突拒绝', () => {
    const partial = {
      ...backup({ 'devos.workspace.note': '"便笺"' }),
      unavailableKeys: [CONTEXT_TASKS_KEY, 'favoriteTools'],
      unreadableKeys: ['favoriteTools', CONTEXT_TASKS_KEY],
    }
    const parsed = parsePersonalBackup(JSON.stringify(partial))
    expect(parsed.unavailableKeys).toEqual(partial.unavailableKeys)
    expect(parsed).not.toHaveProperty('unreadableKeys')
    for (const unreadableKeys of [[], ['favoriteTools'], ['theme']]) {
      expect(() => parsePersonalBackup(JSON.stringify({ ...partial, unreadableKeys }))).toThrow('缺失项目清单')
    }
    expect(parsePersonalBackup(JSON.stringify({ ...backup({}), unreadableKeys: [] }))).toEqual({ ...backup({}), unavailableKeys: [] })
  })

  it.each(['unavailableKeys', 'unreadableKeys'])('%s 严格拒绝非法类型、非白名单、重复及与内容重叠', field => {
    for (const value of [null, 'favoriteTools', {}, [42], [''], ['admin-secret'], ['favoriteTools', 'favoriteTools'], ['devos.workspace.note']]) {
      expect(() => parsePersonalBackup(JSON.stringify({ ...backup({ 'devos.workspace.note': '"便笺"' }), [field]: value }))).toThrow('缺失项目清单')
      const other = field === 'unavailableKeys' ? 'unreadableKeys' : 'unavailableKeys'
      expect(() => parsePersonalBackup(JSON.stringify({ ...backup({ 'devos.workspace.note': '"便笺"' }), [field]: value, [other]: ['favoriteTools'] }))).toThrow('缺失项目清单')
    }
  })

  it('无缺失元数据的 v1 旧草稿也不能替换已有现代列表，但可合并', () => {
    const current = twoTasks()
    localStorage.setItem(CONTEXT_TASKS_KEY, JSON.stringify(current))
    const legacy = legacyBackup()
    expect(parsePersonalBackup(JSON.stringify(legacy))).toEqual(legacy)
    expect(() => preparePersonalImport(legacy, 'replace')).toThrow('只能合并恢复')
    expect(localStorage.getItem(CONTEXT_TASKS_KEY)).toBe(JSON.stringify(current))
    applyPersonalImport(preparePersonalImport(legacy, 'merge'))
    expect(JSON.parse(localStorage.getItem(CONTEXT_TASKS_KEY)).tasks.map(task => task.draft.project)).toEqual(['本机任务一', '本机任务二', '恢复的旧版草稿'])
  })

  it('无现代列表且无缺失标记的 v1 旧草稿仍可首次迁移', () => {
    const plan = preparePersonalImport(legacyBackup(), 'replace')
    expect(Object.keys(plan.entries)).toEqual([CONTEXT_TASKS_KEY])
    applyPersonalImport(plan)
    expect(JSON.parse(localStorage.getItem(CONTEXT_TASKS_KEY)).tasks.map(task => task.draft.project)).toEqual(['恢复的旧版草稿'])
  })

  it.each(['unavailableKeys', 'unreadableKeys'])('%s 标明现代列表缺失时，即使目标为空也必须合并恢复', field => {
    const partial = { ...legacyBackup(), [field]: [CONTEXT_TASKS_KEY] }
    expect(() => preparePersonalImport(partial, 'replace')).toThrow('只能合并恢复')
    expect(localStorage.getItem(CONTEXT_TASKS_KEY)).toBeNull()
    applyPersonalImport(preparePersonalImport(partial, 'merge'))
    expect(JSON.parse(localStorage.getItem(CONTEXT_TASKS_KEY)).tasks.map(task => task.draft.project)).toEqual(['恢复的旧版草稿'])
  })

  it('完整现代列表仍按明确的替换模式恢复，不受其他缺失项目影响', () => {
    localStorage.setItem(CONTEXT_TASKS_KEY, JSON.stringify(twoTasks()))
    localStorage.setItem('favoriteTools', '["json"]')
    const incoming = emptyContextStore({ ...emptyContext(), project: '明确替换的新列表' })
    const completeTasks = { ...backup({ [CONTEXT_TASKS_KEY]: JSON.stringify(incoming) }), unavailableKeys: ['favoriteTools'] }
    applyPersonalImport(preparePersonalImport(completeTasks, 'replace'))
    expect(JSON.parse(localStorage.getItem(CONTEXT_TASKS_KEY))).toEqual(incoming)
    expect(localStorage.getItem('favoriteTools')).toBe('["json"]')
  })

  it('pending 预览后底层任务变化时拒绝所有写入，并保留会话草稿与别页内容', () => {
    for (const key of [CONTEXT_TASKS_KEY, CONTEXT_STORAGE_KEY]) {
      localStorage.clear()
      PERSONAL_KEYS.forEach(clearPersonalPending)
      const rawTask = project => JSON.stringify(key === CONTEXT_TASKS_KEY ? emptyContextStore({ ...emptyContext(), project }) : { ...emptyContext(), project })
      localStorage.setItem(key, rawTask('预览前已保存任务'))
      localStorage.setItem('favoriteTools', '["base64"]')
      const prototype = Object.getPrototypeOf(localStorage)
      const blockedWrite = vi.spyOn(prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
      const pending = rawTask('本页待保存任务 A')
      expect(() => writePersonalRaw(key, pending)).toThrow('quota')
      blockedWrite.mockRestore()
      const plan = preparePersonalImport({ ...legacyBackup(), entries: { favoriteTools: '["json"]', ...legacyBackup().entries } }, 'merge')
      const external = rawTask('别页新增任务 B')
      localStorage.setItem(key, external)
      const writes = vi.spyOn(prototype, 'setItem')
      expect(() => applyPersonalImport(plan)).toThrow('预览后')
      expect(writes).not.toHaveBeenCalled()
      expect(readPersonalRaw(key)).toBe(pending)
      expect(localStorage.getItem(key)).toBe(external)
      expect(localStorage.getItem('favoriteTools')).toBe('["base64"]')
      if (key === CONTEXT_STORAGE_KEY) expect(localStorage.getItem(CONTEXT_TASKS_KEY)).toBeNull()
      writes.mockRestore()
    }
  })

  it('抢救 pending 便笺后可恢复并重新导出，缺失收藏不被清空且正常导出无缺失标记', () => {
    const prototype = Object.getPrototypeOf(localStorage)
    vi.spyOn(prototype, 'getItem').mockImplementation(() => { throw new Error('read denied') })
    vi.spyOn(prototype, 'setItem').mockImplementation(() => { throw new Error('write denied') })
    expect(() => writePersonalRaw('devos.workspace.note', '"待抢救的便笺"')).toThrow()
    const rescue = exportPersonalData()
    expect(rescue.entries).toEqual({ 'devos.workspace.note': '"待抢救的便笺"' })
    expect(rescue.unavailableKeys).toEqual(PERSONAL_KEYS.filter(key => key !== 'devos.workspace.note'))
    expect(rescue).not.toHaveProperty('unreadableKeys')
    vi.restoreAllMocks()
    clearPersonalPending('devos.workspace.note')
    localStorage.setItem('favoriteTools', '["base64"]')
    applyPersonalImport(preparePersonalImport(parsePersonalBackup(JSON.stringify(rescue)), 'replace'))
    const complete = exportPersonalData()
    expect(complete.entries).toEqual({ 'devos.workspace.note': '"待抢救的便笺"', favoriteTools: '["base64"]' })
    expect(complete).not.toHaveProperty('unavailableKeys')
    expect(complete).not.toHaveProperty('unreadableKeys')
  })
})

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

  it('存储读取被拒绝时仍导出当前会话内容，并明确标记缺失项', () => {
    const prototype = Object.getPrototypeOf(localStorage)
    vi.spyOn(prototype, 'setItem').mockImplementation(() => { throw new Error('storage denied') })
    expect(() => writePersonalRaw('devos.workspace.note', JSON.stringify('必须抢救的便笺'))).toThrow()
    vi.spyOn(prototype, 'getItem').mockImplementation(() => { throw new Error('storage denied') })
    const exported = exportPersonalData()
    expect(exported.entries).toEqual({ 'devos.workspace.note': '"必须抢救的便笺"' })
    expect(exported.unavailableKeys).toEqual(PERSONAL_KEYS.filter(key => key !== 'devos.workspace.note'))
    expect(parsePersonalBackup(JSON.stringify(exported))).toEqual(exported)
  })

  it('单项不可读时保留其他数据，恢复访问后继续导出完整备份', () => {
    localStorage.setItem('favoriteTools', '["json"]')
    localStorage.setItem('devos.workspace.note', '"已保存便笺"')
    const prototype = Object.getPrototypeOf(localStorage), getItem = prototype.getItem
    const read = vi.spyOn(prototype, 'getItem').mockImplementation(function (key) {
      if (key === 'favoriteTools') throw new Error('storage denied')
      return getItem.call(this, key)
    })
    expect(exportPersonalData().entries).toEqual({ 'devos.workspace.note': '"已保存便笺"' })
    expect(exportPersonalData().unavailableKeys).toEqual(['favoriteTools'])
    read.mockRestore()
    const complete = exportPersonalData()
    expect(complete.entries).toEqual({ favoriteTools: '["json"]', 'devos.workspace.note': '"已保存便笺"' })
    expect(complete).not.toHaveProperty('unavailableKeys')
  })

  it('无可读取内容时不生成空的成功备份', () => {
    vi.spyOn(Object.getPrototypeOf(localStorage), 'getItem').mockImplementation(() => { throw new Error('storage denied') })
    expect(() => exportPersonalData()).toThrow('没有可导出')
  })

  it('校验恢复备份缺失清单，替换时不删除缺失项或当前的其他内容', () => {
    const partial = { ...backup({ 'devos.workspace.note': '"恢复便笺"' }), unavailableKeys: ['favoriteTools'] }
    localStorage.setItem('favoriteTools', '["base64"]')
    localStorage.setItem('theme', 'light')
    const plan = preparePersonalImport(parsePersonalBackup(JSON.stringify(partial)), 'replace')
    expect(Object.keys(plan.entries)).toEqual(['devos.workspace.note'])
    applyPersonalImport(plan)
    expect(localStorage.getItem('devos.workspace.note')).toBe('"恢复便笺"')
    expect(localStorage.getItem('favoriteTools')).toBe('["base64"]')
    expect(localStorage.getItem('theme')).toBe('light')
    for (const unavailableKeys of [null, 'favoriteTools', ['admin-secret'], ['favoriteTools', 'favoriteTools'], ['devos.workspace.note'], [42]]) {
      expect(() => parsePersonalBackup(JSON.stringify({ ...partial, unavailableKeys }))).toThrow('缺失项目清单')
    }
  })

  it('已有 AI 任务列表时不读取或标记已被取代的旧版草稿', () => {
    localStorage.setItem(CONTEXT_TASKS_KEY, JSON.stringify(emptyContextStore()))
    const prototype = Object.getPrototypeOf(localStorage), getItem = prototype.getItem
    vi.spyOn(prototype, 'getItem').mockImplementation(function (key) {
      if (key === CONTEXT_STORAGE_KEY) throw new Error('legacy storage denied')
      return getItem.call(this, key)
    })
    const exported = exportPersonalData()
    expect(exported.entries[CONTEXT_TASKS_KEY]).toBeDefined()
    expect(exported.entries[CONTEXT_STORAGE_KEY]).toBeUndefined()
    expect(exported).not.toHaveProperty('unavailableKeys')
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
