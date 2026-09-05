export const CONTEXT_STORAGE_KEY = 'devos.ai-context.draft.v1'
export const MAX_FILE_BYTES = 256 * 1024
export const MAX_CONTEXT_BYTES = 1024 * 1024
export const MAX_MATERIALS = 20
export const contextFields = [
  { key: 'project', label: '项目名称', maxLength: 120, placeholder: '例如：个人工作站' },
  { key: 'stack', label: '技术栈', maxLength: 2000, placeholder: 'React、TypeScript、GitHub Pages…' },
  { key: 'background', label: '项目背景', maxLength: 20000, placeholder: '项目解决什么问题，目前进展如何？' },
  { key: 'goal', label: '任务目标', maxLength: 20000, placeholder: '本次希望 AI 完成什么？' },
  { key: 'constraints', label: '约束条件', maxLength: 20000, placeholder: '兼容性、依赖、部署环境，以及需要保留的行为…' },
  { key: 'acceptance', label: '验收标准', maxLength: 20000, placeholder: '怎样判断任务完成？列出关键场景与检查方法。' },
] as const

type ContextKey = typeof contextFields[number]['key']
export type Material = { id: string; name: string; content: string }
export type ContextDraft = Record<ContextKey, string> & { version: 1; materials: Material[] }
export const emptyContext = (): ContextDraft => ({ version: 1, project: '', stack: '', background: '', goal: '', constraints: '', acceptance: '', materials: [] })
const byteLength = (value: string) => new TextEncoder().encode(value).length
export const contextBytes = (draft: ContextDraft) => contextFields.reduce((total, field) => total + byteLength(draft[field.key]), 0) + draft.materials.reduce((total, item) => total + byteLength(item.name) + byteLength(item.content), 0)
export const hasContext = (draft: ContextDraft) => contextFields.some(field => draft[field.key].length > 0) || draft.materials.length > 0

export function validateContext(value: unknown): ContextDraft {
  if (!value || typeof value !== 'object') throw new Error('任务包格式无效')
  const draft = value as ContextDraft
  if (draft.version !== 1 || !Array.isArray(draft.materials)) throw new Error('不支持的任务包格式，请导入本工具导出的 JSON')
  for (const field of contextFields) {
    if (typeof draft[field.key] !== 'string' || draft[field.key].length > field.maxLength) throw new Error(`${field.label}格式无效或超出长度限制`)
  }
  if (draft.materials.length > MAX_MATERIALS) throw new Error(`最多添加 ${MAX_MATERIALS} 份材料`)
  const ids = new Set<string>()
  for (const item of draft.materials) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[\w-]{1,80}$/.test(item.id) || ids.has(item.id)) throw new Error('材料标识无效或重复')
    ids.add(item.id)
    if (typeof item.name !== 'string' || item.name.length > 256 || [...item.name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || typeof item.content !== 'string') throw new Error('材料必须是有效的文本内容')
    if (byteLength(item.content) > MAX_FILE_BYTES) throw new Error(`材料“${item.name || '未命名'}”超过 256 KiB`)
    if ([...item.content].some(char => char.charCodeAt(0) < 32 && ![9, 10, 13].includes(char.charCodeAt(0)))) throw new Error('材料必须是有效的文本内容')
  }
  if (contextBytes(draft) > MAX_CONTEXT_BYTES) throw new Error('任务内容总量不能超过 1 MiB，请减少材料')
  // Keep only our versioned fields when importing an untrusted JSON file.
  return { version: 1, project: draft.project, stack: draft.stack, background: draft.background, goal: draft.goal, constraints: draft.constraints, acceptance: draft.acceptance, materials: draft.materials.map(({ id, name, content }) => ({ id, name, content })) }
}

export function parseContext(raw: string): ContextDraft {
  // JSON escaping can expand a 1 MiB payload. Bound parsing before checking decoded content.
  if (raw.length > MAX_CONTEXT_BYTES * 8) throw new Error('任务包文件过大')
  let value: unknown
  try { value = JSON.parse(raw.replace(/^\uFEFF/, '')) } catch { throw new Error('任务包不是有效的 JSON') }
  return validateContext(value)
}

function fenced(content: string) {
  const runs = content.match(/`+/g) || []
  const fence = '`'.repeat(runs.reduce((longest, run) => Math.max(longest, run.length + 1), 3))
  return `${fence}\n${content}${content.endsWith('\n') ? '' : '\n'}${fence}`
}

export function buildContextMarkdown(draft: ContextDraft): string {
  const blocks = [`# ${draft.project.trim().replace(/[\r\n]/g, ' ') || 'AI 任务上下文包'}`]
  for (const field of contextFields.slice(1)) {
    if (draft[field.key].trim()) blocks.push(`## ${field.label}\n\n${draft[field.key]}`)
  }
  if (draft.materials.length) {
    blocks.push('## 参考材料\n\n以下为原始材料，请结合任务目标与约束理解。')
    for (const item of draft.materials) blocks.push(`### ${item.name.trim() || '未命名材料'}\n\n${fenced(item.content)}`)
  }
  return blocks.join('\n\n') + '\n'
}
