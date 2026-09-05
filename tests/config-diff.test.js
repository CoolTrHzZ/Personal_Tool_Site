import { describe, expect, it } from 'vitest'
import { checkedLines, createDiffReport, diffLines, inspectConfig, MAX_BYTES, MAX_LINES } from '../src/tools/packages/config-diff/diff.ts'

describe('configuration comparison', () => {
  it('aligns an insertion and deletion without marking subsequent lines changed', () => {
    const lines = diffLines('first\nold\nlast', 'first\nnew\ninserted\nlast')
    expect(lines).toEqual([
      { type: 'equal', text: 'first', before: 1, after: 1 },
      { type: 'remove', text: 'old', before: 2 },
      { type: 'add', text: 'new', after: 2 },
      { type: 'add', text: 'inserted', after: 3 },
      { type: 'equal', text: 'last', before: 3, after: 4 },
    ])
  })

  it('reconstructs both inputs with repeated lines and does not invent an empty-file line', () => {
    const before = 'a\nb\na\nb\n', after = 'a\na\nb\nc\n'
    const lines = diffLines(before, after)
    expect(lines.filter(line => line.type !== 'add').map(line => line.text).join('\n')).toBe(before)
    expect(lines.filter(line => line.type !== 'remove').map(line => line.text).join('\n')).toBe(after)
    expect(diffLines('', '')).toEqual([])
    expect(diffLines('', 'hello')).toEqual([{ type: 'add', text: 'hello', after: 1 }])
    expect(diffLines('hello', '')).toEqual([{ type: 'remove', text: 'hello', before: 1 }])
  })

  it('normalizes line endings, preserves the final newline, and optionally ignores trailing spaces only', () => {
    expect(diffLines('a\r\nb\r\n', 'a\nb\n').every(line => line.type === 'equal')).toBe(true)
    expect(diffLines('a', 'a\n').at(-1)).toMatchObject({ type: 'add', text: '', after: 2 })
    expect(diffLines('a \t', 'a', true)).toEqual([{ type: 'equal', text: 'a', before: 1, after: 1 }])
    expect(diffLines(' a', 'a', true).map(line => line.type)).toEqual(['remove', 'add'])
    expect(diffLines('a ', 'a').map(line => line.type)).toEqual(['remove', 'add'])
  })

  it('enforces bytes and line limits before allocating the diff table', () => {
    expect(checkedLines('x'.repeat(MAX_BYTES))).toHaveLength(1)
    expect(() => diffLines('中'.repeat(Math.ceil(MAX_BYTES / 3)), '')).toThrow('256 KiB')
    expect(checkedLines(Array(MAX_LINES).fill('x').join('\n'))).toHaveLength(MAX_LINES)
    expect(() => diffLines('', '\n'.repeat(MAX_LINES))).toThrow('2000 行')
  })

  it('validates strict JSON and finds nested or escaped duplicate keys without false positives across objects', () => {
    expect(inspectConfig('{"outer":{"x":1,"\\u0078":2}}', 'json')).toEqual([expect.objectContaining({ level: 'error', line: 1, message: expect.stringContaining('重复键') })])
    expect(inspectConfig('{"a":{"x":1},"b":{"x":2},"url":"https://example.com"}', 'json')).toEqual([])
    expect(inspectConfig('{"x":1,}', 'json')[0].level).toBe('error')
    expect(inspectConfig('plain: yaml', 'json')[0].level).toBe('error')
    expect(inspectConfig('', 'json')[0].level).toBe('error')
  })

  it('checks multiple YAML documents, duplicate keys and malformed structure without expanding aliases', () => {
    expect(inspectConfig('name: one\n---\nname: two\n', 'yaml')).toEqual([])
    expect(inspectConfig('name: one\nname: two', 'yaml')).toEqual([expect.objectContaining({ level: 'error', line: 2, message: expect.stringContaining('重复键') })])
    expect(inspectConfig('list: [one, two', 'yaml').some(issue => issue.level === 'error')).toBe(true)
    expect(inspectConfig('base: &base [one, two]\nrefs: [*base, *base]', 'yaml')).toEqual([])
    expect(inspectConfig('value: !custom thing', 'yaml').some(issue => issue.level === 'warning')).toBe(true)
  })

  it('detects repeated .env keys but skips assignments inside a quoted multiline value', () => {
    const issues = inspectConfig('# example\nexport PORT=8080\nTEXT="line one\nPORT=inside text\nline three"\nPORT=9090\ninvalid line', 'env')
    expect(issues).toEqual([
      expect.objectContaining({ level: 'warning', line: 6, message: expect.stringContaining('重复键 PORT') }),
      expect.objectContaining({ level: 'warning', line: 7, message: expect.stringContaining('KEY=value') }),
    ])
    expect(inspectConfig('TEXT="unclosed', 'env')).toEqual([expect.objectContaining({ line: 1, message: expect.stringContaining('引号未闭合') })])
    expect(inspectConfig('NAME=value\nPORT=8080', 'env')).toEqual([])
  })

  it('reuses CFG diagnostics while leaving unknown commands untouched', () => {
    expect(inspectConfig('custom_plugin_command "keep this"', 'cfg')).toEqual([])
    expect(inspectConfig('bind "w" "+forward', 'cfg')).toEqual([expect.objectContaining({ line: 1, level: 'error', message: expect.stringContaining('双引号未闭合') })])
  })

  it('exports changed lines, diagnostics and safe Markdown code fences with original line numbers', () => {
    const lines = diffLines('same\nold', 'same\n```\nnew')
    const report = createDiffReport(lines, 'text', false, [], [{ line: 2, level: 'warning', message: 'check\nthis' }])
    expect(report).toContain('新增 2 行 / 删除 1 行 / 未变 1 行')
    expect(report).toContain('````diff\n- [2 → -] old\n+ [- → 2] ```\n+ [- → 3] new\n````')
    expect(report).toContain('第 2 行：check this')
    expect(report).not.toContain('] same')
    expect(createDiffReport([], 'text', true, [], [])).toContain('没有检测到变更。')
  })
})
