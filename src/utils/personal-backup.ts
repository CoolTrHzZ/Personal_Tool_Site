import { isTimer, isTodoList, isWorkspaceNote, type Todo } from '../components/workspace/storage'
import { CONTEXT_STORAGE_KEY, parseContext } from '../tools/packages/ai-context/context'
import { CONTEXT_TASKS_KEY, emptyContextStore, validateContextStore, type ContextStore } from '../tools/packages/ai-context/store'
import { CFG_STORAGE_KEY, isCfgStore, type CfgStore } from '../tools/packages/cs2-cfg/store'
import { clearPersonalPending, readPersonalRaw, rememberPersonalPending } from './personal-storage'

export const PERSONAL_KEYS = ['devos.workspace.todos', 'devos.workspace.note', 'devos.workspace.timer', 'favoriteTools', 'recentTools', 'searchHistory', CONTEXT_TASKS_KEY, CONTEXT_STORAGE_KEY, CFG_STORAGE_KEY, 'devos.projects.pinned', 'theme', 'devos-motion', 'devos-home-view'] as const
export const PERSONAL_LABELS: Record<string, string> = {
  'devos.workspace.todos': '待办', 'devos.workspace.note': '便笺', 'devos.workspace.timer': '专注计时', favoriteTools: '工具收藏', recentTools: '最近工具', searchHistory: '搜索历史', [CONTEXT_TASKS_KEY]: 'AI 任务列表', [CONTEXT_STORAGE_KEY]: '旧版 AI 草稿', [CFG_STORAGE_KEY]: '本机 CFG 草稿与版本', 'devos.projects.pinned': '常用项目', theme: '主题', 'devos-motion': '动效', 'devos-home-view': '首页视图',
}
export type PersonalBackup = { kind: 'devos-personal-data'; version: 1; exportedAt: string; entries: Record<string, string> }
export type PersonalImportPlan = { before: Record<string, string | null>; entries: Record<string, string>; mode: 'merge' | 'replace' }
const json = (raw: string) => JSON.parse(raw) as unknown
const idList = (value: unknown, max = 1000) => Array.isArray(value) && value.length <= max && value.every(item => typeof item === 'string' && item.trim() && item.length <= 10000) && new Set(value).size === value.length

function checkEntry(key: string, raw: string) {
  if (key === 'theme') { if (!['dark', 'light', 'system'].includes(raw)) throw new Error('主题无效'); return }
  if (key === 'devos-motion') { if (!['on', 'off'].includes(raw)) throw new Error('动效偏好无效'); return }
  if (key === 'devos-home-view') { if (!['public', 'personal'].includes(raw)) throw new Error('首页偏好无效'); return }
  if (key === CONTEXT_STORAGE_KEY) { parseContext(raw); return }
  const value = json(raw)
  let valid = true
  if (key === CONTEXT_TASKS_KEY) validateContextStore(value)
  else if (key === CFG_STORAGE_KEY) valid = isCfgStore(value)
  else if (key === 'devos.workspace.todos') valid = isTodoList(value)
  else if (key === 'devos.workspace.note') valid = isWorkspaceNote(value)
  else if (key === 'devos.workspace.timer') valid = isTimer(value)
  else valid = idList(value, ['recentTools', 'searchHistory'].includes(key) ? 8 : 1000)
  if (!valid) throw new Error(`${PERSONAL_LABELS[key]}数据格式无效或超过数量限制`)
}

export function describePersonalEntry(key: string, raw: string | null) {
  if (raw === null) return '无记录'
  try {
    if (['theme', 'devos-motion', 'devos-home-view'].includes(key)) return raw
    const value = json(raw)
    if (key === CONTEXT_TASKS_KEY) { const store = validateContextStore(value); return `${store.tasks.length} 个任务（${store.tasks.slice(0, 3).map(task => task.name).join('、')}${store.tasks.length > 3 ? '…' : ''}）` }
    if (key === CFG_STORAGE_KEY) { const store = value as CfgStore; return `${store.versions.length} 个版本，草稿 ${store.draft.name}` }
    if (typeof value === 'string') return `${value.length} 字符`
    if (Array.isArray(value)) return `${value.length} 项`
    return '1 份记录'
  } catch { return '原始记录格式异常' }
}

export function exportPersonalData(): PersonalBackup {
  const entries: Record<string, string> = {}
  for (const key of PERSONAL_KEYS) {
    const raw = readPersonalRaw(key)
    if (raw !== null) entries[key] = raw
  }
  if (entries[CONTEXT_TASKS_KEY]) delete entries[CONTEXT_STORAGE_KEY]
  return { kind: 'devos-personal-data', version: 1, exportedAt: new Date().toISOString(), entries }
}

export function parsePersonalBackup(raw: string): PersonalBackup {
  if (raw.length > 32 * 1024 * 1024) throw new Error('备份不能超过 32 MiB')
  const data = JSON.parse(raw.replace(/^\uFEFF/, '')) as PersonalBackup
  if (!data || data.kind !== 'devos-personal-data' || data.version !== 1 || !data.entries || typeof data.entries !== 'object' || Array.isArray(data.entries) || typeof data.exportedAt !== 'string') throw new Error('请选择本工作站导出的个人数据备份；公开站点备份不能在此导入')
  for (const [key, value] of Object.entries(data.entries)) {
    if (!(PERSONAL_KEYS as readonly string[]).includes(key) || typeof value !== 'string') throw new Error(`备份包含不支持的个人数据项：${key}`)
    checkEntry(key, value)
  }
  return data
}

function mergeTasks(current: ContextStore, incoming: ContextStore) {
  const tasks = [...current.tasks]
  for (const item of incoming.tasks) {
    const existing = tasks.find(task => task.id === item.id)
    if (!existing) tasks.push(item)
    else if (JSON.stringify(existing.draft) !== JSON.stringify(item.draft) || existing.name !== item.name) tasks.push({ ...item, id: crypto.randomUUID() })
  }
  return validateContextStore({ ...current, tasks })
}

function mergeCfg(current: CfgStore, incoming: CfgStore): CfgStore {
  const versions = [...current.versions]
  for (const item of incoming.versions) {
    const existing = versions.find(version => version.id === item.id)
    if (!existing) versions.push(item)
    else if (JSON.stringify(existing) !== JSON.stringify(item)) versions.push({ ...item, id: crypto.randomUUID() })
  }
  if (incoming.draft.content && JSON.stringify(incoming.draft) !== JSON.stringify(current.draft) && !versions.some(item => item.name === incoming.draft.name && item.content === incoming.draft.content)) versions.push({ ...incoming.draft, id: crypto.randomUUID(), savedAt: new Date().toISOString() })
  const next = { draft: current.draft, versions }
  if (!isCfgStore(next)) throw new Error('合并后的 CFG 版本超过 20 个，请先整理版本或选择替换；现有数据未修改')
  return next
}

function mergeValue(key: string, current: string, incoming: string) {
  if (current === incoming) return current
  if (key === CONTEXT_TASKS_KEY) return JSON.stringify(mergeTasks(validateContextStore(json(current)), validateContextStore(json(incoming))))
  if (key === CFG_STORAGE_KEY) return JSON.stringify(mergeCfg(json(current) as CfgStore, json(incoming) as CfgStore))
  if (key === 'devos.workspace.note') return JSON.stringify([json(current), json(incoming)].filter(Boolean).join('\n\n--- 导入便笺 ---\n\n'))
  if (key === 'devos.workspace.todos') {
    const items = json(current) as Todo[]
    for (const item of json(incoming) as Todo[]) {
      const existing = items.find(todo => todo.id === item.id)
      if (!existing) items.push(item)
      else if (existing.text !== item.text || existing.done !== item.done) items.push({ ...item, id: crypto.randomUUID() })
    }
    return JSON.stringify(items)
  }
  if (['favoriteTools', 'recentTools', 'searchHistory', 'devos.projects.pinned'].includes(key)) {
    const merged = [...new Set([...(json(current) as string[]), ...(json(incoming) as string[])])]
    return JSON.stringify(['recentTools', 'searchHistory'].includes(key) ? merged.slice(0, 8) : merged)
  }
  return current
}

export function preparePersonalImport(backup: PersonalBackup, mode: 'merge' | 'replace'): PersonalImportPlan {
  const incoming = { ...parsePersonalBackup(JSON.stringify(backup)).entries }
  if (incoming[CONTEXT_STORAGE_KEY] && !incoming[CONTEXT_TASKS_KEY]) incoming[CONTEXT_TASKS_KEY] = JSON.stringify(emptyContextStore(parseContext(incoming[CONTEXT_STORAGE_KEY])))
  delete incoming[CONTEXT_STORAGE_KEY]
  const before: Record<string, string | null> = {}
  const entries: Record<string, string> = {}
  for (const [key, raw] of Object.entries(incoming)) {
    let current = readPersonalRaw(key)
    before[key] = current
    if (mode === 'merge' && key === CONTEXT_TASKS_KEY && current === null) {
      const legacy = readPersonalRaw(CONTEXT_STORAGE_KEY)
      if (legacy !== null) { before[CONTEXT_STORAGE_KEY] = legacy; current = JSON.stringify(emptyContextStore(parseContext(legacy))) }
    }
    if (mode === 'merge' && current !== null) checkEntry(key, current)
    entries[key] = mode === 'merge' && current !== null ? mergeValue(key, current, raw) : raw
    checkEntry(key, entries[key])
  }
  return { before, entries, mode }
}

export function applyPersonalImport(plan: PersonalImportPlan) {
  const originals = new Map<string, string | null>()
  for (const [key, raw] of Object.entries(plan.before)) if (readPersonalRaw(key) !== raw) throw new Error('预览后个人数据又有修改，请重新生成导入预览')
  for (const key of Object.keys(plan.entries)) originals.set(key, localStorage.getItem(key))
  const written: string[] = []
  try {
    for (const [key, raw] of Object.entries(plan.entries)) { localStorage.setItem(key, raw); written.push(key) }
  } catch {
    let rollbackFailed = false
    for (const key of written.reverse()) {
      try { const original = originals.get(key); if (original == null) localStorage.removeItem(key); else localStorage.setItem(key, original) }
      catch { rollbackFailed = true }
    }
    if (rollbackFailed) for (const [key, raw] of Object.entries(plan.before)) rememberPersonalPending(key, raw)
    throw new Error(rollbackFailed ? '导入失败且部分存储无法恢复；原内容已保留在当前会话，请立即导出备份后再关闭页面' : '导入失败，已恢复原有数据；请检查浏览器存储空间后重试')
  }
  for (const key of Object.keys(plan.entries)) clearPersonalPending(key)
  window.dispatchEvent(new CustomEvent('devos:personal-data-restored'))
}
