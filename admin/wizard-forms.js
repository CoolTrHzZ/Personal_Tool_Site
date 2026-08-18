// Import Wizard 表单核心：元数据 / 权限两步的 render + collect。
// 独立成模块（不触碰 fetch / 全局 DOM），供 admin.js 与 Vitest(jsdom) 共用，
// 保证 collect 永远跑在真实 HTMLFormElement 上（v3.0.1 P0：div 没有 .elements）。

export const PERMISSION_META = [
  ['clipboard', 'perms.clipboard', 'perms.clipboardHint'],
  ['storage', 'perms.storage', 'perms.storageHint'],
  ['network', 'perms.network', 'perms.networkHint'],
  ['notifications', 'perms.notifications', 'perms.notificationsHint'],
  ['modals', 'perms.modals', 'perms.modalsHint'],
  ['download', 'perms.download', 'perms.downloadHint'],
  ['externalLinks', 'perms.externalLinks', 'perms.externalLinksHint'],
  ['popups', 'perms.popups', 'perms.popupsHint'],
  ['sameOrigin', 'perms.sameOrigin', 'perms.sameOriginHint'],
]

// 权限分组展示（v3.0.1 三十四）：平台能力 / 浏览器 Sandbox / 外部能力
export const PERMISSION_GROUPS = [
  ['platform', ['clipboard', 'storage', 'notifications']],
  ['sandbox', ['modals', 'download', 'popups', 'sameOrigin']],
  ['external', ['externalLinks', 'network']],
]

// 危险权限（v3.0.1 三十五）：必须与普通权限视觉分级
export const DANGER_PERMISSIONS = ['sameOrigin', 'popups', 'network']

export const buildSandbox = permissions => [
  'allow-scripts',
  permissions.modals && 'allow-modals',
  permissions.download && 'allow-downloads',
  (permissions.externalLinks || permissions.popups) && 'allow-popups',
  (permissions.externalLinks || permissions.popups) && 'allow-popups-to-escape-sandbox',
  permissions.sameOrigin && 'allow-same-origin',
  'allow-forms',
].filter(Boolean).join(' ')

// Permissions Policy：clipboard 权限开启时 iframe 需要显式 allow
export const buildAllow = permissions => [
  permissions.clipboard && 'clipboard-read; clipboard-write',
  permissions.download && 'downloads',
].filter(Boolean).join('; ') || undefined

const el = (doc, tag, className, value) => {
  const element = doc.createElement(tag)
  element.textContent = value ?? ''
  if (className) element.className = className
  return element
}

export function field(doc, name, value, label, { type = 'text', required = false, placeholder = '', options = null } = {}) {
  const wrapper = el(doc, 'label', 'field')
  wrapper.append(el(doc, 'span', 'field-label', label))
  let element
  if (options) {
    element = doc.createElement('select')
    for (const [optionValue, optionLabel] of options) {
      const option = doc.createElement('option')
      option.value = optionValue
      option.textContent = optionLabel
      element.append(option)
    }
    element.value = value ?? options[0][0]
  } else {
    element = doc.createElement('input')
    element.type = type
    element.value = value ?? ''
    element.placeholder = placeholder
  }
  element.name = name
  element.required = required
  element.className = 'ui-input'
  wrapper.append(element)
  return wrapper
}

export function checkField(doc, name, checked, label, hint, danger = false) {
  const wrapper = el(doc, 'label', `check-field${danger ? ' check-danger' : ''}`)
  const box = doc.createElement('input')
  box.type = 'checkbox'
  box.name = name
  box.checked = Boolean(checked)
  wrapper.append(box, el(doc, 'span', 'check-label', label))
  if (danger) wrapper.append(el(doc, 'em', 'check-danger-badge', '⚠'))
  if (hint) wrapper.append(el(doc, 'small', 'check-hint', hint))
  return wrapper
}

// ---------------- Step 2：元数据 ----------------

export function renderMetadataForm(doc, { manifest, categories, t }) {
  const categoryOptions = [manifest.category, ...categories.map(item => item.id)]
    .filter((value, index, list) => value && list.indexOf(value) === index)
    .map(value => [value, value])
  const form = el(doc, 'form', 'wizard-form')
  form.append(
    field(doc, 'id', manifest.id, 'ID', { required: true, placeholder: 'my-tool' }),
    field(doc, 'name', manifest.name, t('wizard.f.name'), { required: true }),
    field(doc, 'description', manifest.description, t('wizard.f.description')),
    field(doc, 'category', manifest.category, t('wizard.f.category'), { options: categoryOptions.length ? categoryOptions : [['development', 'development']] }),
    field(doc, 'version', manifest.version, 'Version', { required: true, placeholder: '1.0.0' }),
    field(doc, 'icon', manifest.icon, 'Icon', { placeholder: 'Wrench' }),
    field(doc, 'author', manifest.author, 'Author'),
    field(doc, 'license', manifest.license, 'License'),
    field(doc, 'tags', (manifest.tags || []).join(', '), t('wizard.f.tags')),
    field(doc, 'display.mode', manifest.display?.mode || 'embedded', t('wizard.f.displayMode'), { options: [['embedded', t('display.embedded')], ['workspace', t('display.workspace')], ['fullscreen', t('display.fullscreen')]] }),
    field(doc, 'display.height', String(manifest.display?.height ?? 'auto'), t('wizard.f.height'), { placeholder: 'auto / 480' }),
    checkField(doc, 'favorite', manifest.favorite, t('wizard.f.favorite')),
  )
  form.addEventListener('submit', event => event.preventDefault())
  return form
}

// 返回 { ok, code?, manifest? }：code 对应 i18n key `wizard.${code}`
export function collectMetadataForm(form, manifest) {
  if (!(form instanceof HTMLFormElement)) return { ok: false, code: 'formFail' }
  const data = Object.fromEntries(new FormData(form))
  if (!/^[a-z0-9-]+$/.test(String(data.id))) return { ok: false, code: 'badId' }
  if (!String(data.name).trim()) return { ok: false, code: 'badName' }
  if (!/^\d+\.\d+\.\d+/.test(String(data.version))) return { ok: false, code: 'badVersion' }
  const heightRaw = String(data['display.height']).trim().toLowerCase()
  const height = heightRaw === '' || heightRaw === 'auto' ? 'auto' : Math.min(5000, Math.max(120, Number(heightRaw) || 480))
  const tags = String(data.tags).split(',').map(tag => tag.trim()).filter(Boolean)
  return {
    ok: true,
    manifest: {
      ...manifest,
      id: String(data.id),
      name: String(data.name).trim(),
      description: String(data.description).trim(),
      category: String(data.category),
      version: String(data.version).trim(),
      icon: String(data.icon).trim() || 'Wrench',
      author: String(data.author).trim() || 'import',
      license: String(data.license).trim() || 'MIT',
      tags,
      keywords: tags,
      favorite: form.elements.namedItem('favorite') instanceof HTMLInputElement ? form.elements.namedItem('favorite').checked : Boolean(manifest.favorite),
      display: { mode: ['embedded', 'workspace', 'fullscreen'].includes(data['display.mode']) ? data['display.mode'] : 'embedded', height },
    },
  }
}

// ---------------- Step 3：权限（真正的 <form>，含分组 / 危险徽标 / sandbox 实时预览）----------------

function readPermissionsFromForm(form) {
  const permissions = {}
  for (const [key] of PERMISSION_META) {
    const element = form.elements.namedItem(`perm.${key}`)
    if (!(element instanceof HTMLInputElement)) return { ok: false, code: 'permMissing', key }
    permissions[key] = element.checked
  }
  return { ok: true, permissions }
}

export function renderPermissionsForm(doc, { permissions, t, onChange }) {
  const form = el(doc, 'form', 'perm-grid')
  form.addEventListener('submit', event => event.preventDefault())
  const labelOf = key => (PERMISSION_META.find(([metaKey]) => metaKey === key) || [null, key, ''])[1]
  const hintOf = key => (PERMISSION_META.find(([metaKey]) => metaKey === key) || [null, null, ''])[2]
  for (const [groupKey, keys] of PERMISSION_GROUPS) {
    const group = el(doc, 'fieldset', `perm-group perm-group-${groupKey}`)
    group.append(el(doc, 'legend', 'perm-group-title', t(`permGroups.${groupKey}`)))
    for (const key of keys) {
      group.append(checkField(doc, `perm.${key}`, permissions[key], t(labelOf(key)), t(hintOf(key)), DANGER_PERMISSIONS.includes(key)))
    }
    form.append(group)
  }
  if (typeof onChange === 'function') {
    form.addEventListener('change', () => {
      const result = readPermissionsFromForm(form)
      if (result.ok) onChange(result.permissions, form)
    })
  }
  return form
}

export function collectPermissionsForm(form, previousPermissions) {
  if (!(form instanceof HTMLFormElement)) return { ok: false, code: 'formFail', permissions: { ...previousPermissions } }
  const result = readPermissionsFromForm(form)
  if (!result.ok) return { ok: false, code: result.code, key: result.key, permissions: { ...previousPermissions } }
  return { ok: true, permissions: { ...previousPermissions, ...result.permissions } }
}
