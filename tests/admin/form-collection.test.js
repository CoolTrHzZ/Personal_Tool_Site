import { expect, it } from 'vitest'
import { confirmedFields } from '../../shared/form-collection.js'

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
