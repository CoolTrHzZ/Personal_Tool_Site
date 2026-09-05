import { LineCounter, parseAllDocuments, parseDocument } from 'yaml'
import { analyzeCfg } from '../cs2-cfg/cfg'

export type ConfigFormat = 'json' | 'yaml' | 'env' | 'cfg' | 'text'
export type DiffLine = { type: 'equal' | 'add' | 'remove'; text: string; before?: number; after?: number }
export type ConfigIssue = { level: 'error' | 'warning' | 'info'; message: string; line?: number }
export const MAX_BYTES = 256 * 1024
export const MAX_LINES = 2000
export const FORMAT_LABELS: Record<ConfigFormat, string> = { json: 'JSON', yaml: 'YAML', env: '.env', cfg: 'CFG', text: '纯文本' }
export const FORMAT_NOTES: Record<ConfigFormat, string> = {
  json: '检查 JSON 语法与重复键；比较原文，不重排字段。',
  yaml: '检查 YAML 语法与重复键；默认 YAML 1.2，不展开别名，不校验应用配置规则。',
  env: '基础检查 KEY=value 与重复键，支持引号内多行值；不执行 shell 或展开变量。',
  cfg: '检查 CFG 引号、绑定与重复设置等基础问题；不执行命令，也不验证游戏中的实际效果。',
  text: '仅比较原文，不执行内容或进行格式校验。',
}

function linesOf(text: string) { return text ? text.replace(/\r\n?/g, '\n').split('\n') : [] }

export function checkedLines(text: string): string[] {
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('单侧内容不能超过 256 KiB，请缩小文件后重试。')
  const lines = linesOf(text)
  if (lines.length > MAX_LINES) throw new Error('单侧内容不能超过 2000 行，请选择需要比较的片段。')
  return lines
}

export function diffLines(before: string, after: string, ignoreTrailingSpace = false): DiffLine[] {
  const left = checkedLines(before), right = checkedLines(after)
  const normalize = (line: string) => ignoreTrailingSpace ? line.replace(/[\t ]+$/g, '') : line
  const a = left.map(normalize), b = right.map(normalize)
  const width = b.length + 1
  // ponytail: bounded LCS uses at most ~8 MB at 2000 lines; use a worker/Myers if larger files become necessary.
  const table = new Uint16Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] = a[i] === b[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
    }
  }
  const result: DiffLine[] = []
  let i = 0, j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      result.push({ type: 'equal', text: right[j], before: ++i, after: ++j })
    } else if (i < a.length && (j === b.length || table[(i + 1) * width + j] >= table[i * width + j + 1])) {
      result.push({ type: 'remove', text: left[i], before: ++i })
    } else {
      result.push({ type: 'add', text: right[j], after: ++j })
    }
  }
  return result
}

function inspectEnv(text: string): ConfigIssue[] {
  const issues: ConfigIssue[] = []
  const keys = new Map<string, number>()
  let quote = '', quoteLine = 0
  const scanQuote = (value: string) => {
    for (let i = 0; i < value.length; i++) {
      if (value[i] === '\\' && quote !== "'") { i++; continue }
      if (value[i] === quote) { quote = ''; break }
    }
  }
  linesOf(text).forEach((line, index) => {
    if (quote) { scanQuote(line); return }
    if (/^\s*(?:#|$)/.test(line)) return
    const assignment = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line)
    if (!assignment) { issues.push({ level: 'warning', line: index + 1, message: '未识别为 KEY=value，请确认是否属于所用 .env 格式。' }); return }
    const [, key, value] = assignment
    const previous = keys.get(key)
    if (previous !== undefined) issues.push({ level: 'warning', line: index + 1, message: `重复键 ${key}（首次出现在第 ${previous} 行），实际覆盖行为取决于加载器。` })
    else keys.set(key, index + 1)
    const trimmed = value.trimStart()
    if (['"', "'", '`'].includes(trimmed[0])) { quote = trimmed[0]; quoteLine = index + 1; scanQuote(trimmed.slice(1)) }
  })
  if (quote) issues.push({ level: 'warning', line: quoteLine, message: '引号未闭合，请检查多行值。' })
  return issues
}

export function inspectConfig(text: string, format: ConfigFormat): ConfigIssue[] {
  checkedLines(text)
  if (format === 'text') return []
  if (format === 'env') return inspectEnv(text)
  if (format === 'cfg') return analyzeCfg(text).diagnostics
  try {
    if (format === 'json') JSON.parse(text)
    const lineCounter = new LineCounter()
    const options = { lineCounter, prettyErrors: false, uniqueKeys: true }
    const documents = format === 'json' ? [parseDocument(text, { ...options, schema: 'json' })] : parseAllDocuments(text, options)
    return documents.flatMap(document => [
      ...document.errors.filter(error => format !== 'json' || error.code === 'DUPLICATE_KEY').map(error => ({ level: 'error' as const, line: lineCounter.linePos(error.pos[0]).line, message: error.code === 'DUPLICATE_KEY' ? '存在重复键，可能覆盖之前的值。' : error.message })),
      ...(format === 'yaml' ? document.warnings.map(warning => ({ level: 'warning' as const, line: lineCounter.linePos(warning.pos[0]).line, message: warning.message })) : []),
    ])
  } catch (error) {
    return [{ level: 'error', message: error instanceof Error ? error.message : '无法检查此内容，请检查格式。' }]
  }
}

export function createDiffReport(lines: DiffLine[], format: ConfigFormat, ignoreTrailingSpace: boolean, beforeIssues: ConfigIssue[], afterIssues: ConfigIssue[]): string {
  const added = lines.filter(line => line.type === 'add').length
  const removed = lines.filter(line => line.type === 'remove').length
  const unchanged = lines.length - added - removed
  const changes = lines.filter(line => line.type !== 'equal')
  const body = changes.map(line => `${line.type === 'add' ? '+' : '-'} [${line.before ?? '-'} → ${line.after ?? '-'}] ${line.text}`).join('\n')
  const longestFence = Array.from(body.matchAll(/`+/g)).reduce((longest, match) => Math.max(longest, match[0].length), 2)
  const fence = '`'.repeat(longestFence + 1)
  const diagnostics = ([['修改前', beforeIssues], ['修改后', afterIssues]] as const).map(([label, issues]) => `### ${label}\n\n${issues.length ? issues.map(issue => `- ${issue.level}${issue.line ? ` · 第 ${issue.line} 行` : ''}：${issue.message.replace(/[\r\n]+/g, ' ')}`).join('\n') : `未发现所选格式检查范围内的问题。${format === 'text' ? '纯文本未进行格式校验。' : ''}`}`).join('\n\n')
  return `# 配置变更报告\n\n- 格式：${FORMAT_LABELS[format]}\n- 新增 ${added} 行 / 删除 ${removed} 行 / 未变 ${unchanged} 行\n- 忽略行尾空格与制表符：${ignoreTrailingSpace ? '是' : '否'}\n- 换行符 CRLF / LF 统一比较；保留文件末尾换行差异。\n\n## 检查范围\n\n${FORMAT_NOTES[format]}\n\n${diagnostics}\n\n## 变更行\n\n${changes.length ? `行号为「修改前 → 修改后」。\n\n${fence}diff\n${body}\n${fence}` : '没有检测到变更。'}\n`
}
