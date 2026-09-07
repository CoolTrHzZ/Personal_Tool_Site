const slug = /^[a-z0-9][a-z0-9-]{0,79}$/
const text = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || Boolean(value.trim())) && ![...value].some(character => { const code = character.charCodeAt(0); return (code < 32 && ![9, 10, 13].includes(code)) || code === 127 })
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
const strings = (values, max = 30) => Array.isArray(values) && values.length <= max && values.every(value => text(value, 120, true) && value === value.trim()) && new Set(values).size === values.length
const tags = values => strings(values) && values.every(value => value.length <= 64 && !value.includes(','))
function records(items, label) {
  if (!Array.isArray(items) || items.length > 2000) throw new Error(`${label}必须是数组，最多 2000 项`)
  const ids = new Set()
  for (const item of items) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !slug.test(item.id) || ids.has(item.id)) throw new Error(`${label} ID 无效或重复`)
    ids.add(item.id)
  }
}
function common(item, label) {
  if (!text(item.name, 120, true) || !text(item.description, 4000) || !tags(item.tags) || typeof item.enabled !== 'boolean' || !Number.isSafeInteger(item.order) || !date(item.updated)) throw new Error(`${label}字段无效：${item.id}`)
}
function references(ids, available, label) {
  if (!strings(ids, 100)) throw new Error(`${label}关联列表无效`)
  if (available && ids.some(id => !available.some(item => item.id === id))) throw new Error(`${label}引用了不存在的条目`)
}
export function assertProjects(items, cfgs) {
  records(items, '项目')
  for (const item of items) {
    common(item, '项目')
    if (!['desktop', 'project', 'service'].includes(item.kind) || !['active', 'paused', 'archived'].includes(item.status) || !text(item.body, 200000)) throw new Error(`项目类型、状态或正文无效：${item.id}`)
    if (item.version !== undefined && !text(item.version, 40)) throw new Error('项目版本号无效（最多 40 字符）')
    if (item.platform !== undefined && !['windows-x64', 'windows-x86', 'windows-arm64'].includes(item.platform)) throw new Error('项目运行平台无效')
    if (item.download !== undefined) {
      const file = item.download
      if (item.kind !== 'desktop' || !item.platform || !file || typeof file !== 'object' || Array.isArray(file) || Object.keys(file).some(key => !['filename', 'size', 'sha256'].includes(key))) throw new Error('项目下载元数据无效')
      if (!text(file.filename, 120, true) || /[\\/:*?"<>|]/.test(file.filename) || [...file.filename].some(char => char.charCodeAt(0) < 32 || (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159)) || file.filename !== file.filename.trim() || file.filename.startsWith('.') || !/\.exe$/i.test(file.filename) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(file.filename)) throw new Error('项目文件名必须是安全的 .exe 名称，不能包含路径或特殊字符')
      if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > 20 * 1024 * 1024 || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('项目下载文件大小或 SHA-256 无效')
    }
    for (const key of ['repository', 'docs', 'url']) {
      if (!text(item[key], 2048)) throw new Error(`项目 ${key} 无效`)
      if (item[key]) {
        let url
        try { url = new URL(item[key]) } catch { throw new Error(`项目 ${key} 必须为 HTTP(S) 链接`) }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(`项目 ${key} 必须为不含凭据的 HTTP(S) 链接`)
      }
    }
    references(item.cfgIds, cfgs, '项目 CFG')
  }
}
export function assertNoteRelations(items, projects, cfgs) {
  if (!Array.isArray(items)) throw new Error('笔记必须是数组')
  for (const item of items) {
    if (!item || (item.kind !== undefined && !['note', 'deploy', 'incident', 'rollback'].includes(item.kind))) throw new Error('笔记类型无效')
    if (item.projectId !== undefined && (typeof item.projectId !== 'string' || (item.projectId && !slug.test(item.projectId)))) throw new Error('笔记项目 ID 无效')
    if (item.projectId && projects && !projects.some(project => project.id === item.projectId)) throw new Error(`笔记引用的项目不存在：${item.projectId}`)
    if (item.cfgIds !== undefined) references(item.cfgIds, cfgs, '笔记 CFG')
  }
}
export function assertAIWorkflows(items, resources) {
  records(items, 'AI 工作流')
  for (const item of items) {
    common(item, 'AI 工作流')
    if (!['code-review', 'requirements', 'incident'].includes(item.category) || !Array.isArray(item.steps) || !item.steps.length || item.steps.length > 20) throw new Error(`AI 工作流分类或步骤无效（需 1–20 步）：${item.id}`)
    for (const step of item.steps) {
      if (!step || !text(step.title, 120, true) || !text(step.description, 10000) || typeof step.resourceId !== 'string' || (step.resourceId && !slug.test(step.resourceId))) throw new Error('AI 工作流步骤字段无效')
      if (step.resourceId && resources && !resources.some(resource => resource.id === step.resourceId)) throw new Error(`AI 工作流引用的资源不存在：${step.resourceId}`)
    }
  }
}
