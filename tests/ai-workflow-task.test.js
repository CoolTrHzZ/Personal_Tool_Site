import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'
import { assertAIWorkflows } from '../shared/content-validation.js'
import AiContextTool from '../src/tools/packages/ai-context'
import { CONTEXT_TASKS_KEY } from '../src/tools/packages/ai-context/store'
import { emptyContext } from '../src/tools/packages/ai-context/context'
import { clearPersonalPending, hasPersonalPending } from '../src/utils/personal-storage'

// Only content fixtures and browser sinks are synthetic. ReactDOM, the router,
// workflow creation, validators, serialization and pending-storage layer stay real.
const fixtures = vi.hoisted(() => ({ workflows: [], resources: [] }))
vi.mock('../src/data/ai-workflows.json', () => ({ default: fixtures.workflows }))
vi.mock('../src/data/ai-resources.json', () => ({ default: fixtures.resources }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, router, original, originalRaw, storageWrites, previousClipboard, guards
const task = (id, name, draft) => ({ id, name, draft, updated: '2026-10-01T00:00:00.000Z' })
const stored = () => JSON.parse(localStorage.getItem(CONTEXT_TASKS_KEY))
const byLabel = label => host.querySelector(`[aria-label="${label}"]`)
const alerts = () => [...host.querySelectorAll('[role="alert"]')].map(node => node.textContent)
const createButton = () => [...host.querySelectorAll('button')].find(node => node.textContent === '从工作流新建任务')
const blocked = action => vi.fn(() => { throw Error(`Unexpected ${action} in local workflow task test`) })

beforeEach(() => {
  fixtures.workflows.splice(0, fixtures.workflows.length, {
    id: 'synthetic-review', name: '合成工作流', description: '合成工作流目标\n保留多行 中文说明',
    category: 'code-review', tags: ['synthetic'], enabled: true, order: 10, updated: '2026-10-25',
    steps: [{ title: '准备 中文 上下文', description: '第一行：准备 中文上下文\n\t保留缩进\r\n最后一行', resourceId: 'synthetic-resource' }],
  })
  fixtures.resources.splice(0, fixtures.resources.length, {
    id: 'synthetic-resource', kind: 'skill', name: '合成关联资源', description: '合成资源说明',
    install: 'synthetic install text', content: 'synthetic resource body\r\n  原始 资源内容\n```',
    url: '', tags: [], enabled: true, order: 10, updated: '2026-10-25',
  })
  localStorage.clear()
  clearPersonalPending(CONTEXT_TASKS_KEY)
  original = {
    version: 1, activeId: 'original-task', tasks: [
      task('original-task', '原任务必须保留', {
        ...emptyContext(), project: '合成原项目', goal: '保留原任务目标',
        materials: [{ id: 'original-material', name: '原材料.txt', content: '\uFEFFsynthetic original material\r\n```\r\n' }],
      }),
      task('other-task', '另一任务必须保留', {
        ...emptyContext(), goal: '保留另一任务目标\n第二行',
        materials: [{ id: 'other-material', name: '另一材料.txt', content: '另一份原文\n  保留空格' }],
      }),
    ],
  }
  originalRaw = JSON.stringify(original)
  localStorage.setItem(CONTEXT_TASKS_KEY, originalRaw)
  storageWrites = vi.spyOn(window.Storage.prototype, 'setItem')
  guards = {
    fetch: blocked('network request'), xhr: blocked('XHR'), file: blocked('file read'),
    writeText: blocked('clipboard write'), readText: blocked('clipboard read'),
    anchor: blocked('anchor activation'), objectUrl: blocked('download'),
  }
  vi.stubGlobal('fetch', guards.fetch)
  vi.spyOn(window.XMLHttpRequest.prototype, 'open').mockImplementation(guards.xhr)
  vi.stubGlobal('Blob', NodeBlob)
  vi.stubGlobal('File', class extends NodeFile { arrayBuffer() { return guards.file() } })
  vi.spyOn(window.FileReader.prototype, 'readAsArrayBuffer').mockImplementation(guards.file)
  previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: guards.writeText, readText: guards.readText } })
  const NativeURL = URL
  vi.stubGlobal('URL', class extends NativeURL { static createObjectURL = guards.objectUrl; static revokeObjectURL = vi.fn() })
  vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(guards.anchor)
  router = undefined
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  router?.dispose()
  host.remove()
  try {
    for (const guard of Object.values(guards)) expect(guard).not.toHaveBeenCalled()
  } finally {
    if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard)
    else delete navigator.clipboard
    clearPersonalPending(CONTEXT_TASKS_KEY)
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})

function mount() {
  router = createMemoryRouter([
    { path: '/tools/ai-context', element: h(AiContextTool) },
    { path: '/tools', element: h('p', null, '合成工具目录') },
  ], { initialEntries: [{ pathname: '/tools/ai-context', search: '?workflow=synthetic-review&keep=opaque&tag=one&tag=two', state: { returnTo: '/tools?q=synthetic' } }] })
  act(() => root.render(h(RouterProvider, { router })))
  expect([...byLabel('工作流任务预览').querySelectorAll('li')].map(node => node.textContent)).toEqual(fixtures.workflows[0].steps.map(step => step.title))
  expect(createButton().disabled).toBe(false)
  expect(localStorage.getItem(CONTEXT_TASKS_KEY)).toBe(originalRaw)
  expect(storageWrites).not.toHaveBeenCalled()
  expect(byLabel('当前 AI 任务').value).toBe(original.activeId)
  expect(new URLSearchParams(router.state.location.search).get('workflow')).toBe('synthetic-review')
  expect(alerts()).toEqual([])
}

function expectCreated() {
  const result = stored()
  expect(result.tasks).toHaveLength(3)
  expect(result.tasks.slice(0, 2)).toEqual(original.tasks)
  const created = result.tasks.find(item => item.id === result.activeId)
  expect(original.tasks.map(item => item.id)).not.toContain(created.id)
  expect(created.name).toBe('合成工作流')
  expect(created.draft.project).toBe('合成工作流')
  expect(created.draft.goal).toBe('合成工作流目标\n保留多行 中文说明')
  expect(byLabel('当前 AI 任务').value).toBe(created.id)
  expect(byLabel('项目名称').value).toBe('合成工作流')
  expect(byLabel('工作流任务预览')).toBeNull()
  expect(createButton()).toBeUndefined()
  expect([...new URLSearchParams(router.state.location.search)]).toEqual([['keep', 'opaque'], ['tag', 'one'], ['tag', 'two']])
  expect(router.state.location.state).toEqual({ returnTo: '/tools?q=synthetic' })
  expect(storageWrites).toHaveBeenCalledTimes(1)
  expect(hasPersonalPending(CONTEXT_TASKS_KEY)).toBe(false)
  expect(alerts()).toEqual([])
  return created
}

it('creates a legal workflow task only on the real button click, preserving both old tasks and multiline contents', async () => {
  expect(() => assertAIWorkflows(fixtures.workflows, fixtures.resources)).not.toThrow()
  mount()
  await act(async () => { createButton().click() })
  const created = expectCreated()
  expect(created.draft.materials).toHaveLength(1)
  expect(created.draft.materials[0]).toMatchObject({
    name: '1. 准备 中文 上下文',
    content: '第一行：准备 中文上下文\n\t保留缩进\r\n最后一行\n\n关联资源：合成关联资源\nsynthetic resource body\r\n  原始 资源内容\n```',
  })
  expect(byLabel('材料内容 1').value).toBe(created.draft.materials[0].content.replace(/\r\n/g, '\n'))
})

it('creates twenty materials from 120-character titles without truncation and keeps numbered names within 124 characters', async () => {
  const titles = Array.from({ length: 20 }, (_, index) => `${String(index + 1).padStart(2, '0')} ${'中'.repeat(117)}`)
  const description = '步骤第一行 中文 空格\n\t保留缩进\r\n末行'
  fixtures.workflows[0].steps = titles.map(title => ({ title, description, resourceId: '' }))
  expect(titles.every(title => title.length === 120)).toBe(true)
  expect(() => assertAIWorkflows(fixtures.workflows, fixtures.resources)).not.toThrow()
  mount()
  await act(async () => { createButton().click() })
  const materials = expectCreated().draft.materials
  expect(materials).toHaveLength(20)
  expect(new Set(materials.map(item => item.id)).size).toBe(20)
  for (const [index, material] of materials.entries()) {
    expect(material.name).toBe(`${index + 1}. ${titles[index]}`)
    expect(material.name.length).toBeLessThanOrEqual(124)
    expect(material.name.length).toBeLessThan(256)
    expect(material.content).toBe(description)
  }
  expect(materials[0].name.length).toBe(123)
  expect(materials[9].name.length).toBe(124)
  expect(materials[19].name.length).toBe(124)
  expect(byLabel('材料内容 20').value).toBe(description.replace(/\r\n/g, '\n'))
})

it('rejects a preexisting newline title without rewriting it, changing either old draft, or removing its workflow query', async () => {
  fixtures.workflows[0].steps[0].title = '准备\n上下文'
  expect(() => assertAIWorkflows(fixtures.workflows, fixtures.resources)).toThrow('AI 工作流步骤字段无效')
  // A stale prevalidated data module can still reach the UI; exercise its real rejection path.
  mount()
  const beforeMarkdown = host.querySelector('textarea[readonly]').value
  const beforeMaterial = byLabel('材料内容 1').value
  const beforeSearch = router.state.location.search
  await act(async () => { createButton().click() })
  expect(alerts()).toEqual(['材料必须是有效的文本内容'])
  expect(localStorage.getItem(CONTEXT_TASKS_KEY)).toBe(originalRaw)
  expect(stored()).toEqual(original)
  expect(storageWrites).not.toHaveBeenCalled()
  expect(byLabel('当前 AI 任务').value).toBe(original.activeId)
  expect(byLabel('当前 AI 任务').options).toHaveLength(2)
  expect(byLabel('项目名称').value).toBe(original.tasks[0].draft.project)
  expect(byLabel('任务目标').value).toBe(original.tasks[0].draft.goal)
  expect(byLabel('材料内容 1').value).toBe(beforeMaterial)
  expect(host.querySelector('textarea[readonly]').value).toBe(beforeMarkdown)
  expect(byLabel('工作流任务预览').querySelector('li').textContent).toBe('准备\n上下文')
  expect(fixtures.workflows[0].steps[0].title).toBe('准备\n上下文')
  expect(createButton().disabled).toBe(false)
  expect(router.state.location.search).toBe(beforeSearch)
  expect(router.state.location.state).toEqual({ returnTo: '/tools?q=synthetic' })
  expect(hasPersonalPending(CONTEXT_TASKS_KEY)).toBe(false)
})
