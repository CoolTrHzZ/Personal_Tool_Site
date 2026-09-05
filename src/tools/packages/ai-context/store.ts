import { contextBytes, emptyContext, validateContext, type ContextDraft } from './context'

export const CONTEXT_TASKS_KEY = 'devos.ai-context.tasks.v1'
export const MAX_CONTEXT_TASKS = 20
export const MAX_TASK_STORE_BYTES = 3 * 1024 * 1024
export type ContextTask = { id: string; name: string; updated: string; draft: ContextDraft }
export type ContextStore = { version: 1; activeId: string; tasks: ContextTask[] }

export function newContextTask(draft = emptyContext(), name = draft.project || '未命名任务'): ContextTask {
  return { id: crypto.randomUUID(), name, updated: new Date().toISOString(), draft }
}

export function emptyContextStore(draft = emptyContext()): ContextStore {
  const task = newContextTask(draft)
  return { version: 1, activeId: task.id, tasks: [task] }
}

export function validateContextStore(value: unknown): ContextStore {
  if (!value || typeof value !== 'object') throw new Error('AI 任务列表格式无效')
  const store = value as ContextStore
  if (store.version !== 1 || !Array.isArray(store.tasks) || !store.tasks.length || store.tasks.length > MAX_CONTEXT_TASKS) throw new Error(`AI 任务列表需保留 1–${MAX_CONTEXT_TASKS} 个任务`)
  const ids = new Set<string>()
  let bytes = 0
  const tasks = store.tasks.map(task => {
    if (!task || typeof task.id !== 'string' || !/^[\w-]{1,80}$/.test(task.id) || ids.has(task.id) || typeof task.name !== 'string' || !task.name.trim() || task.name.length > 120 || typeof task.updated !== 'string' || !Number.isFinite(Date.parse(task.updated))) throw new Error('AI 任务名称、标识或日期无效')
    ids.add(task.id)
    const draft = validateContext(task.draft)
    bytes += contextBytes(draft)
    return { id: task.id, name: task.name, updated: task.updated, draft }
  })
  if (!ids.has(store.activeId)) throw new Error('当前 AI 任务不存在')
  if (bytes > MAX_TASK_STORE_BYTES) throw new Error('AI 任务总材料超过 3 MiB，请先导出并删除暂时不用的任务')
  return { version: 1, activeId: store.activeId, tasks }
}

export function parseContextStore(raw: string): ContextStore {
  if (raw.length > MAX_TASK_STORE_BYTES * 8) throw new Error('AI 任务列表过大')
  return validateContextStore(JSON.parse(raw))
}

