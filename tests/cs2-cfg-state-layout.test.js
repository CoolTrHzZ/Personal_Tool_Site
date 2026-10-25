import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { Blob as NodeBlob } from 'node:buffer'
import { CompressionStream as NativeCompressionStream, DecompressionStream as NativeDecompressionStream, TransformStream } from 'node:stream/web'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CfgWorkbench from '../src/tools/packages/cs2-cfg'
import { CFG_STORAGE_KEY } from '../src/tools/packages/cs2-cfg/store'
import { decodeSharedCfg, encodeSharedCfg } from '../src/tools/packages/cs2-cfg/share'
import { clearPersonalPending, hasPersonalPending, readPersonalRaw } from '../src/utils/personal-storage'
import { exportPersonalData } from '../src/utils/personal-backup'
import { downloadText } from '../src/utils/tool-files'

vi.mock('../src/utils/tool-files', async importOriginal => ({ ...await importOriginal(), downloadText: vi.fn() }))
// Call-through spies expose completion promises to act. Encoding, decoding,
// validation, byte limits, gzip and base64 all run the actual production module.
vi.mock('../src/tools/packages/cs2-cfg/share', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, encodeSharedCfg: vi.fn(actual.encodeSharedCfg), decodeSharedCfg: vi.fn(actual.decodeSharedCfg) }
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, navigate, actualShare, writeText, readText, copies, fetcher, previousClipboard
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const original = () => ({
  draft: { name: '本机草稿', content: 'echo original\n' },
  versions: [{ id: 'synthetic-saved-version', name: '已有版本', content: '\ufeffecho "\u0006原文"\r\n', savedAt: '2026-09-01T12:00:00.000Z' }],
})
function CaptureNavigation() { navigate = useNavigate(); return null }
const editor = () => host.querySelector('textarea[aria-label="CFG 编辑器"]')
const nameInput = () => host.querySelector('input[aria-label="配置名称"]')
const share = () => host.querySelector('section[aria-label="CFG 分享链接"]')
const preview = () => host.querySelector('section[aria-label="CFG 导入预览"]')
const button = label => [...host.querySelectorAll('button')].find(node => node.textContent === label && !node.hasAttribute('aria-pressed'))
const alerts = () => [...host.querySelectorAll('[role="alert"]')].map(node => node.textContent)
const copied = () => [...host.querySelectorAll('[role="status"]')].find(node => node.textContent === '已复制')
const click = label => act(() => { const node = button(label); expect(node).toBeTruthy(); node.click() })
const storageWarning = () => button('重新保存当前内容')?.closest('[role="alert"]')
const rawStore = () => JSON.parse(localStorage.getItem(CFG_STORAGE_KEY))
function edit(value, node = editor()) {
  act(() => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function mount(search = '') {
  await act(async () => root.render(h(MemoryRouter, { initialEntries: ['/tools/cs2-cfg' + search] },
    h(CaptureNavigation), h(Routes, null,
      h(Route, { path: '/tools/cs2-cfg', element: h(CfgWorkbench) }),
      h(Route, { path: '/away', element: h('p', null, 'Synthetic destination') }),
    ),
  )))
}
function seed(data = original(), raw = JSON.stringify(data)) {
  localStorage.setItem(CFG_STORAGE_KEY, raw)
  return raw
}
async function finishCodec(spy, index, gate, outcome = 'success') {
  let result
  await act(async () => {
    if (gate) {
      if (outcome === 'failure') gate.reject(new Error('Synthetic stream refusal'))
      else gate.resolve()
    }
    result = await spy.mock.results[index].value.catch(() => undefined)
  })
  return result
}
const finishEncoding = (index = encodeSharedCfg.mock.results.length - 1, gate, outcome) => finishCodec(encodeSharedCfg, index, gate, outcome)
const finishDecoding = (index = decodeSharedCfg.mock.results.length - 1, gate, outcome) => finishCodec(decodeSharedCfg, index, gate, outcome)
async function finishCopy(index, outcome = 'success') {
  await act(async () => outcome === 'failure' ? copies[index].reject(new Error('Synthetic clipboard refusal')) : copies[index].resolve())
}
function payloadOf(link) { return new URLSearchParams(new URL(link).hash.split('?')[1]).get('cfg') }

// Delay only the platform's Blob byte stream. The source bytes still pass through
// real gzip, readLimited, base64 and document validation; no decoder is recreated.
function gateBlobStreams() {
  const gates = []
  class GatedBlob extends NodeBlob {
    stream() {
      const gate = deferred()
      gate.promise.catch(() => {})
      gates.push(gate)
      return super.stream().pipeThrough(new TransformStream({
        async transform(chunk, controller) { await gate.promise; controller.enqueue(chunk) },
      }))
    }
  }
  vi.stubGlobal('Blob', GatedBlob)
  vi.stubGlobal('CompressionStream', NativeCompressionStream)
  vi.stubGlobal('DecompressionStream', NativeDecompressionStream)
  return gates
}
async function compressedPayload(document) {
  vi.stubGlobal('Blob', NodeBlob)
  vi.stubGlobal('CompressionStream', NativeCompressionStream)
  const payload = await actualShare.encodeSharedCfg(document)
  expect(payload.startsWith('z1.')).toBe(true)
  return payload
}

beforeEach(async () => {
  vi.clearAllMocks()
  localStorage.clear(); clearPersonalPending(CFG_STORAGE_KEY)
  actualShare = await vi.importActual('../src/tools/packages/cs2-cfg/share')
  vi.stubGlobal('Blob', NodeBlob)
  vi.stubGlobal('CompressionStream', undefined)
  vi.stubGlobal('DecompressionStream', NativeDecompressionStream)
  vi.stubEnv('DEV', true)
  copies = []
  writeText = vi.fn(value => { const pending = deferred(); copies.push({ value, ...pending }); return pending.promise })
  readText = vi.fn()
  previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText, readText } })
  fetcher = vi.fn(() => { throw new Error('Unexpected network access in synthetic CFG state tests') })
  vi.stubGlobal('fetch', fetcher)
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => {
  if (root) act(() => root.unmount())
  host.remove()
  if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard)
  else delete navigator.clipboard
  expect(readText).not.toHaveBeenCalled()
  expect(fetcher).not.toHaveBeenCalled()
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs()
  localStorage.clear(); clearPersonalPending(CFG_STORAGE_KEY)
})

describe('CFG draft state and recovery controls in the layout', () => {
  it('preserves a failed draft, exports the exact stored raw backup, and requires confirmation before retrying', async () => {
    const initial = original(), raw = seed(initial, JSON.stringify(initial, null, 2) + '\n')
    await mount()
    const textarea = editor(), input = nameInput()
    const write = vi.spyOn(Object.getPrototypeOf(localStorage), 'setItem').mockImplementation(() => { throw new Error('Synthetic quota refusal') })
    edit('echo unsaved\nbind F4 "say \u0006彩色\u000b"\n')
    edit('待抢救草稿', input)
    const current = { ...initial, draft: { name: '待抢救草稿', content: textarea.value } }
    expect(editor()).toBe(textarea); expect(nameInput()).toBe(input)
    expect(host.querySelector('.cfg-draft-title').textContent).toBe(current.draft.name)
    expect(host.querySelector('.cfg-draft-overview [role="status"]').textContent).toBe('仅在当前页面')
    expect(storageWarning().textContent).toContain('浏览器保存失败')
    expect(storageWarning().closest('details')).toBeNull()
    expect(localStorage.getItem(CFG_STORAGE_KEY)).toBe(raw)
    expect(JSON.parse(readPersonalRaw(CFG_STORAGE_KEY))).toEqual(current)
    expect(JSON.parse(exportPersonalData().entries[CFG_STORAGE_KEY])).toEqual(current)
    expect(button('保存版本').disabled).toBe(true)
    expect(button('下载 CFG').disabled).toBe(false)
    expect(button('复制 CFG').disabled).toBe(false)
    expect(button('下载原记录备份').parentElement).toBe(button('重新保存当前内容').parentElement)
    expect(downloadText).not.toHaveBeenCalled(); expect(writeText).not.toHaveBeenCalled()
    click('下载原记录备份')
    expect(downloadText).toHaveBeenLastCalledWith('cfg-local-backup.json', raw, 'application/json')
    click('下载 CFG')
    expect(downloadText).toHaveBeenLastCalledWith('待抢救草稿.cfg', current.draft.content)
    expect(window.confirm).not.toHaveBeenCalled()
    write.mockRestore()
    const retryWrites = vi.spyOn(Object.getPrototypeOf(localStorage), 'setItem')
    click('重新保存当前内容')
    expect(window.confirm).toHaveBeenCalledWith('将以当前编辑内容和版本列表覆盖本地记录。建议先下载备份，是否继续？')
    expect(retryWrites).not.toHaveBeenCalled()
    expect(localStorage.getItem(CFG_STORAGE_KEY)).toBe(raw)
    expect(hasPersonalPending(CFG_STORAGE_KEY)).toBe(true)
    expect(editor().value).toBe(current.draft.content)
    window.confirm.mockReturnValue(true)
    click('重新保存当前内容')
    expect(retryWrites).toHaveBeenCalledExactlyOnceWith(CFG_STORAGE_KEY, JSON.stringify(current))
    expect(rawStore()).toEqual(current)
    expect(hasPersonalPending(CFG_STORAGE_KEY)).toBe(false)
    expect(storageWarning()).toBeUndefined()
    expect(host.querySelector('.cfg-draft-overview [role="status"]').textContent).toBe('草稿已在本机保存')
    expect(button('保存版本').disabled).toBe(false)
  })

  it('shows a failed version snapshot as unconfirmed, without claiming durable success or losing the prior versions', async () => {
    const initial = original(), raw = seed(initial)
    await mount()
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('synthetic-new-version')
    const writes = vi.spyOn(Object.getPrototypeOf(localStorage), 'setItem').mockImplementation(() => { throw new Error('Synthetic quota refusal') })
    click('保存版本')
    const pending = JSON.parse(readPersonalRaw(CFG_STORAGE_KEY))
    expect(pending.draft).toEqual(initial.draft)
    expect(pending.versions).toEqual([
      { ...initial.draft, id: 'synthetic-new-version', savedAt: expect.any(String) },
      ...initial.versions,
    ])
    expect(host.querySelectorAll('.cfg-version-list li')).toHaveLength(2)
    const warning = host.querySelector('.cfg-version-persistence')
    expect(warning.textContent).toBe('当前版本列表尚未确认写入本机。')
    expect(warning.closest('details')).toBeNull()
    expect(host.textContent).not.toContain('已保存新版本，继续编辑不会修改此版本。')
    expect(localStorage.getItem(CFG_STORAGE_KEY)).toBe(raw)
    expect(button('保存版本').disabled).toBe(true)
    expect(writes).toHaveBeenCalledOnce()
    click('下载原记录备份')
    expect(downloadText).toHaveBeenCalledExactlyOnceWith('cfg-local-backup.json', raw, 'application/json')
    expect(JSON.parse(exportPersonalData().entries[CFG_STORAGE_KEY])).toEqual(pending)
  })

  it('leaves malformed raw storage intact and makes its exact backup available beside the guarded overwrite', async () => {
    const raw = '  {"draft": "synthetic damaged record"\r\n'
    localStorage.setItem(CFG_STORAGE_KEY, raw)
    await mount()
    expect(storageWarning().textContent).toContain('本地 CFG 记录无法读取')
    edit('echo rescued from a separate source\n')
    expect(editor().value).toBe('echo rescued from a separate source\n')
    expect(localStorage.getItem(CFG_STORAGE_KEY)).toBe(raw)
    click('下载原记录备份')
    expect(downloadText).toHaveBeenCalledExactlyOnceWith('cfg-local-backup.json', raw, 'application/json')
    click('重新保存当前内容')
    expect(localStorage.getItem(CFG_STORAGE_KEY)).toBe(raw)
    expect(hasPersonalPending(CFG_STORAGE_KEY)).toBe(true)
    expect(storageWarning().contains(button('下载原记录备份'))).toBe(true)
    expect(storageWarning().contains(button('重新保存当前内容'))).toBe(true)
  })

  it('pauses writes on an actual storage event and keeps the current draft distinct from the other tab backup', async () => {
    const initial = original(), raw = seed(initial)
    await mount()
    const other = { draft: { name: '别页草稿', content: 'echo other tab\n' }, versions: [] }
    const otherRaw = JSON.stringify(other, null, 2)
    localStorage.setItem(CFG_STORAGE_KEY, otherRaw)
    const writes = vi.spyOn(Object.getPrototypeOf(localStorage), 'setItem')
    await act(async () => window.dispatchEvent(new window.StorageEvent('storage', {
      key: CFG_STORAGE_KEY, oldValue: raw, newValue: otherRaw, storageArea: localStorage,
    })))
    expect(storageWarning().textContent).toContain('另一个标签页修改了 CFG 记录')
    expect(editor().value).toBe(initial.draft.content)
    edit('echo continued local draft\n')
    expect(writes).not.toHaveBeenCalled()
    expect(JSON.parse(readPersonalRaw(CFG_STORAGE_KEY))).toEqual({ ...initial, draft: { ...initial.draft, content: editor().value } })
    expect(localStorage.getItem(CFG_STORAGE_KEY)).toBe(otherRaw)
    expect(button('保存版本').disabled).toBe(true)
    click('下载原记录备份')
    expect(downloadText).toHaveBeenCalledExactlyOnceWith('cfg-local-backup.json', otherRaw, 'application/json')
    expect(storageWarning().closest('details')).toBeNull()
  })

  it('detects a silent competing write, preserves subsequent pending edits across remount, and never replaces the other record', async () => {
    const initial = original(); seed(initial)
    await mount()
    const otherRaw = JSON.stringify({ draft: { name: '别页', content: 'echo competing write\n' }, versions: [] })
    localStorage.setItem(CFG_STORAGE_KEY, otherRaw)
    const writes = vi.spyOn(Object.getPrototypeOf(localStorage), 'setItem')
    edit('echo first pending\n')
    expect(storageWarning().textContent).toContain('本地记录已在其他页面修改')
    edit('echo latest pending\n')
    const pending = { ...initial, draft: { ...initial.draft, content: 'echo latest pending\n' } }
    expect(writes).not.toHaveBeenCalled()
    act(() => root.render(null)); await mount()
    expect(editor().value).toBe(pending.draft.content)
    expect(host.querySelector('.cfg-draft-title').textContent).toBe(pending.draft.name)
    expect(storageWarning().textContent).toContain('修改尚未保存')
    expect(host.querySelector('.cfg-draft-overview [role="status"]').textContent).toBe('仅在当前页面')
    expect(JSON.parse(exportPersonalData().entries[CFG_STORAGE_KEY])).toEqual(pending)
    expect(localStorage.getItem(CFG_STORAGE_KEY)).toBe(otherRaw)
    expect(writes).not.toHaveBeenCalled()
    expect(downloadText).not.toHaveBeenCalled(); expect(writeText).not.toHaveBeenCalled()
  })
})

describe('actual CFG share encoding and explicit clipboard feedback', () => {
  it('creates a complete immutable snapshot with visible sensitive-content guidance and copies only on request', async () => {
    const document = { name: '分享完整原文', content: '\ufeff// 完整配置 🎯\r\nbind F4 "say \u0006彩色\u000b"\r\necho "<script>synthetic()</script>"\r\n' }
    seed({ draft: document, versions: [] }); await mount()
    const writes = vi.spyOn(Object.getPrototypeOf(localStorage), 'setItem')
    const output = host.querySelector('[aria-label="当前草稿操作"]')
    expect(output.contains(button('生成分享链接'))).toBe(true)
    const cue = output.querySelector('.cfg-sensitive-note')
    expect(cue.textContent).toContain('检查敏感内容'); expect(cue.closest('details')).toBeNull()
    expect(share()).toBeNull(); expect(writeText).not.toHaveBeenCalled()
    click('生成分享链接'); await finishEncoding()
    expect(encodeSharedCfg).toHaveBeenCalledExactlyOnceWith(document)
    const link = share().querySelector('textarea').value
    expect(payloadOf(link).startsWith('p1.')).toBe(true)
    expect(await actualShare.decodeSharedCfg(payloadOf(link))).toEqual(document)
    expect(new URL(link).origin).toBe(window.location.origin)
    expect(new URL(link).hash.startsWith('#/tools/cs2-cfg?cfg=')).toBe(true)
    expect(share().querySelector('textarea').readOnly).toBe(true)
    expect(share().querySelector('a').href).toBe(link)
    expect(share().querySelector('a').target).toBe('_blank')
    expect(share().querySelector('a').rel).toBe('noreferrer')
    expect(share().textContent).toContain('拿到链接的人都能读取')
    expect(share().textContent).toContain('它不会同步后续修改')
    expect([...share().querySelectorAll('.cfg-sensitive-note')].every(node => !node.closest('details'))).toBe(true)
    expect(share().textContent).toContain('当前生成的是本地预览链接')
    expect(writeText).not.toHaveBeenCalled(); expect(downloadText).not.toHaveBeenCalled()
    click('复制分享链接')
    expect(writeText).toHaveBeenCalledExactlyOnceWith(link)
    expect(copied()).toBeUndefined()
    await finishCopy(0)
    expect(share().contains(copied())).toBe(true)
    expect(writes).not.toHaveBeenCalled()
    edit('echo changed after snapshot\n')
    expect(share()).toBeNull(); expect(copied()).toBeUndefined()
    expect(await actualShare.decodeSharedCfg(payloadOf(link))).toEqual(document)
    click('生成分享链接'); await finishEncoding()
    expect(await actualShare.decodeSharedCfg(payloadOf(share().querySelector('textarea').value))).toEqual({ name: document.name, content: editor().value })
    expect(writeText).toHaveBeenCalledOnce()
  })

  it('shows a rejected share copy beside its action, clears it on retry, and reports only the newest completion', async () => {
    seed(); await mount(); click('生成分享链接'); await finishEncoding()
    const link = share().querySelector('textarea').value
    click('复制分享链接'); await finishCopy(0, 'failure')
    const refusal = share().querySelector('[role="alert"]')
    expect(refusal.textContent).toBe('复制失败，请手动选择结果复制')
    expect(refusal.parentElement).toBe(button('复制分享链接').parentElement)
    expect(refusal.closest('details')).toBeNull(); expect(copied()).toBeUndefined()
    click('复制分享链接'); click('复制分享链接')
    expect(share().querySelector('[role="alert"]')).toBeNull(); expect(copied()).toBeUndefined()
    await finishCopy(2); await finishCopy(1, 'failure')
    expect(share().contains(copied())).toBe(true)
    expect(share().querySelector('[role="alert"]')).toBeNull()
    expect(writeText.mock.calls.map(([value]) => value)).toEqual([link, link, link])
    expect(downloadText).not.toHaveBeenCalled()
  })

  it.each(['success', 'failure'])('ignores a late share-copy %s after a draft edit removes the snapshot', async outcome => {
    seed(); await mount(); click('生成分享链接'); await finishEncoding()
    click('复制分享链接')
    edit('已修改名称', nameInput())
    expect(share()).toBeNull()
    await finishCopy(0, outcome)
    expect(copied()).toBeUndefined(); expect(alerts()).toEqual([])
    expect(host.querySelector('.cfg-draft-title').textContent).toBe('已修改名称')
  })

  it('copies current CFG text explicitly and never claims success for a rejected or obsolete write', async () => {
    seed(); await mount()
    expect(writeText).not.toHaveBeenCalled()
    click('复制 CFG')
    expect(writeText).toHaveBeenLastCalledWith(original().draft.content)
    expect(copied()).toBeUndefined()
    await finishCopy(0, 'failure')
    expect(host.querySelector('.cfg-copy-actions [role="alert"]').textContent).toBe('复制失败，请手动选择结果复制')
    click('复制 CFG'); edit('echo current copied draft\n')
    await finishCopy(1)
    expect(copied()).toBeUndefined(); expect(alerts()).toEqual([])
    click('复制 CFG')
    expect(writeText).toHaveBeenLastCalledWith('echo current copied draft\n')
    await finishCopy(2)
    expect(host.querySelector('.cfg-copy-actions').contains(copied())).toBe(true)
    expect(downloadText).not.toHaveBeenCalled()
  })

  it.each([true, false])('shows the local-preview warning only for the existing DEV=%s branch', async dev => {
    // The frozen source gates this warning by build mode, not hostname.
    vi.stubEnv('DEV', dev)
    seed(); await mount(); click('生成分享链接'); await finishEncoding()
    expect(share().textContent.includes('当前生成的是本地预览链接')).toBe(dev)
    expect(share().textContent).toContain('拿到链接的人都能读取')
    expect(writeText).not.toHaveBeenCalled(); expect(downloadText).not.toHaveBeenCalled()
  })

  it('uses the real plain-format length failure and leaves the complete draft available for explicit download', async () => {
    const document = { name: '超长分享', content: 'echo ' + 'x'.repeat(13000) }
    seed({ draft: document, versions: [] }); await mount()
    click('生成分享链接'); await finishEncoding()
    expect(alerts()).toContain('分享链接超过 16,000 字符，请下载 CFG 文件后传输。')
    expect(host.querySelector('[role="alert"]').closest('details')).toBeNull()
    expect(share()).toBeNull(); expect(editor().value).toBe(document.content)
    expect(button('生成分享链接').disabled).toBe(false)
    expect(button('生成分享链接').hasAttribute('aria-busy')).toBe(false)
    expect(writeText).not.toHaveBeenCalled(); expect(downloadText).not.toHaveBeenCalled()
    click('下载 CFG')
    expect(downloadText).toHaveBeenCalledExactlyOnceWith('超长分享.cfg', document.content)
  })

  it.each(['success', 'failure'])('ignores real gzip generation completing with %s after the draft revision changes', async outcome => {
    const gates = gateBlobStreams()
    seed(); await mount(); click('生成分享链接')
    expect(gates).toHaveLength(1)
    expect(button('生成分享链接').disabled).toBe(true)
    expect(button('生成分享链接').getAttribute('aria-busy')).toBe('true')
    edit('echo edited while encoding\n'); edit('新名称', nameInput())
    expect(button('生成分享链接').disabled).toBe(false)
    expect(share()).toBeNull()
    const payload = await finishEncoding(0, gates[0], outcome)
    if (outcome === 'success') expect(payload.startsWith('z1.')).toBe(true)
    expect(share()).toBeNull(); expect(alerts()).toEqual([])
    expect(editor().value).toBe('echo edited while encoding\n')
    expect(nameInput().value).toBe('新名称')
    expect(button('生成分享链接').disabled).toBe(false)
    expect(writeText).not.toHaveBeenCalled(); expect(downloadText).not.toHaveBeenCalled()
  })

  it.each(['success', 'failure'])('keeps a newer gzip request busy when an obsolete request completes with %s', async outcome => {
    const gates = gateBlobStreams()
    seed(); await mount(); click('生成分享链接')
    edit('echo newer request\n'); click('生成分享链接')
    expect(gates).toHaveLength(2)
    await finishEncoding(0, gates[0], outcome)
    expect(button('生成分享链接').disabled).toBe(true)
    expect(button('生成分享链接').getAttribute('aria-busy')).toBe('true')
    expect(share()).toBeNull(); expect(alerts()).toEqual([])
    await finishEncoding(1, gates[1])
    expect(button('生成分享链接').disabled).toBe(false)
    const payload = payloadOf(share().querySelector('textarea').value)
    vi.stubGlobal('Blob', NodeBlob)
    expect(await actualShare.decodeSharedCfg(payload)).toEqual({ name: original().draft.name, content: 'echo newer request\n' })
    expect(writeText).not.toHaveBeenCalled(); expect(downloadText).not.toHaveBeenCalled()
  })

  it('keeps the completed newer snapshot when an older real stream fails later', async () => {
    const gates = gateBlobStreams()
    seed(); await mount(); click('生成分享链接')
    edit('echo newest completed snapshot\n'); click('生成分享链接')
    await finishEncoding(1, gates[1])
    const link = share().querySelector('textarea').value
    await finishEncoding(0, gates[0], 'failure')
    expect(share().querySelector('textarea').value).toBe(link)
    expect(alerts()).toEqual([]); expect(button('生成分享链接').disabled).toBe(false)
  })

  it('shows a current real-stream failure and permits an explicit successful retry without copying automatically', async () => {
    const gates = gateBlobStreams()
    seed(); await mount(); click('生成分享链接')
    await finishEncoding(0, gates[0], 'failure')
    expect(alerts()).toEqual(['Synthetic stream refusal'])
    expect(editor().value).toBe(original().draft.content)
    expect(share()).toBeNull(); expect(button('生成分享链接').disabled).toBe(false)
    click('生成分享链接')
    expect(alerts()).toEqual([])
    await finishEncoding(1, gates[1])
    expect(share()).not.toBeNull(); expect(alerts()).toEqual([])
    expect(writeText).not.toHaveBeenCalled(); expect(downloadText).not.toHaveBeenCalled()
  })
})

describe('actual incoming share decoding before any draft replacement', () => {
  it('previews a real encoded query without writing or copying, preserves the current draft on cancel, and loads only explicitly', async () => {
    const incoming = { name: '收到的配置', content: '\ufeff// incoming\r\nbind F4 "say \u0006原文\u000b"\r\n' }
    const payload = await actualShare.encodeSharedCfg(incoming)
    const initial = original(), raw = seed(initial)
    const writes = vi.spyOn(Object.getPrototypeOf(localStorage), 'setItem')
    await mount('?cfg=' + payload)
    await finishDecoding()
    expect(preview().querySelector('h3').textContent).toBe('分享链接 · 收到的配置')
    expect(preview().querySelector('pre').textContent).toBe(incoming.content)
    expect(preview().textContent).toContain('预览 · 尚未载入')
    expect(preview().querySelector('.cfg-sensitive-note').closest('details')).toBeNull()
    expect(editor().value).toBe(initial.draft.content)
    expect(nameInput().value).toBe(initial.draft.name)
    expect(writes).not.toHaveBeenCalled()
    expect(writeText).not.toHaveBeenCalled(); expect(downloadText).not.toHaveBeenCalled()
    click('取消载入')
    expect(preview()).toBeNull(); expect(editor().value).toBe(initial.draft.content)
    expect(localStorage.getItem(CFG_STORAGE_KEY)).toBe(raw)
    await act(async () => navigate('/tools/cs2-cfg'))
    await act(async () => navigate('/tools/cs2-cfg?cfg=' + payload))
    await finishDecoding()
    click('载入到编辑器')
    expect(preview()).toBeNull()
    expect(nameInput().value).toBe(incoming.name)
    expect(editor().value).toBe(incoming.content.replace(/\r\n?/g, '\n'))
    expect(rawStore()).toEqual({ draft: incoming, versions: initial.versions })
    expect(writes).toHaveBeenCalledOnce()
    expect(writeText).not.toHaveBeenCalled(); expect(downloadText).not.toHaveBeenCalled()
  })

  it.each(['success', 'failure'])('ignores an obsolete real decompression %s after a different query has produced a preview', async outcome => {
    const old = { name: '旧分享', content: 'echo old shared content\n' }
    const current = { name: '新分享', content: 'echo new shared content\n' }
    const oldPayload = await compressedPayload(old), currentPayload = await compressedPayload(current)
    const gates = gateBlobStreams()
    const initial = original(), raw = seed(initial)
    const writes = vi.spyOn(Object.getPrototypeOf(localStorage), 'setItem')
    await mount('?cfg=' + oldPayload)
    expect(preview()).toBeNull(); expect(gates).toHaveLength(1)
    await act(async () => navigate('/tools/cs2-cfg?cfg=' + currentPayload))
    expect(gates).toHaveLength(2)
    await finishDecoding(1, gates[1])
    const displayed = preview()
    expect(displayed.querySelector('pre').textContent).toBe(current.content)
    await finishDecoding(0, gates[0], outcome)
    expect(preview()).toBe(displayed)
    expect(preview().querySelector('pre').textContent).toBe(current.content)
    expect(preview().querySelector('h3').textContent).toBe('分享链接 · 新分享')
    expect(alerts()).toEqual([])
    expect(editor().value).toBe(initial.draft.content)
    expect(localStorage.getItem(CFG_STORAGE_KEY)).toBe(raw)
    expect(writes).not.toHaveBeenCalled()
    expect(writeText).not.toHaveBeenCalled(); expect(downloadText).not.toHaveBeenCalled()
  })

  it.each(['success', 'failure'])('does not expose an incoming late decode %s after navigation unmounts the workbench', async outcome => {
    const payload = await compressedPayload({ name: '迟到分享', content: 'echo late incoming\n' })
    const gates = gateBlobStreams(), raw = seed()
    const writes = vi.spyOn(Object.getPrototypeOf(localStorage), 'setItem')
    await mount('?cfg=' + payload)
    await act(async () => navigate('/away'))
    await finishDecoding(0, gates[0], outcome)
    expect(host.textContent).toBe('Synthetic destination')
    expect(preview()).toBeNull(); expect(alerts()).toEqual([])
    expect(localStorage.getItem(CFG_STORAGE_KEY)).toBe(raw)
    expect(writes).not.toHaveBeenCalled()
    expect(writeText).not.toHaveBeenCalled(); expect(downloadText).not.toHaveBeenCalled()
  })
})
