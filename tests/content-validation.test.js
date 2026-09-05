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
  it('provides deployment, diagnosis and rollback templates with validation sections', () => {
    expect(runbookTemplates.deploy).toContain('## 验证结果')
    expect(runbookTemplates.incident).toContain('## 恢复验证')
    expect(runbookTemplates.rollback).toContain('## 回滚验证')
  })
})
