import { expect, it } from 'vitest'
import { confirmedFields, normalizeFields, blankSuggestions, applyBlankSuggestions } from '../../shared/form-collection.js'

it('extracts the exact production QA paste without including the category in its description', () => {
  const source = '网站名称：QA 合成采集 20261003\nURL：https://example.invalid/devos-qa\n描述：只用于本轮界面验收的合成内容，不访问任何网址。\n分类：development\n标签：qa-synthetic'
  expect(confirmedFields('navigation', source)).toEqual({
    fields: { name: 'QA 合成采集 20261003', url: 'https://example.invalid/devos-qa', description: '只用于本轮界面验收的合成内容，不访问任何网址。', tags: ['qa-synthetic'] },
    warnings: [],
  })
})

it('preserves multiline text and colon-bearing content but stops at labeled fields unavailable to the target', () => {
  expect(confirmedFields('navigation', '描述：第一行\n说明: 保留原文\n第二行\n分类：development\n分类补充\n标签：work').fields).toEqual({ description: '第一行\n说明: 保留原文\n第二行', tags: ['work'] })
  expect(confirmedFields('navigation', '描述：简介\n类型：app\n标签：work').fields).toEqual({ description: '简介', tags: ['work'] })
  expect(confirmedFields('ai-resources', '安装：安装步骤\nHOST: localhost:8080\nconstructor: keep\n内容：setting: value\n下一行\nCategory: development\n标签：work').fields).toEqual({ install: '安装步骤\nHOST: localhost:8080\nconstructor: keep', content: 'setting: value\n下一行', tags: ['work'] })
})

it('treats the website-name alias as the same field when duplicate names conflict', () => {
  expect(confirmedFields('navigation', '网站名称：第一个名称\nname: second name')).toEqual({ fields: {}, warnings: ['name 出现多次，保留手动填写。'] })
})

it('normalizes only known AI resource type casing while preserving default and manually edited fields', () => {
  for (const [label, kind] of [['Skill', 'skill'], ['AGENT', 'agent'], ['Prompt', 'prompt'], ['MoDeL', 'model'], ['APP', 'app']]) {
    expect(confirmedFields('ai-resources', `类型：${label}`)).toEqual({ fields: { kind }, warnings: [] })
    expect(normalizeFields('ai-resources', { kind: label })).toEqual({ kind })
  }
  for (const kind of ['Tool', 'Prompts', 'prompt-v2']) {
    expect(() => normalizeFields('ai-resources', { kind })).toThrow('资源类型建议无效')
    expect(confirmedFields('ai-resources', `类型：${kind}`)).toEqual({ fields: {}, warnings: ['kind 格式无效，未应用。'] })
  }
  const { fields, warnings } = confirmedFields('ai-resources', '名称：建议名称\n类型：Prompt\n内容：合成提示词')
  expect(warnings).toEqual([])
  const current = { kind: 'app', name: '手写名称', content: '' }
  const snapshot = { ...current }
  expect(blankSuggestions('ai-resources', fields, current)).toEqual({ content: '合成提示词' })
  expect(applyBlankSuggestions('ai-resources', fields, current, snapshot)).toEqual({ content: '合成提示词' })
  expect(applyBlankSuggestions('ai-resources', fields, { ...current, kind: '' }, { ...snapshot, kind: '' })).toEqual({ kind: 'prompt', content: '合成提示词' })
  expect(applyBlankSuggestions('ai-resources', fields, { ...current, kind: '' }, snapshot)).toEqual({ content: '合成提示词' })
  expect(applyBlankSuggestions('ai-resources', fields, current, snapshot, { content: 1 }, { content: 0 })).toEqual({})
  expect(current).toEqual({ kind: 'app', name: '手写名称', content: '' })
})
