import { describe, it, expect } from 'vitest'
import {
  renderMetadataForm,
  collectMetadataForm,
  renderPermissionsForm,
  collectPermissionsForm,
  buildSandbox,
  buildAllow,
  PERMISSION_GROUPS,
  DANGER_PERMISSIONS,
} from '../../admin/wizard-forms.js'

const t = key => key
const allOff = {
  clipboard: false, storage: false, network: false, notifications: false,
  modals: false, download: false, externalLinks: false, sameOrigin: false, popups: false,
}
const baseManifest = {
  id: 'my-tool',
  name: 'My Tool',
  description: '',
  category: 'utilities',
  version: '1.0.0',
  tags: ['demo'],
  display: { mode: 'embedded', height: 'auto' },
  permissions: { ...allOff },
}

// ---------- v3.0.1 P0 回归：Step 3 权限表单 ----------

describe('wizard step3 permissions form', () => {
  it('渲染出的必须是 HTMLFormElement（div 没有 .elements 的 P0 根因）', () => {
    const form = renderPermissionsForm(document, { permissions: allOff, t })
    expect(form instanceof HTMLFormElement).toBe(true)
    expect(form.className).toContain('perm-grid')
  })

  it('按三组展示权限，且 9 个 perm.* checkbox 全部在 form.elements 里', () => {
    const form = renderPermissionsForm(document, { permissions: allOff, t })
    expect(form.querySelectorAll('fieldset.perm-group')).toHaveLength(PERMISSION_GROUPS.length)
    const names = [...form.querySelectorAll('input[type="checkbox"]')].map(input => input.name)
    expect(names.filter(name => name.startsWith('perm.'))).toHaveLength(9)
    for (const name of names) {
      const element = form.elements.namedItem(name)
      expect(element instanceof HTMLInputElement).toBe(true)
    }
  })

  it('collect 从真实表单读取 checked 状态', () => {
    const form = renderPermissionsForm(document, { permissions: allOff, t })
    form.elements.namedItem('perm.clipboard').checked = true
    form.elements.namedItem('perm.sameOrigin').checked = true
    const result = collectPermissionsForm(form, allOff)
    expect(result.ok).toBe(true)
    expect(result.permissions.clipboard).toBe(true)
    expect(result.permissions.sameOrigin).toBe(true)
    expect(result.permissions.modals).toBe(false)
  })

  it('传入 div（非 form）时优雅失败，而不是 TypeError', () => {
    const div = document.createElement('div')
    div.className = 'perm-grid'
    const result = collectPermissionsForm(div, allOff)
    expect(result.ok).toBe(false)
    expect(result.code).toBe('formFail')
    expect(result.permissions).toEqual(allOff)
  })

  it('危险权限带 ⚠ 徽标，普通权限不带', () => {
    const form = renderPermissionsForm(document, { permissions: allOff, t })
    for (const key of DANGER_PERMISSIONS) {
      const field = form.elements.namedItem(`perm.${key}`).closest('.check-field')
      expect(field.className).toContain('check-danger')
      expect(field.querySelector('.check-danger-badge')).toBeTruthy()
    }
    const clipboard = form.elements.namedItem('perm.clipboard').closest('.check-field')
    expect(clipboard.className).not.toContain('check-danger')
  })

  it('onChange 回调收到读取后的权限对象', () => {
    const calls = []
    const form = renderPermissionsForm(document, { permissions: allOff, t, onChange: permissions => calls.push(permissions) })
    form.elements.namedItem('perm.storage').checked = true
    form.dispatchEvent(new Event('change', { bubbles: true }))
    expect(calls).toHaveLength(1)
    expect(calls[0].storage).toBe(true)
  })
})

// ---------- Step 2 元数据 ----------

describe('wizard step2 metadata form', () => {
  it('合法输入归一化为 manifest', () => {
    const form = renderMetadataForm(document, { manifest: baseManifest, categories: [{ id: 'utilities' }], t })
    form.elements.namedItem('id').value = 'cs2-rainbow'
    form.elements.namedItem('name').value = ' CS2 彩虹 '
    form.elements.namedItem('version').value = '1.2.0'
    form.elements.namedItem('tags').value = ' cs2 , chat , '
    form.elements.namedItem('display.height').value = '9999'
    form.elements.namedItem('favorite').checked = true
    const result = collectMetadataForm(form, baseManifest)
    expect(result.ok).toBe(true)
    expect(result.manifest.id).toBe('cs2-rainbow')
    expect(result.manifest.name).toBe('CS2 彩虹')
    expect(result.manifest.tags).toEqual(['cs2', 'chat'])
    expect(result.manifest.display.height).toBe(5000)
    expect(result.manifest.favorite).toBe(true)
  })

  it('非法 id / name / version 分别返回错误码', () => {
    const form = renderMetadataForm(document, { manifest: baseManifest, categories: [], t })
    form.elements.namedItem('id').value = 'Bad Id!'
    expect(collectMetadataForm(form, baseManifest).code).toBe('badId')

    form.elements.namedItem('id').value = 'ok-tool'
    form.elements.namedItem('name').value = '  '
    expect(collectMetadataForm(form, baseManifest).code).toBe('badName')

    form.elements.namedItem('name').value = 'OK'
    form.elements.namedItem('version').value = 'v1'
    expect(collectMetadataForm(form, baseManifest).code).toBe('badVersion')
  })

  it('height 支持 auto 与像素数值', () => {
    const form = renderMetadataForm(document, { manifest: baseManifest, categories: [], t })
    form.elements.namedItem('display.height').value = 'auto'
    expect(collectMetadataForm(form, baseManifest).manifest.display.height).toBe('auto')
    form.elements.namedItem('display.height').value = '480'
    expect(collectMetadataForm(form, baseManifest).manifest.display.height).toBe(480)
  })
})

// ---------- sandbox / Permissions Policy ----------

describe('buildSandbox / buildAllow', () => {
  it('全关时只保留 scripts + forms', () => {
    expect(buildSandbox(allOff)).toBe('allow-scripts allow-forms')
  })

  it('各权限映射到正确 sandbox flag', () => {
    const on = { ...allOff, modals: true, download: true, popups: true, sameOrigin: true }
    const sandbox = buildSandbox(on)
    expect(sandbox).toContain('allow-modals')
    expect(sandbox).toContain('allow-downloads')
    expect(sandbox).toContain('allow-popups')
    expect(sandbox).toContain('allow-same-origin')
  })

  it('clipboard 权限开启时 allow 包含 Permissions Policy（v3.0.1 三十二）', () => {
    expect(buildAllow({ ...allOff, clipboard: true })).toBe('clipboard-read; clipboard-write')
    expect(buildAllow({ ...allOff, clipboard: true, download: true })).toBe('clipboard-read; clipboard-write; downloads')
    expect(buildAllow(allOff)).toBeUndefined()
  })
})
