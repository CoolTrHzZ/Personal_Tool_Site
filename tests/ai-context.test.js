import { describe, expect, it } from 'vitest'
import { buildContextMarkdown, contextBytes, emptyContext, MAX_CONTEXT_BYTES, MAX_FILE_BYTES, MAX_MATERIALS, parseContext, validateContext } from '../src/tools/packages/ai-context/context'

const material = (content, id = 'source') => ({ id, name: '源码.ts', content })

describe('AI 任务上下文包', () => {
  it('导出保留材料原文，材料里的围栏不会提前结束 Markdown 代码块', () => {
    const content = '\uFEFF// Unicode 中文\r\nconst sample = "````";\r\n'
    const draft = { ...emptyContext(), project: '工作站', goal: '修复转换错误\n保留兼容性', materials: [material(content)] }
    const markdown = buildContextMarkdown(draft)
    expect(markdown).toContain('# 工作站\n\n## 任务目标\n\n修复转换错误\n保留兼容性')
    expect(markdown).toContain(`\n\n\`\`\`\`\`\n${content}\`\`\`\`\`\n`)
    expect(parseContext(JSON.stringify(draft))).toEqual(draft)
  })

  it('检查版本、字段、材料标识，并且不把未知字段带入恢复的草稿', () => {
    expect(parseContext(`\uFEFF${JSON.stringify({ ...emptyContext(), unknown: '<script>' })}`)).toEqual(emptyContext())
    expect(() => parseContext('{broken')).toThrow('JSON')
    expect(() => validateContext({ ...emptyContext(), version: 2 })).toThrow('格式')
    expect(() => validateContext({ ...emptyContext(), goal: 42 })).toThrow('任务目标')
    expect(() => validateContext({ ...emptyContext(), materials: [material('one'), material('two')] })).toThrow('标识')
    expect(() => validateContext({ ...emptyContext(), materials: [material('binary\0text')] })).toThrow('文本')
    expect(() => validateContext({ ...emptyContext(), materials: [{ ...material('a'), name: 'line\nbreak' }] })).toThrow('文本')
  })

  it('按 UTF-8 字节限制单份和总量，限制材料数量', () => {
    const valid = { ...emptyContext(), materials: [material('中'.repeat(Math.floor(MAX_FILE_BYTES / 3)))] }
    expect(validateContext(valid)).toEqual(valid)
    expect(contextBytes(valid)).toBeGreaterThan(MAX_FILE_BYTES - 3)
    expect(() => validateContext({ ...emptyContext(), materials: [material('中'.repeat(Math.ceil(MAX_FILE_BYTES / 3)))] })).toThrow('256 KiB')
    expect(() => validateContext({ ...emptyContext(), materials: Array.from({ length: MAX_CONTEXT_BYTES / MAX_FILE_BYTES }, (_, index) => material('x'.repeat(MAX_FILE_BYTES), `file-${index}`)) })).toThrow('1 MiB')
    expect(() => validateContext({ ...emptyContext(), materials: Array.from({ length: MAX_MATERIALS + 1 }, (_, index) => material('', `file-${index}`)) })).toThrow(`最多添加 ${MAX_MATERIALS}`)
  })
})
