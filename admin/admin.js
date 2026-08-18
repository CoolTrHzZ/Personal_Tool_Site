import { loadI18n } from './i18n/index.js'
import {
  buildSandbox, buildAllow, checkField, collectMetadataForm, collectPermissionsForm,
  field, renderMetadataForm, renderPermissionsForm,
} from './wizard-forms.js'
import { TAG_PAGE_SIZES, collectTagItems, filterTagItems, paginateTagItems, tagSourceLabel } from './tags-core.js'

const i18n = await loadI18n()
const $ = selector => document.querySelector(selector)
// 防御性绑定（v3.0.1 错误边界精神）：单个元素缺失只降级该功能并在控制台明确告警，
// 绝不让顶层初始化抛错导致整个 Admin 瘫痪（上次 #tag-source 缺失曾让所有导航失效）
const bind = (selector, event, handler) => {
  const node = $(selector)
  if (!node) { console.warn(`[admin] element missing: ${selector} (${event})`); return null }
  node.addEventListener(event, handler)
  return node
}
const ACTIVITY_KEY = 'adminActivity'
let state = { navigation: [], categories: [], site: {}, tools: [], tags: [], tagStats: { navigationTagCount: 0, toolTagCount: 0 } }
document.documentElement.lang = i18n.locale
if ($('#locale-select')) $('#locale-select').value = i18n.locale
i18n.apply()

const request = async (path, options) => {
  const response = await fetch(`/api/${path}`, { headers: { 'content-type': 'application/json' }, ...options })
  const data = await response.json()
  if (!response.ok) throw Error(data.error || i18n.t('msg.request'))
  return data
}
const text = (tag, value) => { const element = document.createElement(tag); element.textContent = value ?? ''; return element }
const el = (tag, className, value) => { const element = text(tag, value); if (className) element.className = className; return element }
const button = (label, data = {}, className = 'ui-button ui-button-ghost ui-button-sm') => {
  const element = document.createElement('button')
  element.type = 'button'
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
const readActivity = () => { try { const value = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || '[]'); return Array.isArray(value) ? value : [] } catch { return [] } }
const logActivity = message => {
  const items = [{ at: new Date().toISOString(), message }, ...readActivity()].slice(0, 12)
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(items))
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

// ---------------- Toast（v3.0.1：操作反馈不再常驻 Header，右上角 3 秒消失）----------------

function toast(message, level = 'success') {
  const host = $('#toasts')
  const item = el('div', `toast toast-${level}`, message)
  host.append(item)
  setTimeout(() => { item.classList.add('toast-out'); setTimeout(() => item.remove(), 200) }, 3000)
}
const toastError = message => toast(message, 'error')

function showView(view) {
  document.querySelectorAll('[data-view-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.viewPanel === view))
  document.querySelectorAll('.nav-item[data-view]').forEach(item => item.classList.toggle('active', item.dataset.view === view))
  $('#page-title').textContent = i18n.t(`title.${view}`)
}

function openModal({ title, body, confirm = false, okText }) {
  $('#modal-title').textContent = title
  $('#modal-body').replaceChildren(typeof body === 'string' ? text('p', body) : body)
  $('#modal-ok').hidden = !confirm
  if (okText) $('#modal-ok').textContent = okText
  $('#modal').hidden = false
  return new Promise(resolve => {
    const done = value => { $('#modal').hidden = true; $('#modal-ok').onclick = null; $('#modal-cancel').onclick = null; resolve(value) }
    $('#modal-cancel').onclick = () => done(false)
    $('#modal-ok').onclick = () => done(true)
  })
}

function openPromptModal({ title, label, value = '' }) {
  const inputBox = document.createElement('input')
  inputBox.className = 'ui-input'
  inputBox.value = value
  const wrapper = el('label', 'prompt-field', label)
  wrapper.append(inputBox)
  $('#modal-title').textContent = title
  $('#modal-body').replaceChildren(wrapper)
  $('#modal-ok').hidden = false
  $('#modal').hidden = false
  inputBox.focus()
  return new Promise(resolve => {
    const done = result => { $('#modal').hidden = true; $('#modal-ok').onclick = null; $('#modal-cancel').onclick = null; resolve(result) }
    $('#modal-cancel').onclick = () => done(null)
    $('#modal-ok').onclick = () => done(inputBox.value.trim())
  })
}

// ---------------- 各视图渲染 ----------------

function renderSite() {
  const labels = { name: i18n.t('form.siteName'), title: i18n.t('form.title'), description: i18n.t('form.description'), github: i18n.t('form.github'), footer: i18n.t('form.footer'), logo: i18n.t('form.logo') }
  const sections = [
    ['basic', ['name', 'title']],
    ['seo', ['description']],
    ['links', ['github']],
    ['appearance', ['logo', 'footer']],
  ]
  const form = $('#site')
  form.replaceChildren()
  for (const [sectionKey, names] of sections) {
    const section = el('fieldset', 'settings-section')
    section.append(el('legend', '', i18n.t(`settings.${sectionKey}`)))
    for (const name of names) section.append(input(name, state.site[name], labels[name]))
    form.append(section)
  }
  form.append(button(i18n.t('form.saveSite'), {}, 'ui-button ui-button-primary'))
}
function renderStats() {
  $('#stat-websites').textContent = state.navigation.length
  $('#stat-tools').textContent = state.tools.length || '—'
  $('#stat-categories').textContent = state.categories.length
  $('#stat-tags').textContent = state.tags.length
  $('#activity-list').replaceChildren(...(readActivity().length ? readActivity().map(item => text('li', `${item.at.slice(0, 16).replace('T', ' ')} · ${item.message}`)) : [text('li', i18n.t('dash.emptyRecent'))]))
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
  // 7 列：ID / 名称 / Version / Runtime / Format / 状态 / 操作（v3.0.1 三十一：列对齐修复）
  $('#tools').replaceChildren(...state.tools.map(tool => {
    const row = document.createElement('tr')
    for (const value of [tool.id, `${tool.name}${tool.runtime === 'react' ? ' · core' : ''}`, `v${tool.version}`, tool.runtime, tool.format || '-']) row.append(text('td', value))
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

// ---------------- 标签管理（v3.0.1：服务端数据源 + 搜索/筛选/排序/分页 + 详情 Drawer）----------------

const tagsView = { query: '', source: 'all', sort: 'usage', page: 1, pageSize: TAG_PAGE_SIZES[0], current: null }

function renderTags() {
  const filtered = filterTagItems(state.tags, tagsView)
  const page = paginateTagItems(filtered, tagsView.page, tagsView.pageSize)
  tagsView.page = page.page
  $('#tag-summary').textContent = i18n.t('tags.summary', { total: String(state.tags.length), sites: String(state.tagStats.navigationTagCount), tools: String(state.tagStats.toolTagCount) })
  const tbody = $('#tags')
  if (!page.items.length) {
    const row = document.createElement('tr')
    const cell = el('td', 'muted', i18n.t('tags.empty'))
    cell.colSpan = 4
    row.append(cell)
    tbody.replaceChildren(row)
  } else {
    tbody.replaceChildren(...page.items.map(item => {
      const row = document.createElement('tr')
      row.append(text('td', item.name), text('td', String(item.total)), text('td', i18n.t(`tags.source.${tagSourceLabel(item)}`)))
      const actions = el('td', '', '')
      actions.append(button(i18n.t('tags.view'), { viewTag: item.name }))
      row.append(actions)
      return row
    }))
  }
  const pager = $('#tag-pager')
  pager.replaceChildren()
  if (page.pageCount > 1) {
    const prev = button(i18n.t('tags.prev'), { tagPage: String(page.page - 1) }, 'ui-button ui-button-ghost ui-button-sm')
    prev.disabled = page.page === 1
    const next = button(i18n.t('tags.next'), { tagPage: String(page.page + 1) }, 'ui-button ui-button-ghost ui-button-sm')
    next.disabled = page.page === page.pageCount
    pager.append(prev, el('span', 'muted', `${page.page} / ${page.pageCount}`), next)
  }
}

function openTagDrawer(name) {
  const item = state.tags.find(entry => entry.name === name)
  if (!item) return
  tagsView.current = name
  const body = $('#tag-drawer-body')
  body.replaceChildren(el('h3', 'drawer-title', item.name), el('p', 'muted', i18n.t('tags.usageCount', { count: String(item.total) })))
  const toolSources = item.sources.filter(source => source.type === 'tool')
  const navigationSources = item.sources.filter(source => source.type === 'navigation')
  if (toolSources.length) {
    const section = el('div', 'drawer-section')
    section.append(el('h4', '', i18n.t('tags.usedByTools')))
    for (const source of toolSources) section.append(el('div', 'drawer-item', `${source.name} (${source.id})`))
    body.append(section)
  }
  if (navigationSources.length) {
    const section = el('div', 'drawer-section')
    section.append(el('h4', '', i18n.t('tags.usedBySites')))
    for (const source of navigationSources) section.append(el('div', 'drawer-item', `${source.name} (${source.id})`))
    body.append(section)
  }
  const actions = el('div', 'drawer-actions')
  actions.append(
    button(i18n.t('tags.renameBtn'), { renameTag: item.name }, 'ui-button ui-button-primary ui-button-sm'),
    button(i18n.t('tags.deleteBtn'), { deleteTag: item.name }, 'ui-button ui-button-danger ui-button-sm'),
  )
  body.append(actions)
  $('#tag-drawer').hidden = false
}

function render() { renderSite(); renderStats(); renderCategories(); renderNavigation(); renderTools(); renderMarketplace(); renderTags(); i18n.apply() }

async function reload(message = i18n.t('msg.updated'), record = true) {
  const [navigation, categories, site] = await Promise.all([request('navigation'), request('categories'), request('site')])
  state.navigation = navigation
  state.categories = categories
  state.site = site
  try { state.tools = await request('tools') } catch { state.tools = [] }
  try {
    const tagData = await request('tags')
    state.tags = tagData.items
    state.tagStats = { navigationTagCount: tagData.navigationTagCount, toolTagCount: tagData.toolTagCount }
  } catch {
    state.tags = collectTagItems(state)
    state.tagStats = {
      navigationTagCount: state.tags.filter(item => item.navigationCount > 0).length,
      toolTagCount: state.tags.filter(item => item.toolCount > 0).length,
    }
  }
  render()
  if (message) toast(message)
  if (record) logActivity(message)
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

// ---------------- Import Wizard：StepRegistry + WizardState + 错误边界（v3.0.1 P0）----------------

const wizard = { step: 1, file: null, analysis: null, manifest: null, overwrite: false, busy: false, error: null, warning: null, notice: null, previewReady: false }

let wizardPreviewListener = null
const detachWizardPreview = () => { if (wizardPreviewListener) { window.removeEventListener('message', wizardPreviewListener); wizardPreviewListener = null } }

function openWizard(file = null) {
  Object.assign(wizard, { step: 1, file: null, analysis: null, manifest: null, overwrite: false, busy: false, error: null, warning: null, notice: null, previewReady: false })
  $('#wizard').hidden = false
  renderWizard()
  if (file) analyzeWizardFile(file)
}

// 关闭向导必须清理服务端 staging（v3.0.1 十一）
async function closeWizard() {
  detachWizardPreview()
  const token = wizard.analysis?.token
  Object.assign(wizard, { step: 1, file: null, analysis: null, manifest: null, overwrite: false, busy: false, error: null, warning: null, notice: null, previewReady: false })
  $('#wizard').hidden = true
  if (token) await request(`tools/staging/${token}`, { method: 'DELETE' }).catch(() => {})
}

async function analyzeWizardFile(file) {
  if (!/\.(html?|zip)$/i.test(file.name)) { wizard.error = i18n.t('wizard.badFile'); renderWizard(); return }
  wizard.busy = true
  wizard.error = null
  renderWizard()
  try {
    const analysis = await request('tools/analyze', { method: 'POST', body: JSON.stringify(await fileToPayload(file)) })
    wizard.file = file
    wizard.analysis = analysis
    wizard.manifest = analysis.manifestDraft
  } catch (error) { wizard.error = error.message; wizard.file = null }
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
  if (!wizard.analysis) return
  const { analysis } = wizard
  const summary = el('div', 'wizard-summary')
  const head = el('div', 'wizard-summary-head')
  head.append(
    el('span', 'badge badge-format', `${analysis.kind.toUpperCase()} → ${analysis.format}`),
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

function renderWizardStep2() {
  const form = renderMetadataForm(document, { manifest: wizard.manifest, categories: state.categories, t: i18n.t })
  $('#wizard-body').replaceChildren(form)
}

function collectWizardStep2() {
  const result = collectMetadataForm($('#wizard-body .wizard-form'), wizard.manifest)
  if (!result.ok) { wizard.error = i18n.t(`wizard.${result.code}`); return false }
  wizard.manifest = result.manifest
  return true
}

function renderWizardStep3() {
  const body = $('#wizard-body')
  const sandboxPreview = el('p', 'wizard-sandbox', `${i18n.t('wizard.sandbox')} ${buildSandbox(wizard.manifest.permissions)}`)
  const form = renderPermissionsForm(document, {
    permissions: wizard.manifest.permissions,
    t: i18n.t,
    onChange: permissions => {
      sandboxPreview.textContent = `${i18n.t('wizard.sandbox')} ${buildSandbox(permissions)}`
      wizard.warning = permissions.sameOrigin ? i18n.t('wizard.sameOriginWarning') : null
    },
  })
  body.replaceChildren(form, sandboxPreview)
}

function collectWizardStep3() {
  const result = collectPermissionsForm($('#wizard-body form.perm-grid'), wizard.manifest.permissions)
  if (!result.ok) {
    wizard.error = result.key ? i18n.t('wizard.permMissing', { key: result.key }) : i18n.t('wizard.formFail')
    return false
  }
  wizard.manifest = { ...wizard.manifest, permissions: result.permissions }
  // 警告进入独立状态位，不再被下一步清空（v3.0.1 六）
  wizard.warning = result.permissions.sameOrigin ? i18n.t('wizard.sameOriginWarning') : null
  return true
}

function renderWizardStep4() {
  const { analysis } = wizard
  const body = $('#wizard-body')
  body.replaceChildren(el('p', 'muted', i18n.t('wizard.compatHint')))
  // sameOrigin 等危险提示必须保留到用户确认（v3.0.1 六）
  if (wizard.warning) body.append(el('p', 'wizard-warning-box', `⚠ ${wizard.warning}`))
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
  for (const [value, label] of [['embedded', i18n.t('display.embedded')], ['workspace', i18n.t('display.workspace')], ['fullscreen', i18n.t('display.fullscreen')]]) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    heightSelect.append(option)
  }
  heightSelect.value = manifest.display?.mode || 'embedded'
  const refresh = button(i18n.t('wizard.refresh'), {}, 'ui-button ui-button-ghost ui-button-sm')
  const openTab = button(i18n.t('wizard.openTab'), {}, 'ui-button ui-button-ghost ui-button-sm')
  bar.append(heightSelect, refresh, openTab)
  const frameWrap = el('div', 'wizard-preview-frame mode-embedded')
  const frame = document.createElement('iframe')
  const loadFrame = () => { frame.src = `${analysis.previewUrl}${analysis.previewUrl.includes('?') ? '&' : '?'}_=${Date.now()}` }
  frame.sandbox = buildSandbox(manifest.permissions)
  // Permissions Policy：clipboard 权限需要 iframe allow 显式授予（v3.0.1 三十二）
  const allow = buildAllow(manifest.permissions)
  if (allow) frame.setAttribute('allow', allow)
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
  if (wizard.warning) body.append(el('p', 'wizard-warning-box', `⚠ ${wizard.warning}`))
  if (exists) body.append(checkField(document, 'overwrite', true, i18n.t('wizard.overwrite', { id: manifest.id }), i18n.t('wizard.overwriteHint')))
}

// Step Registry（v3.0.1 三十六/三十七）：render / collect / validate 统一注册，不再散落 if
const WIZARD_STEPS = {
  1: {
    render: renderWizardStep1,
    validate: () => {
      if (!wizard.analysis) { wizard.error = wizard.error || i18n.t('wizard.needAnalyze'); return false }
      return true
    },
  },
  2: { render: renderWizardStep2, collect: collectWizardStep2 },
  3: { render: renderWizardStep3, collect: collectWizardStep3 },
  4: { render: renderWizardStep4 },
  5: {
    render: renderWizardStep5,
    validate: () => {
      if (!wizard.analysis?.previewUrl) { wizard.error = i18n.t('wizard.previewUnavailable'); return false }
      wizard.previewReady = true
      return true
    },
  },
  6: { render: renderWizardStep6 },
}

function renderWizardStatus() {
  const node = $('#wizard-status')
  node.className = 'wizard-status'
  if (wizard.error) { node.classList.add('wizard-status-error'); node.textContent = wizard.error; return }
  if (wizard.warning) { node.classList.add('wizard-status-warning'); node.textContent = wizard.warning; return }
  if (wizard.busy) { node.textContent = wizard.step === 1 ? i18n.t('wizard.analyzing') : i18n.t('wizard.importing'); return }
  node.textContent = ''
}

function renderWizard() {
  document.querySelectorAll('#wizard-steps li').forEach(item => {
    const step = Number(item.dataset.step)
    item.classList.toggle('active', step === wizard.step)
    item.classList.toggle('done', step < wizard.step)
  })
  WIZARD_STEPS[wizard.step]?.render()
  $('#wizard-prev').disabled = wizard.step === 1
  $('#wizard-next').textContent = wizard.step === 6 ? i18n.t('wizard.import') : i18n.t('wizard.next')
  $('#wizard-next').disabled = wizard.busy || (wizard.step === 1 && !wizard.analysis)
  renderWizardStatus()
}

async function runWizardImport() {
  const overwriteBox = $('#wizard-body [name="overwrite"]')
  const overwrite = Boolean(overwriteBox && overwriteBox.checked)
  wizard.busy = true
  wizard.error = null
  renderWizard()
  try {
    await request('tools/import', { method: 'POST', body: JSON.stringify({ token: wizard.analysis.token, manifest: wizard.manifest, overwrite }) })
    await closeWizard()
    await reload(i18n.t('msg.imported'))
  } catch (error) {
    // 导入失败保留 analysis / manifest / staging token，允许直接重试（v3.0.1 三十八）
    wizard.error = error.message
    wizard.busy = false
    renderWizard()
  }
}

async function wizardNext() {
  if (wizard.busy) return
  const current = WIZARD_STEPS[wizard.step]
  if (!current) return
  if (current.collect && !current.collect()) { renderWizardStatus(); return }
  if (current.validate && !current.validate()) { renderWizardStatus(); return }
  if (wizard.step < 6) {
    wizard.step += 1
    wizard.error = null
    renderWizard()
    return
  }
  await runWizardImport()
}

function wizardPrev() {
  if (wizard.step <= 1) return
  wizard.step -= 1
  wizard.error = null
  renderWizard()
}

// 顶层错误边界（v3.0.1 四）：任何 DOM/逻辑异常都必须给用户可见反馈，而不是按钮无响应
const wizardGuard = error => {
  console.error('[ImportWizard]', error)
  wizard.busy = false
  wizard.error = error instanceof Error ? error.message : i18n.t('wizard.unknownError')
  renderWizard()
}
bind('#wizard-close', 'click', () => { closeWizard().catch(() => {}) })
bind('#wizard-prev', 'click', () => { try { wizardPrev() } catch (error) { wizardGuard(error) } })
bind('#wizard-next', 'click', async () => { try { await wizardNext() } catch (error) { wizardGuard(error) } })
bind('#wizard', 'click', event => { if (event.target === $('#wizard')) closeWizard().catch(() => {}) })

// 主拖放区：拖入即开向导
const dropzone = $('#tool-dropzone')
const toolFileInput = $('#tool-file-input')
if (dropzone && toolFileInput) {
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
} else console.warn('[admin] dropzone missing')

bind('#rebuild-index', 'click', async () => {
  try { const result = await request('tools/rebuild', { method: 'POST' }); await reload(i18n.t('msg.indexRebuilt', { count: String(result.count) })) } catch (error) { toastError(error.message) }
})

// ---------------- Tool Lifecycle：编辑 / 启停 / 覆盖 / 删除 / 导出 ----------------

let editingTool = null

function openToolEdit(tool) {
  editingTool = tool
  $('#tool-edit-title').textContent = i18n.t('toolEdit.title', { id: tool.id })
  const form = el('form', 'wizard-form tool-edit-form')
  form.append(
    field(document, 'name', tool.name, i18n.t('wizard.f.name'), { required: true }),
    field(document, 'description', tool.description, i18n.t('wizard.f.description')),
    field(document, 'category', tool.category, i18n.t('wizard.f.category')),
    field(document, 'version', tool.version, 'Version', { required: true }),
    field(document, 'icon', tool.icon, 'Icon'),
    field(document, 'tags', (tool.tags || []).join(', '), i18n.t('wizard.f.tags')),
    field(document, 'order', String(tool.order ?? 0), 'Order', { type: 'number' }),
    field(document, 'display.mode', tool.display?.mode || 'embedded', i18n.t('wizard.f.displayMode'), { options: [['embedded', i18n.t('display.embedded')], ['workspace', i18n.t('display.workspace')], ['fullscreen', i18n.t('display.fullscreen')]] }),
    field(document, 'display.height', String(tool.display?.height ?? 'auto'), i18n.t('wizard.f.height'), { placeholder: 'auto / 480' }),
    checkField(document, 'favorite', tool.favorite, i18n.t('wizard.f.favorite')),
  )
  form.addEventListener('submit', event => event.preventDefault())
  const heading = el('p', 'muted perm-heading', i18n.t('toolEdit.permissions'))
  const permForm = renderPermissionsForm(document, { permissions: tool.permissions || {}, t: i18n.t })
  $('#tool-edit-body').replaceChildren(form, heading, permForm)
  $('#tool-edit').hidden = false
}

bind('#tool-edit-cancel', 'click', () => { $('#tool-edit').hidden = true; editingTool = null })
bind('#tool-edit-save', 'click', async () => {
  if (!editingTool) return
  try {
    const form = $('#tool-edit-body .tool-edit-form')
    const permForm = $('#tool-edit-body form.perm-grid')
    const data = Object.fromEntries(new FormData(form))
    const permResult = collectPermissionsForm(permForm, editingTool.permissions || {})
    if (!permResult.ok) throw new Error(permResult.key ? i18n.t('wizard.permMissing', { key: permResult.key }) : i18n.t('wizard.formFail'))
    const heightRaw = String(data['display.height']).trim().toLowerCase()
    const height = heightRaw === '' || heightRaw === 'auto' ? 'auto' : Math.min(5000, Math.max(120, Number(heightRaw) || 480))
    const patch = {
      name: String(data.name).trim(),
      description: String(data.description).trim(),
      category: String(data.category).trim(),
      version: String(data.version).trim(),
      icon: String(data.icon).trim() || 'Wrench',
      tags: String(data.tags).split(',').map(tag => tag.trim()).filter(Boolean),
      order: Number(data.order) || 0,
      favorite: form.elements.namedItem('favorite') instanceof HTMLInputElement ? form.elements.namedItem('favorite').checked : false,
      display: { mode: data['display.mode'], height },
      permissions: permResult.permissions,
    }
    await request(`tools/${encodeURIComponent(editingTool.id)}`, { method: 'PUT', body: JSON.stringify(patch) })
    $('#tool-edit').hidden = true
    editingTool = null
    await reload(i18n.t('msg.manifestSaved'))
  } catch (error) { toastError(error.message) }
})

async function overwriteToolFlow(tool) {
  const inputElement = document.createElement('input')
  inputElement.type = 'file'
  inputElement.accept = '.html,.htm,.zip'
  inputElement.addEventListener('change', async () => {
    const file = inputElement.files[0]
    if (!file) return
    toast(i18n.t('wizard.analyzing'))
    try {
      const analysis = await request('tools/analyze', { method: 'POST', body: JSON.stringify(await fileToPayload(file)) })
      const manifest = { ...analysis.manifestDraft, id: tool.id, order: tool.order, favorite: tool.favorite }
      await request('tools/import', { method: 'POST', body: JSON.stringify({ token: analysis.token, manifest, overwrite: true }) })
      await reload(i18n.t('msg.overwrote', { id: tool.id }))
    } catch (error) { toastError(error.message) }
  })
  inputElement.click()
}

// ---------------- 标签工具栏事件 ----------------

bind('#tag-query', 'input', event => { tagsView.query = event.target.value; tagsView.page = 1; renderTags() })
bind('#tag-source', 'change', event => { tagsView.source = event.target.value; tagsView.page = 1; renderTags() })
bind('#tag-sort', 'change', event => { tagsView.sort = event.target.value; tagsView.page = 1; renderTags() })
bind('#tag-size', 'change', event => { tagsView.pageSize = Number(event.target.value) || 20; tagsView.page = 1; renderTags() })
bind('#tag-drawer-close', 'click', () => { $('#tag-drawer').hidden = true; tagsView.current = null })

// ---------------- 全局事件 ----------------

bind('#locale-select', 'change', event => i18n.setLocale(event.target.value))
bind('#market-query', 'input', renderMarketplace)
bind('#market-category', 'change', renderMarketplace)
bind('#run-validate', 'click', async () => {
  try {
    const result = await request('validate')
    const summary = text('p', result.ok ? i18n.t('validate.ok') : i18n.t('validate.fail', { count: String(result.issues.length) }))
    summary.className = result.ok ? 'check-ok' : 'check-fail'
    $('#validate-result').replaceChildren(summary, ...result.issues.map(issue => text('p', issue)))
  } catch (error) { toastError(error.message) }
})
bind('#site', 'submit', async event => {
  event.preventDefault()
  const data = Object.fromEntries(new FormData(event.target))
  try { await request('site', { method: 'PUT', body: JSON.stringify(data) }); await reload(i18n.t('msg.savedSite')) } catch (error) { toastError(error.message) }
})
bind('#category-form', 'submit', async event => {
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
  } catch (error) { toastError(error.message) }
})
bind('#nav-form', 'submit', async event => {
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
  } catch (error) { toastError(error.message) }
})

document.addEventListener('click', async event => {
  const element = event.target.closest('button')
  if (!element) return
  if (element.dataset.view) return showView(element.dataset.view)
  try {
    if (element.dataset.tagPage) { tagsView.page = Number(element.dataset.tagPage) || 1; renderTags(); return }
    if (element.dataset.viewTag) { openTagDrawer(element.dataset.viewTag); return }
    if (element.dataset.renameTag) {
      const from = element.dataset.renameTag
      const to = await openPromptModal({ title: i18n.t('tags.renameTitle'), label: i18n.t('tags.renameTo', { name: from }), value: from })
      if (!to || to === from) return
      const result = await request('tags/rename', { method: 'POST', body: JSON.stringify({ from, to }) })
      $('#tag-drawer').hidden = true
      await reload(i18n.t('msg.tagRenamed', { count: String(result.affected) }))
      return
    }
    if (element.dataset.deleteTag) {
      const name = element.dataset.deleteTag
      const item = state.tags.find(entry => entry.name === name)
      const body = i18n.t('tags.deleteBody', { name, tools: String(item?.toolCount || 0), sites: String(item?.navigationCount || 0) })
      if (!await openModal({ title: i18n.t('modal.deleteTitle'), body, confirm: true })) return
      const result = await request(`tags/${encodeURIComponent(name)}`, { method: 'DELETE' })
      $('#tag-drawer').hidden = true
      await reload(i18n.t('msg.tagDeleted', { count: String(result.affected) }))
      return
    }
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
      const result = await request(`tools/${encodeURIComponent(element.dataset.exportTool)}/export`)
      downloadBase64(result.filename, result.content)
      await reload(i18n.t('msg.exported', { id: element.dataset.exportTool }))
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
  } catch (error) { toastError(error.message) }
})

reload('', false).catch(error => toastError(error.message))
