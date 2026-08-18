import { loadI18n } from './i18n/index.js'

const i18n = await loadI18n()
const $ = selector => document.querySelector(selector)
const ACTIVITY_KEY = 'adminActivity'
let state = { navigation: [], categories: [], site: {}, tools: [] }
document.documentElement.lang = i18n.locale
$('#locale-select').value = i18n.locale
i18n.apply()

const request = async (path, options) => {
  const response = await fetch(`/api/${path}`, { headers: { 'content-type': 'application/json' }, ...options })
  const data = await response.json()
  if (!response.ok) throw Error(data.error || i18n.t('msg.request'))
  return data
}
const status = message => { $('#status').textContent = message }
const text = (tag, value) => { const element = document.createElement(tag); element.textContent = value ?? ''; return element }
const el = (tag, className, value) => { const element = text(tag, value); if (className) element.className = className; return element }
const button = (label, data = {}, className = 'ui-button ui-button-ghost ui-button-sm') => {
  const element = document.createElement('button')
  element.type = Object.keys(data).length ? 'button' : 'submit'
  element.textContent = label
  element.className = className
  Object.assign(element.dataset, data)
  return element
}
const input = (name, value, label) => {
  const wrapper = document.createElement('label')
  wrapper.append(label || name)
  const element = document.createElement('input')
  element.name = name
  element.value = value ?? ''
  element.required = true
  element.className = 'ui-input'
  wrapper.append(element)
  return wrapper
}
const field = (name, value, label, { type = 'text', required = false, placeholder = '', options = null } = {}) => {
  const wrapper = el('label', 'field')
  wrapper.append(el('span', 'field-label', label))
  let element
  if (options) {
    element = document.createElement('select')
    for (const [optionValue, optionLabel] of options) element.append(new Option(optionLabel, optionValue))
    element.value = value ?? options[0][0]
  } else {
    element = document.createElement('input')
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
const checkField = (name, checked, label, hint) => {
  const wrapper = el('label', 'check-field')
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.name = name
  box.checked = Boolean(checked)
  wrapper.append(box, el('span', 'check-label', label))
  if (hint) wrapper.append(el('small', 'check-hint', hint))
  return wrapper
}
const readActivity = () => { try { const value = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || '[]'); return Array.isArray(value) ? value : [] } catch { return [] } }
const logActivity = message => {
  const items = [{ at: new Date().toISOString(), message }, ...readActivity()].slice(0, 12)
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(items))
}
const allTags = () => {
  const counts = new Map()
  for (const item of state.navigation) for (const tag of item.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1)
  for (const tool of state.tools) for (const tag of tool.tags || tool.keywords || []) counts.set(tag, (counts.get(tag) || 0) + 1)
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}
const toolStatus = tool => tool.status || (tool.enabled === false ? 'disabled' : 'active')
const formatBytes = bytes => `${(Number(bytes) / 1024).toFixed(Number(bytes) > 1024 * 1024 ? 0 : 1)}KB`
function toBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk))
  return btoa(binary)
}
const fileToPayload = async file => ({ filename: file.name, content: toBase64(new Uint8Array(await file.arrayBuffer())) })
function downloadBase64(filename, base64) {
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
const buildSandbox = permissions => ['allow-scripts',
  permissions.modals && 'allow-modals',
  permissions.download && 'allow-downloads',
  (permissions.externalLinks || permissions.popups) && 'allow-popups',
  (permissions.externalLinks || permissions.popups) && 'allow-popups-to-escape-sandbox',
  permissions.sameOrigin && 'allow-same-origin',
  'allow-forms',
].filter(Boolean).join(' ')

const PERMISSION_META = [
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

function showView(view) {
  document.querySelectorAll('[data-view-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.viewPanel === view))
  document.querySelectorAll('.nav-item[data-view]').forEach(item => item.classList.toggle('active', item.dataset.view === view))
  $('#page-title').textContent = i18n.t(`title.${view}`)
}

function openModal({ title, body, confirm = false }) {
  $('#modal-title').textContent = title
  $('#modal-body').replaceChildren(typeof body === 'string' ? text('p', body) : body)
  $('#modal-ok').hidden = !confirm
  $('#modal').hidden = false
  return new Promise(resolve => {
    const done = value => { $('#modal').hidden = true; $('#modal-ok').onclick = null; $('#modal-cancel').onclick = null; resolve(value) }
    $('#modal-cancel').onclick = () => done(false)
    $('#modal-ok').onclick = () => done(true)
  })
}

function renderSite() {
  const labels = { name: i18n.t('form.siteName'), title: i18n.t('form.title'), description: i18n.t('form.description'), github: i18n.t('form.github'), footer: i18n.t('form.footer'), logo: i18n.t('form.logo') }
  $('#site').replaceChildren(...Object.entries(labels).map(([name, label]) => input(name, state.site[name], label)), button(i18n.t('form.saveSite'), {}, 'ui-button ui-button-primary'))
}
function renderStats() {
  $('#stat-websites').textContent = state.navigation.length
  $('#stat-tools').textContent = state.tools.length || '—'
  $('#stat-categories').textContent = state.categories.length
  $('#stat-tags').textContent = allTags().length
  $('#activity-list').replaceChildren(...(readActivity().length ? readActivity().map(item => { const row = text('li', `${item.at.slice(0, 16).replace('T', ' ')} · ${item.message}`); return row }) : [text('li', i18n.t('dash.emptyRecent'))]))
}
function renderCategories() {
  $('#categories').replaceChildren(...state.categories.slice().sort((a, b) => a.order - b.order).map(category => {
    const row = document.createElement('div')
    row.className = 'row'
    row.append(text('strong', category.name), text('small', `${category.id} · ${category.icon} · order ${category.order}`))
    const actions = document.createElement('span')
    actions.append(button(i18n.t('table.edit'), { editCategory: category.id }), button(i18n.t('table.delete'), { deleteCategory: category.id }, 'ui-button ui-button-danger ui-button-sm'))
    row.append(actions)
    return row
  }))
}
function renderNavigation() {
  $('#navigation').replaceChildren(...state.navigation.slice().sort((a, b) => a.order - b.order).map(item => {
    const row = document.createElement('div')
    row.className = 'row'
    row.append(text('strong', `${item.name} ${item.enabled ? '' : i18n.t('table.disabled')}`), text('small', `${item.url} · ${item.category} · ${(item.tags || []).join(', ')}`))
    const actions = document.createElement('span')
    actions.append(button(i18n.t('table.edit'), { edit: item.id }), button(item.enabled ? i18n.t('table.disable') : i18n.t('table.enable'), { toggle: item.id }), button(i18n.t('table.delete'), { delete: item.id }, 'ui-button ui-button-danger ui-button-sm'))
    row.append(actions)
    return row
  }))
}
function renderTools() {
  $('#tools').replaceChildren(...state.tools.map(tool => {
    const row = document.createElement('tr')
    for (const value of [tool.id, `${tool.name}${tool.runtime === 'react' ? ' · core' : ''}`, `v${tool.version}`, `${tool.runtime}${tool.format ? ` / ${tool.format}` : ''}`]) row.append(text('td', value))
    const statusCell = el('td', '', '')
    statusCell.append(el('span', `badge badge-${toolStatus(tool)}`, toolStatus(tool)))
    row.append(statusCell)
    const actions = el('td', '', '')
    actions.append(button(i18n.t('table.inspect'), { inspect: tool.id }))
    if (tool.runtime !== 'react') {
      actions.append(
        button(i18n.t('lifecycle.edit'), { editTool: tool.id }),
        button(toolStatus(tool) === 'disabled' ? i18n.t('table.enable') : i18n.t('table.disable'), { toggleTool: tool.id }),
        button(i18n.t('lifecycle.overwrite'), { overwriteTool: tool.id }),
        button(i18n.t('lifecycle.export'), { exportTool: tool.id }),
        button(i18n.t('table.delete'), { deleteTool: tool.id }, 'ui-button ui-button-danger ui-button-sm'),
      )
    }
    row.append(actions)
    return row
  }))
}
function renderMarketplace() {
  const query = ($('#market-query').value || '').trim().toLowerCase()
  const category = $('#market-category').value || 'all'
  const categories = ['all', ...new Set(state.tools.map(tool => tool.category).filter(Boolean))]
  if ($('#market-category').options.length !== categories.length) {
    $('#market-category').replaceChildren(...categories.map(item => { const option = document.createElement('option'); option.value = item; option.textContent = item === 'all' ? i18n.t('market.all') : item; return option }))
    $('#market-category').value = category
  }
  const matched = state.tools.filter(tool => (category === 'all' || tool.category === category) && [tool.name, tool.description, tool.id, ...(tool.tags || []), ...(tool.keywords || [])].join(' ').toLowerCase().includes(query))
  if (!matched.length) { $('#marketplace').replaceChildren(text('p', i18n.t('market.empty'))); return }
  $('#marketplace').replaceChildren(...matched.map(tool => {
    const card = document.createElement('article')
    card.className = 'ui-card market-card'
    card.append(text('strong', tool.name), text('small', tool.description || tool.id), text('small', `v${tool.version} · ${tool.runtime} / ${tool.format || '-'} · ${tool.category || '-'} · ${toolStatus(tool)}`))
    card.append(button(i18n.t('table.inspect'), { inspect: tool.id }))
    return card
  }))
}
function renderTags() {
  $('#tags').replaceChildren(...allTags().map(([tag, count]) => {
    const row = document.createElement('div')
    row.className = 'row'
    row.append(text('strong', tag), text('small', `${count}`))
    row.append(button(i18n.t('table.delete'), { deleteTag: tag }, 'ui-button ui-button-danger ui-button-sm'))
    return row
  }))
}
function render() { renderSite(); renderStats(); renderCategories(); renderNavigation(); renderTools(); renderMarketplace(); renderTags(); i18n.apply() }

async function reload(message = i18n.t('msg.updated'), record = true) {
  const [navigation, categories, site] = await Promise.all([request('navigation'), request('categories'), request('site')])
  state.navigation = navigation
  state.categories = categories
  state.site = site
  try { state.tools = await request('tools') } catch { state.tools = [] }
  render()
  status(message)
  if (record) logActivity(message)
  renderStats()
}

async function rewriteTags(from, to) {
  for (const item of state.navigation) {
    const tags = (item.tags || []).map(tag => tag === from ? to : tag).filter(Boolean)
    const next = [...new Set(tags)]
    if (next.join(',') !== (item.tags || []).join(',')) await request(`navigation/${item.id}`, { method: 'PUT', body: JSON.stringify({ tags: next }) })
  }
}

function fill(form, item, tags = false) {
  for (const [key, value] of Object.entries(item)) {
    const fieldElement = form.elements[key]
    if (!fieldElement) continue
    if (fieldElement.type === 'checkbox') fieldElement.checked = Boolean(value)
    else fieldElement.value = tags && Array.isArray(value) ? value.join(', ') : value
  }
  form.elements.originalId.value = item.id
  form.querySelector('button').textContent = form.id === 'category-form' ? i18n.t('form.saveCategory') : i18n.t('form.saveWebsite')
  form.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

// ---------------- Import Wizard：识别 → 元数据 → 权限 → 兼容性 → 预览 → 导入 ----------------

const wizard = { step: 1, file: null, analysis: null, manifest: null, overwrite: false, busy: false }

function openWizard(file = null) {
  wizard.step = 1
  wizard.file = file
  wizard.analysis = null
  wizard.manifest = null
  wizard.overwrite = false
  $('#wizard').hidden = false
  renderWizard()
  if (file) analyzeWizardFile(file)
}

let wizardPreviewListener = null
const detachWizardPreview = () => { if (wizardPreviewListener) { window.removeEventListener('message', wizardPreviewListener); wizardPreviewListener = null } }

const closeWizard = () => { detachWizardPreview(); $('#wizard').hidden = true }
const wizardStatus = message => { $('#wizard-status').textContent = message || '' }

async function analyzeWizardFile(file) {
  if (!/\.(html?|zip)$/i.test(file.name)) { wizardStatus(i18n.t('wizard.badFile')); return }
  wizard.busy = true
  wizardStatus(i18n.t('wizard.analyzing'))
  try {
    const analysis = await request('tools/analyze', { method: 'POST', body: JSON.stringify(await fileToPayload(file)) })
    wizard.file = file
    wizard.analysis = analysis
    wizard.manifest = analysis.manifestDraft
    wizardStatus('')
  } catch (error) { wizardStatus(error.message); wizard.file = null }
  wizard.busy = false
  renderWizard()
}

function wizardDropzone() {
  const zone = el('div', 'dropzone wizard-dropzone')
  zone.tabIndex = 0
  zone.append(el('strong', '', i18n.t('tools.dropTitle')), el('small', '', i18n.t('tools.dropHint')))
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = '.html,.htm,.zip'
  fileInput.hidden = true
  zone.append(fileInput)
  zone.addEventListener('click', () => fileInput.click())
  zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('dragover') })
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'))
  zone.addEventListener('drop', event => {
    event.preventDefault()
    zone.classList.remove('dragover')
    const [file] = event.dataTransfer.files
    if (file) analyzeWizardFile(file)
  })
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) analyzeWizardFile(fileInput.files[0]) })
  return zone
}

function renderWizardStep1() {
  const body = $('#wizard-body')
  body.replaceChildren(wizardDropzone())
  if (wizard.analysis) {
    const { analysis } = wizard
    const summary = el('div', 'wizard-summary')
    const head = el('div', 'wizard-summary-head')
    head.append(
      el('span', `badge badge-format`, `${analysis.kind.toUpperCase()} → ${analysis.format}`),
      el('span', 'muted', i18n.t('wizard.entryIs', { entry: analysis.entry })),
      el('span', 'muted', `${analysis.files.length} ${i18n.t('wizard.files')} · ${formatBytes(analysis.stats.totalBytes)} / ${formatBytes(analysis.stats.zipBytes)}`),
    )
    summary.append(head)
    summary.append(el('p', '', i18n.t('wizard.detected', { name: analysis.suggested.name || analysis.suggested.id, id: analysis.suggested.id })))
    for (const note of analysis.notes) summary.append(el('p', 'wizard-note', `· ${note}`))
    const filesList = el('ul', 'wizard-files')
    for (const file of analysis.files.slice(0, 30)) filesList.append(el('li', '', file))
    if (analysis.files.length > 30) filesList.append(el('li', 'muted', `… +${analysis.files.length - 30}`))
    summary.append(filesList)
    body.append(summary)
  }
}

function renderWizardStep2() {
  const manifest = wizard.manifest
  const categoryOptions = [manifest.category, ...state.categories.map(item => item.id)].filter((value, index, list) => value && list.indexOf(value) === index).map(value => [value, value])
  const form = el('form', 'wizard-form')
  form.append(
    field('id', manifest.id, 'ID', { required: true, placeholder: 'my-tool' }),
    field('name', manifest.name, i18n.t('wizard.f.name'), { required: true }),
    field('description', manifest.description, i18n.t('wizard.f.description')),
    field('category', manifest.category, i18n.t('wizard.f.category'), { options: categoryOptions.length ? categoryOptions : [['development', 'development']] }),
    field('version', manifest.version, 'Version', { required: true, placeholder: '1.0.0' }),
    field('icon', manifest.icon, 'Icon', { placeholder: 'Wrench' }),
    field('author', manifest.author, 'Author'),
    field('license', manifest.license, 'License'),
    field('tags', (manifest.tags || []).join(', '), i18n.t('wizard.f.tags')),
    field('display.mode', manifest.display?.mode || 'embedded', i18n.t('wizard.f.displayMode'), { options: [['embedded', i18n.t('display.embedded')], ['workspace', i18n.t('display.workspace')], ['fullscreen', i18n.t('display.fullscreen')]] }),
    field('display.height', String(manifest.display?.height ?? 'auto'), i18n.t('wizard.f.height'), { placeholder: 'auto / 480' }),
    checkField('favorite', manifest.favorite, i18n.t('wizard.f.favorite')),
  )
  form.addEventListener('submit', event => event.preventDefault())
  $('#wizard-body').replaceChildren(form)
}

function collectWizardStep2() {
  const form = $('#wizard-body .wizard-form')
  if (!form) return false
  const data = Object.fromEntries(new FormData(form))
  const idPattern = /^[a-z0-9-]+$/
  if (!idPattern.test(String(data.id))) { wizardStatus(i18n.t('wizard.badId')); return false }
  if (!String(data.name).trim()) { wizardStatus(i18n.t('wizard.badName')); return false }
  if (!/^\d+\.\d+\.\d+/.test(String(data.version))) { wizardStatus(i18n.t('wizard.badVersion')); return false }
  const heightRaw = String(data['display.height']).trim().toLowerCase()
  const height = heightRaw === '' || heightRaw === 'auto' ? 'auto' : Math.min(5000, Math.max(120, Number(heightRaw) || 480))
  wizard.manifest = {
    ...wizard.manifest,
    id: String(data.id),
    name: String(data.name).trim(),
    description: String(data.description).trim(),
    category: String(data.category),
    version: String(data.version).trim(),
    icon: String(data.icon).trim() || 'Wrench',
    author: String(data.author).trim() || 'import',
    license: String(data.license).trim() || 'MIT',
    tags: String(data.tags).split(',').map(tag => tag.trim()).filter(Boolean),
    keywords: String(data.tags).split(',').map(tag => tag.trim()).filter(Boolean),
    favorite: form.elements.favorite.checked,
    display: { mode: ['embedded', 'workspace', 'fullscreen'].includes(data['display.mode']) ? data['display.mode'] : 'embedded', height },
  }
  return true
}

function renderWizardStep3() {
  const permissions = wizard.manifest.permissions
  const grid = el('div', 'perm-grid')
  for (const [key, labelKey, hintKey] of PERMISSION_META) grid.append(checkField(`perm.${key}`, permissions[key], i18n.t(labelKey), i18n.t(hintKey)))
  const sandboxPreview = el('p', 'wizard-note', `${i18n.t('wizard.sandbox')} ${buildSandbox(permissions)}`)
  sandboxPreview.className = 'wizard-sandbox'
  $('#wizard-body').replaceChildren(grid, sandboxPreview)
}

function collectWizardStep3() {
  const grid = $('#wizard-body .perm-grid')
  if (!grid) return false
  const permissions = { ...wizard.manifest.permissions }
  for (const [key] of PERMISSION_META) permissions[key] = grid.elements[`perm.${key}`].checked
  if (permissions.sameOrigin) wizardStatus(i18n.t('wizard.sameOriginWarning'))
  wizard.manifest = { ...wizard.manifest, permissions }
  return true
}

function renderWizardStep4() {
  const { analysis } = wizard
  const body = $('#wizard-body')
  body.replaceChildren(el('p', 'muted', i18n.t('wizard.compatHint')))
  if (!analysis.compat.length && !analysis.notes.length) body.append(el('p', 'check-ok', i18n.t('wizard.compatClean')))
  const list = el('ul', 'compat-list')
  for (const issue of analysis.compat) list.append(el('li', `compat-item compat-${issue.level}`, `${issue.level === 'warn' ? '⚠' : 'ℹ'} ${issue.message}`))
  for (const note of analysis.notes) list.append(el('li', 'compat-item compat-note', `· ${note}`))
  body.append(list)
}

function renderWizardStep5() {
  const { analysis, manifest } = wizard
  const body = $('#wizard-body')
  body.replaceChildren(el('p', 'muted', i18n.t('wizard.previewHint')))
  const bar = el('div', 'wizard-preview-bar')
  const heightSelect = document.createElement('select')
  heightSelect.className = 'ui-input'
  heightSelect.append(
    new Option(i18n.t('display.embedded'), 'embedded'),
    new Option(i18n.t('display.workspace'), 'workspace'),
    new Option(i18n.t('display.fullscreen'), 'fullscreen'),
  )
  heightSelect.value = manifest.display?.mode || 'embedded'
  const refresh = button(i18n.t('wizard.refresh'), {}, 'ui-button ui-button-ghost ui-button-sm')
  const openTab = button(i18n.t('wizard.openTab'), {}, 'ui-button ui-button-ghost ui-button-sm')
  bar.append(heightSelect, refresh, openTab)
  const frameWrap = el('div', 'wizard-preview-frame mode-embedded')
  const frame = document.createElement('iframe')
  const loadFrame = () => { frame.src = `${analysis.previewUrl}${analysis.previewUrl.includes('?') ? '&' : '?'}_=${Date.now()}` }
  frame.sandbox = buildSandbox(manifest.permissions)
  frame.title = manifest.name
  loadFrame()
  frameWrap.append(frame)
  heightSelect.addEventListener('change', () => { frameWrap.className = `wizard-preview-frame mode-${heightSelect.value}` })
  refresh.addEventListener('click', loadFrame)
  openTab.addEventListener('click', () => window.open(analysis.previewUrl, '_blank', 'noopener'))
  // 迷你 bridge：预览同样支持 resize 自动高度（embedded 模式）
  detachWizardPreview()
  wizardPreviewListener = event => {
    const data = event.data
    if (!data || data.source !== 'toolbox-bridge' || data.type !== 'resize') return
    if (event.source !== frame.contentWindow) return
    if (frameWrap.classList.contains('mode-embedded')) frame.style.height = `${Math.min(5000, Math.max(160, Math.round(Number(data.payload?.height) || 0)))}px`
  }
  window.addEventListener('message', wizardPreviewListener)
  body.append(bar, frameWrap)
}

function renderWizardStep6() {
  const { manifest } = wizard
  const exists = state.tools.some(tool => tool.id === manifest.id)
  const body = $('#wizard-body')
  const summary = el('ul', 'wizard-summary-list')
  for (const [label, value] of [
    ['ID', manifest.id], ['Name', manifest.name], ['Version', manifest.version],
    ['Runtime', 'static'], ['Format', wizard.analysis.format], ['Entry', manifest.entry],
    ['Category', manifest.category], ['Display', `${manifest.display.mode} / ${manifest.display.height}`],
    ['Permissions', Object.entries(manifest.permissions).filter(([, on]) => on).map(([key]) => key).join(', ') || i18n.t('wizard.none')],
  ]) summary.append(el('li', '', `${label}: ${value}`))
  body.replaceChildren(el('p', 'muted', i18n.t('wizard.importHint')), summary)
  if (exists) {
    const overwriteBox = checkField('overwrite', true, i18n.t('wizard.overwrite', { id: manifest.id }), i18n.t('wizard.overwriteHint'))
    body.append(overwriteBox)
  }
}

function renderWizard() {
  const steps = { 1: renderWizardStep1, 2: renderWizardStep2, 3: renderWizardStep3, 4: renderWizardStep4, 5: renderWizardStep5, 6: renderWizardStep6 }
  document.querySelectorAll('#wizard-steps li').forEach(item => {
    const step = Number(item.dataset.step)
    item.classList.toggle('active', step === wizard.step)
    item.classList.toggle('done', step < wizard.step)
  })
  steps[wizard.step]()
  $('#wizard-prev').disabled = wizard.step === 1
  $('#wizard-next').textContent = wizard.step === 6 ? i18n.t('wizard.import') : i18n.t('wizard.next')
  $('#wizard-next').disabled = wizard.busy || (wizard.step === 1 && !wizard.analysis)
}

async function wizardNext() {
  if (wizard.busy) return
  if (wizard.step === 2 && !collectWizardStep2()) return
  if (wizard.step === 3 && !collectWizardStep3()) return
  if (wizard.step < 6) {
    // 步骤 3 → 4 之间保留提示，但允许继续
    if (wizard.step === 3) wizardStatus('')
    wizard.step += 1
    wizardStatus('')
    renderWizard()
    return
  }
  const overwriteBox = $('#wizard-body [name="overwrite"]')
  const overwrite = Boolean(overwriteBox && overwriteBox.checked)
  wizard.busy = true
  wizardStatus(i18n.t('wizard.importing'))
  renderWizard()
  try {
    await request('tools/import', { method: 'POST', body: JSON.stringify({ token: wizard.analysis.token, manifest: wizard.manifest, overwrite }) })
    closeWizard()
    await reload(i18n.t('msg.imported'))
  } catch (error) {
    wizardStatus(error.message)
    wizard.busy = false
    renderWizard()
  }
}

function wizardPrev() {
  if (wizard.step > 1) { wizard.step -= 1; wizardStatus(''); renderWizard() }
}

$('#wizard-close').addEventListener('click', closeWizard)
$('#wizard-prev').addEventListener('click', wizardPrev)
$('#wizard-next').addEventListener('click', wizardNext)
$('#wizard').addEventListener('click', event => { if (event.target === $('#wizard')) closeWizard() })

// 主拖放区：拖入即开向导
const dropzone = $('#tool-dropzone')
const toolFileInput = $('#tool-file-input')
dropzone.addEventListener('click', () => toolFileInput.click())
dropzone.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toolFileInput.click() } })
dropzone.addEventListener('dragover', event => { event.preventDefault(); dropzone.classList.add('dragover') })
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'))
dropzone.addEventListener('drop', event => {
  event.preventDefault()
  dropzone.classList.remove('dragover')
  const [file] = event.dataTransfer.files
  if (file) openWizard(file)
})
toolFileInput.addEventListener('change', () => { if (toolFileInput.files[0]) { openWizard(toolFileInput.files[0]); toolFileInput.value = '' } })

$('#rebuild-index').addEventListener('click', async () => {
  try { const result = await request('tools/rebuild', { method: 'POST' }); await reload(i18n.t('msg.indexRebuilt', { count: String(result.count) })) } catch (error) { status(error.message) }
})

// ---------------- Tool Lifecycle：编辑 / 启停 / 覆盖 / 删除 / 导出 ----------------

let editingTool = null

function openToolEdit(tool) {
  editingTool = tool
  $('#tool-edit-title').textContent = i18n.t('toolEdit.title', { id: tool.id })
  const form = el('form', 'wizard-form tool-edit-form')
  form.append(
    field('name', tool.name, i18n.t('wizard.f.name'), { required: true }),
    field('description', tool.description, i18n.t('wizard.f.description')),
    field('category', tool.category, i18n.t('wizard.f.category')),
    field('version', tool.version, 'Version', { required: true }),
    field('icon', tool.icon, 'Icon'),
    field('tags', (tool.tags || []).join(', '), i18n.t('wizard.f.tags')),
    field('order', String(tool.order ?? 0), 'Order', { type: 'number' }),
    field('display.mode', tool.display?.mode || 'embedded', i18n.t('wizard.f.displayMode'), { options: [['embedded', i18n.t('display.embedded')], ['workspace', i18n.t('display.workspace')], ['fullscreen', i18n.t('display.fullscreen')]] }),
    field('display.height', String(tool.display?.height ?? 'auto'), i18n.t('wizard.f.height'), { placeholder: 'auto / 480' }),
    checkField('favorite', tool.favorite, i18n.t('wizard.f.favorite')),
  )
  form.addEventListener('submit', event => event.preventDefault())
  const heading = el('p', 'muted perm-heading', i18n.t('toolEdit.permissions'))
  const grid = el('div', 'perm-grid')
  for (const [key, labelKey, hintKey] of PERMISSION_META) grid.append(checkField(`perm.${key}`, tool.permissions?.[key], i18n.t(labelKey), i18n.t(hintKey)))
  $('#tool-edit-body').replaceChildren(form, heading, grid)
  $('#tool-edit').hidden = false
}

$('#tool-edit-cancel').addEventListener('click', () => { $('#tool-edit').hidden = true; editingTool = null })
$('#tool-edit-save').addEventListener('click', async () => {
  if (!editingTool) return
  const form = $('#tool-edit-body .tool-edit-form')
  const grid = $('#tool-edit-body .perm-grid')
  const data = Object.fromEntries(new FormData(form))
  const heightRaw = String(data['display.height']).trim().toLowerCase()
  const height = heightRaw === '' || heightRaw === 'auto' ? 'auto' : Math.min(5000, Math.max(120, Number(heightRaw) || 480))
  const permissions = {}
  for (const [key] of PERMISSION_META) permissions[key] = grid.elements[`perm.${key}`].checked
  const patch = {
    name: String(data.name).trim(),
    description: String(data.description).trim(),
    category: String(data.category).trim(),
    version: String(data.version).trim(),
    icon: String(data.icon).trim() || 'Wrench',
    tags: String(data.tags).split(',').map(tag => tag.trim()).filter(Boolean),
    order: Number(data.order) || 0,
    favorite: form.elements.favorite.checked,
    display: { mode: data['display.mode'], height },
    permissions,
  }
  try {
    await request(`tools/${encodeURIComponent(editingTool.id)}`, { method: 'PUT', body: JSON.stringify(patch) })
    $('#tool-edit').hidden = true
    editingTool = null
    await reload(i18n.t('msg.manifestSaved'))
  } catch (error) { status(error.message) }
})

async function overwriteToolFlow(tool) {
  const inputElement = document.createElement('input')
  inputElement.type = 'file'
  inputElement.accept = '.html,.htm,.zip'
  inputElement.addEventListener('change', async () => {
    const file = inputElement.files[0]
    if (!file) return
    status(i18n.t('wizard.analyzing'))
    try {
      const analysis = await request('tools/analyze', { method: 'POST', body: JSON.stringify(await fileToPayload(file)) })
      const manifest = { ...analysis.manifestDraft, id: tool.id, order: tool.order, favorite: tool.favorite }
      await request('tools/import', { method: 'POST', body: JSON.stringify({ token: analysis.token, manifest, overwrite: true }) })
      await reload(i18n.t('msg.overwrote', { id: tool.id }))
    } catch (error) { status(error.message) }
  })
  inputElement.click()
}

// ---------------- 全局事件 ----------------

$('#locale-select').addEventListener('change', event => i18n.setLocale(event.target.value))
$('#market-query').addEventListener('input', renderMarketplace)
$('#market-category').addEventListener('change', renderMarketplace)
$('#run-validate').addEventListener('click', async () => {
  try {
    const result = await request('validate')
    const summary = text('p', result.ok ? i18n.t('validate.ok') : i18n.t('validate.fail', { count: String(result.issues.length) }))
    summary.className = result.ok ? 'check-ok' : 'check-fail'
    $('#validate-result').replaceChildren(summary, ...result.issues.map(issue => text('p', issue)))
  } catch (error) { status(error.message) }
})
$('#site').addEventListener('submit', async event => {
  event.preventDefault()
  const data = Object.fromEntries(new FormData(event.target))
  try { await request('site', { method: 'PUT', body: JSON.stringify(data) }); await reload(i18n.t('msg.savedSite')) } catch (error) { status(error.message) }
})
$('#category-form').addEventListener('submit', async event => {
  event.preventDefault()
  const data = Object.fromEntries(new FormData(event.target))
  const originalId = data.originalId
  delete data.originalId
  data.order = Number(data.order)
  try {
    await request(originalId ? `categories/${originalId}` : 'categories', { method: originalId ? 'PUT' : 'POST', body: JSON.stringify(data) })
    event.target.reset()
    event.target.querySelector('button').textContent = i18n.t('form.addCategory')
    await reload(originalId ? i18n.t('msg.savedCategory') : i18n.t('msg.addedCategory'))
  } catch (error) { status(error.message) }
})
$('#nav-form').addEventListener('submit', async event => {
  event.preventDefault()
  const form = new FormData(event.target)
  const data = Object.fromEntries(form)
  const originalId = data.originalId
  delete data.originalId
  data.tags = data.tags.split(',').map(value => value.trim()).filter(Boolean)
  data.order = Number(data.order)
  data.enabled = form.has('enabled')
  try {
    await request(originalId ? `navigation/${originalId}` : 'navigation', { method: originalId ? 'PUT' : 'POST', body: JSON.stringify(data) })
    event.target.reset()
    event.target.querySelector('button').textContent = i18n.t('form.addWebsite')
    await reload(originalId ? i18n.t('msg.savedWebsite') : i18n.t('msg.addedWebsite'))
  } catch (error) { status(error.message) }
})
$('#tag-form').addEventListener('submit', async event => {
  event.preventDefault()
  const data = Object.fromEntries(new FormData(event.target))
  try { await rewriteTags(data.from.trim(), data.to.trim()); event.target.reset(); await reload(i18n.t('msg.renamedTag')) } catch (error) { status(error.message) }
})

document.addEventListener('click', async event => {
  const element = event.target.closest('button')
  if (!element) return
  if (element.dataset.view) return showView(element.dataset.view)
  try {
    if (element.dataset.edit) fill($('#nav-form'), state.navigation.find(item => item.id === element.dataset.edit), true)
    if (element.dataset.editCategory) fill($('#category-form'), state.categories.find(item => item.id === element.dataset.editCategory))
    if (element.dataset.inspect) {
      const tool = state.tools.find(item => item.id === element.dataset.inspect)
      const body = document.createElement('pre')
      body.textContent = JSON.stringify(tool, null, 2)
      await openModal({ title: i18n.t('modal.inspectTitle'), body })
    }
    if (element.dataset.editTool) openToolEdit(state.tools.find(item => item.id === element.dataset.editTool))
    if (element.dataset.toggleTool) {
      await request(`tools/${encodeURIComponent(element.dataset.toggleTool)}/toggle`, { method: 'POST' })
      await reload(i18n.t('msg.toggled'))
    }
    if (element.dataset.overwriteTool) await overwriteToolFlow(state.tools.find(item => item.id === element.dataset.overwriteTool))
    if (element.dataset.exportTool) {
      status(i18n.t('lifecycle.exporting'))
      const result = await request(`tools/${encodeURIComponent(element.dataset.exportTool)}/export`)
      downloadBase64(result.filename, result.content)
      await reload(i18n.t('msg.exported', { id: element.dataset.exportTool }), true)
    }
    if (element.dataset.deleteTool) {
      if (!await openModal({ title: i18n.t('modal.deleteTitle'), body: i18n.t('toolEdit.deleteBody', { id: element.dataset.deleteTool }), confirm: true })) return
      await request(`tools/${encodeURIComponent(element.dataset.deleteTool)}`, { method: 'DELETE' })
      await reload(i18n.t('msg.toolDeleted', { id: element.dataset.deleteTool }))
    }
    if (element.dataset.delete) {
      if (!await openModal({ title: i18n.t('modal.deleteTitle'), body: element.dataset.delete, confirm: true })) return
      await request(`navigation/${element.dataset.delete}`, { method: 'DELETE' })
      await reload(i18n.t('msg.deletedWebsite'))
    }
    if (element.dataset.toggle) {
      const item = state.navigation.find(entry => entry.id === element.dataset.toggle)
      await request(`navigation/${item.id}`, { method: 'PUT', body: JSON.stringify({ enabled: !item.enabled }) })
      await reload(i18n.t('msg.toggled'))
    }
    if (element.dataset.deleteCategory) {
      if (!await openModal({ title: i18n.t('modal.deleteTitle'), body: element.dataset.deleteCategory, confirm: true })) return
      await request(`categories/${element.dataset.deleteCategory}`, { method: 'DELETE' })
      await reload(i18n.t('msg.deletedCategory'))
    }
    if (element.dataset.deleteTag) {
      if (!await openModal({ title: i18n.t('modal.deleteTitle'), body: element.dataset.deleteTag, confirm: true })) return
      await rewriteTags(element.dataset.deleteTag, '')
      await reload(i18n.t('msg.deletedTag'))
    }
  } catch (error) { status(error.message) }
})

reload(i18n.t('localCms'), false).catch(error => status(error.message))
