import { describe, expect, it } from 'vitest'
import { assertAIWorkflows, assertNoteRelations, assertProjects } from '../shared/content-validation.js'
import { runbookTemplates } from '../shared/runbook-templates.js'

const project = { id: 'server', name: '社区服务', kind: 'service', description: '', body: '', repository: '', docs: '', url: 'https://example.com', status: 'active', tags: ['CS2'], cfgIds: ['cfg-one'], enabled: true, order: 10, updated: '2026-09-05' }
const workflow = { id: 'review', name: '代码审查', category: 'code-review', description: '', tags: [], steps: [{ title: '检查变更', description: '', resourceId: 'review-prompt' }], enabled: true, order: 10, updated: '2026-09-05' }

describe('project, runbook and workflow content validation', () => {
  it('accepts linked content and legacy notes, rejects dangling references', () => {
    expect(() => assertProjects([project], [{ id: 'cfg-one' }])).not.toThrow()
    expect(() => assertProjects([project], [])).toThrow('不存在')
    expect(() => assertNoteRelations([{ id: 'legacy' }], [], [])).not.toThrow()
    const note = { kind: 'incident', projectId: 'server', cfgIds: ['cfg-one'] }
    expect(() => assertNoteRelations([note], [project], [{ id: 'cfg-one' }])).not.toThrow()
    expect(() => assertNoteRelations([note], [], [{ id: 'cfg-one' }])).toThrow('项目不存在')
    expect(() => assertNoteRelations([note], [project], [])).toThrow('不存在')
    expect(() => assertAIWorkflows([workflow], [{ id: 'review-prompt' }])).not.toThrow()
    expect(() => assertAIWorkflows([workflow], [])).toThrow('不存在')
  })
  it('rejects unsafe links, duplicate IDs, invalid dates, steps and relations', () => {
    for (const patch of [{ id: '../bad' }, { id: 123 }, { url: 'javascript:alert(1)' }, { url: 'https://user:password@example.com' }, { updated: '2026-02-31' }, { order: Infinity }, { tags: ['same', 'same'] }, { cfgIds: ['same', 'same'] }]) expect(() => assertProjects([{ ...project, ...patch }])).toThrow()
    expect(() => assertProjects([project, project])).toThrow('重复')
    for (const patch of [{ steps: [] }, { steps: [null] }, { category: 'unknown' }, { steps: [{ title: '', description: '', resourceId: '' }] }]) expect(() => assertAIWorkflows([{ ...workflow, ...patch }])).toThrow()
    expect(() => assertNoteRelations([{ kind: 'unknown' }])).toThrow()
  })
  it.each([['LF', '\n'], ['CR', '\r'], ['TAB', '\t']])('rejects %s in workflow step titles without changing the input', (_label, separator) => {
    const items = [{ ...workflow, steps: [{ title: `检查${separator}变更`, description: '', resourceId: '' }] }]
    const before = JSON.stringify(items)
    expect(() => assertAIWorkflows(items)).toThrow('AI 工作流步骤字段无效')
    expect(JSON.stringify(items)).toBe(before)
  })
  it('accepts Chinese step titles with ordinary spaces, 120-character titles and 20 steps while preserving multiline descriptions', () => {
    const description = '第一行\n第二行\r\n\t补充说明'
    for (const steps of [
      [{ title: '检查 代码 变更', description, resourceId: '' }],
      Array.from({ length: 20 }, () => ({ title: '中'.repeat(120), description, resourceId: '' })),
    ]) {
      const items = [{ ...workflow, description, steps }], before = JSON.stringify(items)
      expect(() => assertAIWorkflows(items)).not.toThrow()
      expect(JSON.stringify(items)).toBe(before)
    }
  })
  it('continues rejecting workflow titles longer than 120 characters and more than 20 steps', () => {
    const step = { title: '检查变更', description: '', resourceId: '' }
    expect(() => assertAIWorkflows([{ ...workflow, steps: [{ ...step, title: '中'.repeat(121) }] }])).toThrow('AI 工作流步骤字段无效')
    expect(() => assertAIWorkflows([{ ...workflow, steps: Array.from({ length: 21 }, () => ({ ...step })) }])).toThrow('需 1–20 步')
  })
  it('provides deployment, diagnosis and rollback templates with validation sections', () => {
    expect(runbookTemplates.deploy).toContain('## 验证结果')
    expect(runbookTemplates.incident).toContain('## 恢复验证')
    expect(runbookTemplates.rollback).toContain('## 回滚验证')
  })
  it('accepts desktop tool drafts and downloads while rejecting unsafe download metadata', () => {
    const desktop = { ...project, kind: 'desktop', version: '3.5 Flow', platform: 'windows-x64', download: { filename: '模型处理工具.exe', size: 1024, sha256: 'a'.repeat(64) } }
    expect(() => assertProjects([{ ...project, kind: 'desktop' }])).not.toThrow()
    expect(() => assertProjects([desktop])).not.toThrow()
    for (const patch of [{ kind: 'service' }, { version: 'a'.repeat(41) }, { platform: 'linux' }, { platform: undefined }, { download: null }]) expect(() => assertProjects([{ ...desktop, ...patch }])).toThrow()
    for (const filename of ['../app.exe', 'C:\\app.exe', 'aux.exe', '.app.exe', 'app.exe ', 'app\n.exe', 'app.exe:stream', 'app.zip']) expect(() => assertProjects([{ ...desktop, download: { ...desktop.download, filename } }])).toThrow()
    for (const patch of [{ path: 'other.exe' }, { size: -1 }, { size: 20 * 1024 * 1024 + 1 }, { size: 1.2 }, { sha256: 'not-a-hash' }]) expect(() => assertProjects([{ ...desktop, download: { ...desktop.download, ...patch } }])).toThrow()
  })
})
