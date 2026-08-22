import { loadI18n } from './i18n/index.js'
import { renderMarkdown } from './markdown.js'
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
let state = { navigation: [], categories: [], site: {}, tools: [], library: [], notes: [], tags: [], tagStats: { navigationTagCount: 0, toolTagCount: 0 } }
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
const input = (name, value, label, required = true) => {
  const wrapper = document.createElement('label')
  wrapper.className = 'ui-field'
  const caption = document.createElement('span')
  caption.className = 'ui-field-label'
  caption.textContent = label || name
  const element = document.createElement('input')
  element.name = name
  element.value = value ?? ''
  element.required = required
  element.className = 'ui-input'
  wrapper.append(caption, element)
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
const adminScene = { dashboard: 'dash', websites: 'nav', library: 'nav', notes: 'cms', 'note-editor': 'cms', tools: 'tools', marketplace: 'market', categories: 'nav', tags: 'cms', settings: 'form', validate: 'cms', import: 'form' }
let currentView = 'dashboard'

function showView(view) {
  currentView = view
  document.querySelectorAll('[data-view-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.viewPanel === view))
  const navView = view === 'note-editor' ? 'notes' : view
  document.querySelectorAll('.nav-item[data-view]').forEach(item => item.classList.toggle('active', item.dataset.view === navView))
  $('#page-title').textContent = i18n.t(`title.${view}`)
  const title = $('#page-title')
  title.classList.remove('title-swap')
  void title.offsetWidth
  title.classList.add('title-swap')
  if ($('#page-telemetry')) $('#page-telemetry').textContent = `index · tools ${state.tools.length} · websites ${state.navigation.length} · System Online`
  $('.carbon-fx')?.setAttribute('data-scene', adminScene[view] || 'cms')
  closeEditorDrawer()
  if ($('#tag-drawer')) $('#tag-drawer').hidden = true
  if (view === 'import') $('#tool-dropzone')?.focus()
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

let settingsTab = 'general'
function renderSite() {
  const labels = {
    name: i18n.t('form.siteName'), title: i18n.t('form.title'), description: i18n.t('form.description'), github: i18n.t('form.github'),
    footer: i18n.t('form.footer'), logo: i18n.t('form.logo'), tagline: i18n.t('form.tagline'),
    publicUrl: i18n.t('form.publicUrl'), basePath: i18n.t('form.basePath'), adminUrl: i18n.t('form.adminUrl'),
  }
  const form = $('#site')
  const extra = $('#settings-extra')
  document.querySelectorAll('.settings-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.settingsTab === settingsTab))
  form.replaceChildren()
  extra.replaceChildren()
  if (settingsTab === 'general') {
    form.hidden = false
    for (const name of ['name', 'tagline', 'title', 'description', 'github']) form.append(input(name, state.site[name], labels[name]))
    form.append(button(i18n.t('form.saveSite'), {}, 'ui-button ui-button-primary'))
    return
  }
  if (settingsTab === 'appearance') {
    form.hidden = false
    for (const name of ['logo', 'footer']) form.append(input(name, state.site[name], labels[name]))
    form.append(button(i18n.t('form.saveSite'), {}, 'ui-button ui-button-primary'))
    return
  }
  if (settingsTab === 'deploy') {
    form.hidden = false
    form.append(el('p', 'muted', i18n.t('form.deployHint')))
    for (const name of ['publicUrl', 'basePath', 'adminUrl']) form.append(input(name, state.site[name], labels[name], name !== 'publicUrl'))
    form.append(button(i18n.t('form.saveSite'), {}, 'ui-button ui-button-primary'))
    return
  }
  form.hidden = true
  if (settingsTab === 'data') {
    extra.append(el('p', 'muted', i18n.t('tools.indexHint')), button(i18n.t('tools.rebuild'), {}, 'ui-button ui-button-ghost'))
    extra.querySelector('button').id = 'rebuild-index-settings'
    extra.querySelector('button').addEventListener('click', () => $('#rebuild-index')?.click())
  }
  if (settingsTab === 'backup') {
    extra.append(el('p', 'muted', '导出当前 JSON 配置（真实数据）。恢复请使用对应 PUT 接口或手动替换文件。'))
    const exportBtn = button('导出导航 / 分类 / 站点 JSON', {}, 'ui-button ui-button-primary')
    exportBtn.addEventListener('click', () => {
      const payload = { navigation: state.navigation, categories: state.categories, site: state.site }
      const link = document.createElement('a')
      link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
      link.download = 'devos-backup.json'
      link.click()
    })
    extra.append(exportBtn)
  }
  if (settingsTab === 'about') extra.append(el('p', '', `${state.site.name || 'DevOS'}`), el('p', 'muted', state.site.tagline || ''), el('p', 'muted', state.site.publicUrl || i18n.t('form.publicUrlEmpty')), el('p', 'muted', `v${$('#app-version')?.textContent || ''}`))
}
function renderStats() {
  $('#stat-websites').textContent = state.navigation.length
  $('#stat-tools').textContent = state.tools.length || '—'
  $('#stat-categories').textContent = state.categories.length
  $('#stat-tags').textContent = state.tags.length
  const enabledTools = state.tools.filter(tool => tool.enabled !== false).length
  const fills = {
    tools: state.tools.length ? enabledTools / state.tools.length : 0,
    websites: state.navigation.length ? state.navigation.filter(item => item.enabled !== false).length / state.navigation.length : 0,
    categories: state.categories.length ? 1 : 0,
    tags: state.tags.length ? 1 : 0,
  }
  document.querySelectorAll('[data-fill]').forEach(node => node.style.setProperty('--fill', String(fills[node.dataset.fill] ?? 0)))
  const items = readActivity()
  $('#activity-list').replaceChildren(...(items.length ? items.map(item => {
    const row = document.createElement('li')
    row.append(el('small', '', String(item.at || '').slice(0, 16).replace('T', ' ')), el('span', '', item.message || ''))
    return row
  }) : [el('li', 'activity-empty', i18n.t('dash.emptyRecent'))]))
}
function chips(values) {
  const wrap = el('div', 'tag-chips')
  const items = values.filter(Boolean)
  if (!items.length) wrap.append(el('span', 'tag-chip tag-chip-empty', '—'))
  else for (const value of items) wrap.append(el('span', 'tag-chip', value))
  return wrap
}
function kebab(actions) {
  const wrap = el('div', 'kebab')
  const toggle = button('⋯', {}, 'ui-button ui-button-ghost ui-button-sm kebab-toggle')
  toggle.setAttribute('aria-label', '更多操作')
  const menu = el('div', 'kebab-menu')
  menu.hidden = true
  for (const action of actions) menu.append(action)
  toggle.addEventListener('click', event => {
    event.stopPropagation()
    const willOpen = menu.hidden
    document.querySelectorAll('.kebab-menu').forEach(node => { node.hidden = true })
    if (!willOpen) return
    document.body.append(menu)
    menu.hidden = false
    const box = toggle.getBoundingClientRect()
    const top = box.bottom + 8 + menu.offsetHeight > innerHeight - 8 ? box.top - menu.offsetHeight - 8 : box.bottom + 8
    const left = Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, box.right - menu.offsetWidth))
    menu.style.top = `${Math.max(8, top)}px`
    menu.style.left = `${left}px`
  })
  wrap.append(toggle)
  return wrap
}

function inspectTool(tool) {
  const sheet = el('dl', 'inspect-sheet')
  const rows = [
    ['ID', tool.id], ['Name', tool.name], ['Runtime', tool.runtime], ['Format', tool.format || '—'],
    ['Version', tool.version], ['Status', toolStatus(tool)], ['Category', tool.category || '—'],
    ['Updated', tool.updated || '—'], ['Tags', (tool.tags || []).join(', ') || '—'],
  ]
  for (const [label, value] of rows) {
    sheet.append(el('dt', '', label), el('dd', '', String(value ?? '—')))
  }
  const raw = el('details', 'inspect-raw')
  raw.append(el('summary', '', '原始 JSON'))
  const pre = document.createElement('pre')
  pre.textContent = JSON.stringify({
    id: tool.id, name: tool.name, description: tool.description, category: tool.category, version: tool.version,
    enabled: tool.enabled, runtime: tool.runtime, format: tool.format, status: tool.status, updated: tool.updated,
    tags: tool.tags || [], display: tool.display, permissions: tool.permissions,
  }, null, 2)
  raw.append(pre)
  const wrap = el('div', '', '')
  wrap.append(sheet, raw)
  return wrap
}

function renderCategories() {
  $('#categories').replaceChildren(...state.categories.slice().sort((a, b) => a.order - b.order).map(category => {
    const sites = state.navigation.filter(item => item.category === category.id).length
    const tools = state.tools.filter(item => item.category === category.id).length
    const row = document.createElement('tr')
    row.append(text('td', category.name), text('td', category.id), text('td', String(sites)), text('td', String(tools)))
    const actions = el('td', 'cell-actions', '')
    actions.append(kebab([
      button(i18n.t('table.edit'), { editCategory: category.id }),
      button(i18n.t('table.delete'), { deleteCategory: category.id }, 'ui-button ui-button-danger ui-button-sm'),
    ]))
    row.append(actions)
    return row
  }))
}
function matchedWebsites() {
  const q = ($('#website-query')?.value || '').toLowerCase()
  const category = $('#website-category')?.value || 'all'
  const status = $('#website-status')?.value || 'all'
  return state.navigation.filter(item => {
    const blob = `${item.name} ${item.url} ${item.id} ${(item.tags || []).join(' ')}`.toLowerCase()
    const statusOk = status === 'all' || (status === 'enabled' ? item.enabled : !item.enabled)
    const categoryOk = category === 'all' || item.category === category
    return (!q || blob.includes(q)) && statusOk && categoryOk
  }).sort((a, b) => a.order - b.order)
}
function renderNavigation() {
  if ($('#website-category')) {
    const current = $('#website-category').value || 'all'
    const options = [['all', '全部分类'], ...state.categories.map(item => [item.id, item.name])]
    $('#website-category').replaceChildren(...options.map(([value, label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; return option }))
    $('#website-category').value = options.some(([value]) => value === current) ? current : 'all'
  }
  $('#navigation').replaceChildren(...matchedWebsites().map(item => {
    const row = document.createElement('tr')
    const url = el('td', 'cell-url', item.url)
    url.title = item.url
    const tags = el('td', 'cell-tags', '')
    tags.append(chips(item.tags || []))
    const name = text('td', item.name)
    name.className = 'cell-tool'
    name.title = item.name
    row.append(name, url, text('td', item.category), tags, text('td', item.enabled ? i18n.t('table.enable') : i18n.t('table.disable')))
    const actions = el('td', 'cell-actions', '')
    actions.append(kebab([
      button(i18n.t('table.edit'), { edit: item.id }),
      button(item.enabled ? i18n.t('table.disable') : i18n.t('table.enable'), { toggle: item.id }),
      button(i18n.t('table.delete'), { delete: item.id }, 'ui-button ui-button-danger ui-button-sm'),
    ]))
    row.append(actions)
    return row
  }))
}
function renderLibrary() {
  const table = $('#library')
  if (!table) return
  table.replaceChildren(...(state.library || []).slice().sort((a, b) => a.order - b.order).map(item => {
    const row = document.createElement('tr')
    const url = el('td', 'cell-url', item.url)
    url.title = item.url
    const tags = el('td', 'cell-tags', '')
    tags.append(chips(item.tags || []))
    const name = text('td', item.name)
    name.className = 'cell-tool'
    name.title = item.name
    row.append(name, url, text('td', item.kind === 'skill' ? 'Skill' : '仓库'), tags, text('td', item.enabled ? i18n.t('table.enable') : i18n.t('table.disable')))
    const actions = el('td', 'cell-actions', '')
    actions.append(kebab([
      button(i18n.t('table.edit'), { editLibrary: item.id }),
      button(item.enabled ? i18n.t('table.disable') : i18n.t('table.enable'), { toggleLibrary: item.id }),
      button(i18n.t('table.delete'), { deleteLibrary: item.id }, 'ui-button ui-button-danger ui-button-sm'),
    ]))
    row.append(actions)
    return row
  }))
}
function renderNotes() {
  const table = $('#notes')
  if (!table) return
  table.replaceChildren(...(state.notes || []).slice().sort((a, b) => a.order - b.order).map(item => {
    const row = document.createElement('tr')
    const title = text('td', item.title)
    title.className = 'cell-tool'
    title.title = item.title
    const summary = text('td', item.summary || '')
    summary.title = item.summary || ''
    row.append(title, summary, text('td', item.updated || '—'), text('td', item.enabled ? i18n.t('table.enable') : i18n.t('table.disable')))
    const actions = el('td', 'cell-actions', '')
    actions.append(kebab([
      button(i18n.t('table.edit'), { editNote: item.id }),
      button(item.enabled ? i18n.t('table.disable') : i18n.t('table.enable'), { toggleNote: item.id }),
      button(i18n.t('table.delete'), { deleteNote: item.id }, 'ui-button ui-button-danger ui-button-sm'),
    ]))
    row.append(actions)
    return row
  }))
}
function renderTools() {
  $('#tools').replaceChildren(...state.tools.map(tool => {
    const row = document.createElement('tr')
    const nameCell = el('td', 'cell-tool')
    nameCell.title = `${tool.name} · ${tool.id}`
    nameCell.append(el('strong', '', tool.name), el('small', '', tool.id))
    row.append(nameCell, text('td', tool.runtime), text('td', tool.format || '-'), text('td', `v${tool.version}`), text('td', toolStatus(tool)), text('td', tool.updated || '—'))
    const actions = el('td', 'cell-actions', '')
    const items = [button(i18n.t('table.inspect'), { inspect: tool.id })]
    if (tool.runtime !== 'react') {
      items.push(
        button(i18n.t('lifecycle.edit'), { editTool: tool.id }),
        button(toolStatus(tool) === 'disabled' ? i18n.t('table.enable') : i18n.t('table.disable'), { toggleTool: tool.id }),
        button(i18n.t('lifecycle.overwrite'), { overwriteTool: tool.id }),
        button(i18n.t('lifecycle.export'), { exportTool: tool.id }),
        button(i18n.t('table.delete'), { deleteTool: tool.id }, 'ui-button ui-button-danger ui-button-sm'),
      )
    }
    actions.append(kebab(items))
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
  closeEditorDrawer()
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
  armOutside($('#tag-drawer'), () => { $('#tag-drawer').hidden = true; tagsView.current = null })
}

function render() { renderSite(); renderStats(); renderCategories(); renderNavigation(); renderLibrary(); renderNotes(); renderTools(); renderMarketplace(); renderTags(); i18n.apply() }

async function reload(message = i18n.t('msg.updated'), record = true) {
  const [navigation, categories, site] = await Promise.all([request('navigation'), request('categories'), request('site')])
  state.navigation = navigation
  state.categories = categories
  state.site = site
  try { state.library = await request('library') } catch { state.library = [] }
  try { state.notes = await request('notes') } catch { state.notes = [] }
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

let stopOutside = null
function armOutside(node, close) {
  stopOutside?.()
  requestAnimationFrame(() => {
    const onDoc = event => {
      if (!node || node.hidden || node.contains(event.target) || event.target.closest('.kebab-menu, .ui-modal-backdrop, .wizard-backdrop')) return
      close()
      stopOutside?.()
    }
    stopOutside = () => { document.removeEventListener('click', onDoc); stopOutside = null }
    document.addEventListener('click', onDoc)
  })
}

function closeEditorDrawer() {
  $('#editor-drawer').hidden = true
  $('#nav-form').hidden = true
  $('#category-form').hidden = true
  if ($('#library-form')) $('#library-form').hidden = true
}
function hideEditorForms() {
  $('#nav-form').hidden = true
  $('#category-form').hidden = true
  if ($('#library-form')) $('#library-form').hidden = true
}
function openWebsiteDrawer(item) {
  if ($('#tag-drawer')) $('#tag-drawer').hidden = true
  hideEditorForms()
  const form = $('#nav-form')
  form.hidden = false
  $('#editor-drawer-title').textContent = item ? i18n.t('form.saveWebsite') : i18n.t('form.addWebsite')
  if (item) fill(form, item, true)
  else { form.reset(); form.elements.originalId.value = ''; form.querySelector('button').textContent = i18n.t('form.saveWebsite') }
  $('#editor-drawer').hidden = false
  armOutside($('#editor-drawer'), closeEditorDrawer)
}
function openCategoryDrawer(item) {
  if ($('#tag-drawer')) $('#tag-drawer').hidden = true
  hideEditorForms()
  const form = $('#category-form')
  form.hidden = false
  $('#editor-drawer-title').textContent = item ? i18n.t('form.saveCategory') : i18n.t('form.addCategory')
  if (item) fill(form, item)
  else { form.reset(); form.elements.originalId.value = ''; form.querySelector('button').textContent = i18n.t('form.saveCategory') }
  $('#editor-drawer').hidden = false
  armOutside($('#editor-drawer'), closeEditorDrawer)
}
function readNoteForm() {
  const form = $('#note-studio-form')
  if (!form) return null
  const data = Object.fromEntries(new FormData(form))
  const originalId = data.originalId
  delete data.originalId
  data.tags = String(data.tags || '').split(',').map(value => value.trim()).filter(Boolean)
  data.order = Number(data.order)
  data.enabled = new FormData(form).has('enabled')
  data.summary = data.summary || ''
  data.body = data.body || ''
  data.updated = data.updated || new Date().toISOString().slice(0, 10)
  return { originalId, data }
}
function fillNoteStudio(item) {
  const form = $('#note-studio-form')
  if (!form) return
  form.reset()
  if (item) fill(form, item, true)
  else {
    form.elements.originalId.value = ''
    form.elements.updated.value = new Date().toISOString().slice(0, 10)
    form.elements.order.value = '10'
    form.elements.enabled.checked = true
    form.elements.body.value = '# 标题\n\n在左侧写 Markdown，右侧即时预览。\n'
  }
  refreshNotePreview()
  syncNoteJson()
  setNoteTab('write')
}
function refreshNotePreview() {
  const preview = $('#note-preview')
  if (!preview) return
  const html = renderMarkdown($('#note-body')?.value || '')
  preview.innerHTML = html || `<p class="muted">${i18n.t('notes.emptyPreview')}</p>`
}
function syncNoteJson() {
  const pack = readNoteForm()
  if (!pack || !$('#note-json')) return
  $('#note-json').value = JSON.stringify(pack.data, null, 2)
}
function applyNoteJson() {
  let parsed
  try { parsed = JSON.parse($('#note-json').value) } catch { throw new Error(i18n.t('notes.jsonInvalid')) }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(i18n.t('notes.jsonInvalid'))
  const form = $('#note-studio-form')
  const current = form.elements.originalId.value
  fill(form, {
    id: parsed.id || '',
    title: parsed.title || '',
    summary: parsed.summary || '',
    tags: parsed.tags || [],
    order: Number.isFinite(parsed.order) ? parsed.order : 10,
    updated: parsed.updated || '',
    body: parsed.body || '',
    enabled: parsed.enabled !== false,
  }, true)
  form.elements.originalId.value = current
  refreshNotePreview()
}
function setNoteTab(tab) {
  document.querySelectorAll('[data-note-tab]').forEach(button => button.classList.toggle('active', button.dataset.noteTab === tab))
  if ($('#note-tab-write')) $('#note-tab-write').hidden = tab !== 'write'
  if ($('#note-tab-json')) $('#note-tab-json').hidden = tab !== 'json'
  if (tab === 'json') syncNoteJson()
  if (tab === 'write') refreshNotePreview()
}
function insertMarkdown(kind) {
  const ta = $('#note-body')
  if (!ta) return
  const snippets = {
    h2: '## 标题\n',
    list: '- 列表项\n',
    link: '[文字](https://example.com)\n',
    code: '```\ncode\n```\n',
  }
  const insert = snippets[kind]
  if (!insert) return
  const start = ta.selectionStart
  const end = ta.selectionEnd
  ta.setRangeText(insert, start, end, 'end')
  ta.focus()
  refreshNotePreview()
}
function openNoteStudio(item) {
  closeEditorDrawer()
  if ($('#tag-drawer')) $('#tag-drawer').hidden = true
  fillNoteStudio(item)
  $('#note-studio-title').textContent = item ? i18n.t('form.saveNote') : i18n.t('form.addNote')
  showView('note-editor')
  $('#note-body')?.focus()
}
function openLibraryDrawer(item) {
  if ($('#tag-drawer')) $('#tag-drawer').hidden = true
  hideEditorForms()
  const form = $('#library-form')
  form.hidden = false
  $('#editor-drawer-title').textContent = item ? i18n.t('form.saveLibrary') : i18n.t('form.addLibrary')
  if (item) fill(form, item, true)
  else { form.reset(); form.elements.originalId.value = ''; form.elements.kind.value = 'repo' }
  $('#editor-drawer').hidden = false
  armOutside($('#editor-drawer'), closeEditorDrawer)
}

function fill(form, item, tags = false) {
  for (const [key, value] of Object.entries(item)) {
    const fieldElement = form.elements[key]
    if (!fieldElement) continue
    if (fieldElement.type === 'checkbox') fieldElement.checked = Boolean(value)
    else fieldElement.value = tags && Array.isArray(value) ? value.join(', ') : value
  }
  form.elements.originalId.value = item.id
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
  body.replaceChildren(el('strong', 'compat-grade', analysis.compat.some(issue => issue.level === 'warn') ? 'B' : 'A'), el('p', 'muted', `${analysis.compat.length} 项诊断来自 HTML Runtime 分析器`))
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
  const frameWrap = el('div', 'wizard-preview-frame mode-embedded')
  const viewport = el('div', 'viewport-switch')
  for (const [width, label] of [[1440, 'Desktop'], [768, 'Tablet'], [390, 'Mobile']]) {
    const item = button(label, {}, 'ui-button ui-button-ghost ui-button-sm')
    item.addEventListener('click', () => { frameWrap.style.maxWidth = `${width}px`; frameWrap.style.margin = '0 auto' })
    viewport.append(item)
  }
  const refresh = button(i18n.t('wizard.refresh'), {}, 'ui-button ui-button-ghost ui-button-sm')
  const openTab = button(i18n.t('wizard.openTab'), {}, 'ui-button ui-button-ghost ui-button-sm')
  bar.append(heightSelect, viewport, refresh, openTab)
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
  const dialog = $('.wizard')
  dialog.classList.remove('wizard-md', 'wizard-lg', 'wizard-preview')
  dialog.classList.add(wizard.step === 5 ? 'wizard-preview' : wizard.step === 3 ? 'wizard-lg' : 'wizard-md')
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
    showView('tools')
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
  const identity = el('section', 'edit-block')
  identity.append(el('p', 'edit-kicker', 'IDENTITY'), form)
  const access = el('section', 'edit-block')
  access.append(el('p', 'edit-kicker', i18n.t('toolEdit.permissions')), renderPermissionsForm(document, { permissions: tool.permissions || {}, t: i18n.t }))
  $('#tool-edit-body').replaceChildren(identity, access)
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
bind('#editor-drawer-close', 'click', closeEditorDrawer)
bind('#admin-menu', 'click', () => {
  const shell = $('.admin-shell')
  const open = shell.classList.toggle('nav-open')
  $('#admin-menu').setAttribute('aria-expanded', String(open))
})
bind('#website-query', 'input', renderNavigation)
bind('#website-category', 'change', renderNavigation)
bind('#website-status', 'change', renderNavigation)
bind('#nav-cancel', 'click', closeEditorDrawer)
bind('#library-cancel', 'click', closeEditorDrawer)
bind('#category-cancel', 'click', closeEditorDrawer)
bind('#note-body', 'input', () => { refreshNotePreview() })
bind('#note-studio-form', 'input', event => {
  if (event.target.id === 'note-json') return
  if (currentView === 'note-editor' && event.target.id !== 'note-body') syncNoteJson()
})
bind('#note-studio-form', 'submit', event => { event.preventDefault(); $('#note-save')?.click() })
bind('#note-save', 'click', async () => {
  const pack = readNoteForm()
  if (!pack) return
  if (!pack.data.id || !pack.data.title) { toastError(i18n.t('notes.needFields')); return }
  try {
    await withBusy($('#note-save'), async () => {
      await request(pack.originalId ? `notes/${pack.originalId}` : 'notes', { method: pack.originalId ? 'PUT' : 'POST', body: JSON.stringify(pack.data) })
      await reload(pack.originalId ? i18n.t('msg.savedNote') : i18n.t('msg.addedNote'))
      showView('notes')
    })
  } catch (error) { toastError(error.message) }
})
bind('#note-json-apply', 'click', () => {
  try { applyNoteJson(); setNoteTab('write'); toast(i18n.t('notes.jsonApplied')) } catch (error) { toastError(error.message) }
})
document.querySelectorAll('.settings-tab').forEach(tab => tab.addEventListener('click', () => { settingsTab = tab.dataset.settingsTab; renderSite() }))
document.addEventListener('click', event => {
  if (event.target.closest('.kebab, .kebab-menu')) return
  document.querySelectorAll('.kebab-menu').forEach(menu => { menu.hidden = true })
})
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return
  document.querySelectorAll('.kebab-menu').forEach(menu => { menu.hidden = true })
  if ($('#modal') && !$('#modal').hidden) { $('#modal-cancel')?.click(); return }
  if ($('#tool-edit') && !$('#tool-edit').hidden) { $('#tool-edit-cancel')?.click(); return }
  if ($('#wizard') && !$('#wizard').hidden) { closeWizard().catch(() => {}); return }
  if (currentView === 'note-editor') return
  closeEditorDrawer()
  if ($('#tag-drawer')) { $('#tag-drawer').hidden = true; tagsView.current = null }
})
window.addEventListener('resize', () => document.querySelectorAll('.kebab-menu').forEach(menu => { menu.hidden = true }))
bind('#tag-drawer-close', 'click', () => { $('#tag-drawer').hidden = true; tagsView.current = null })
bind('#modal', 'click', event => { if (event.target.id === 'modal') $('#modal-cancel')?.click() })
bind('#tool-edit', 'click', event => { if (event.target.id === 'tool-edit') $('#tool-edit-cancel')?.click() })

// ---------------- 全局事件 ----------------

bind('#locale-select', 'change', event => i18n.setLocale(event.target.value))
bind('#market-query', 'input', renderMarketplace)
bind('#market-category', 'change', renderMarketplace)
bind('#run-validate', 'click', async () => {
  try {
    const result = await request('validate')
    const table = document.createElement('table')
    table.className = 'ui-table'
    const head = document.createElement('thead')
    const headRow = document.createElement('tr')
    for (const label of ['规则', '状态', '描述', '操作']) headRow.append(text('th', label))
    head.append(headRow)
    const body = document.createElement('tbody')
    if (result.ok) {
      const row = document.createElement('tr')
      row.append(text('td', 'data_integrity'), text('td', '通过'), text('td', i18n.t('validate.ok')), text('td', ''))
      body.append(row)
    } else {
      for (const issue of result.issues) {
        const row = document.createElement('tr')
        const action = button(i18n.t('validate.run'), {}, 'ui-button ui-button-ghost ui-button-sm')
        action.addEventListener('click', () => $('#run-validate')?.click())
        row.append(text('td', 'validator'), text('td', '失败'), text('td', issue))
        const cell = el('td', '', '')
        cell.append(action)
        row.append(cell)
        body.append(row)
      }
    }
    table.append(head, body)
    $('#validate-result').replaceChildren(table)
  } catch (error) { toastError(error.message) }
})
const withBusy = async (form, fn) => {
  const submit = form.matches?.('button') ? form : form.querySelector('button[type="submit"], button.ui-button-primary')
  const previous = submit?.textContent
  if (submit) { submit.disabled = true; submit.textContent = i18n.t('form.saving') }
  try { return await fn() } finally { if (submit) { submit.disabled = false; submit.textContent = previous } }
}
bind('#site', 'submit', async event => {
  event.preventDefault()
  const data = Object.fromEntries(new FormData(event.target))
  try { await withBusy(event.target, async () => { await request('site', { method: 'PUT', body: JSON.stringify({ ...state.site, ...data }) }); await reload(i18n.t('msg.savedSite')) }) } catch (error) { toastError(error.message) }
})
bind('#category-form', 'submit', async event => {
  event.preventDefault()
  const data = Object.fromEntries(new FormData(event.target))
  const originalId = data.originalId
  delete data.originalId
  data.order = Number(data.order)
  try {
    await withBusy(event.target, async () => {
      await request(originalId ? `categories/${originalId}` : 'categories', { method: originalId ? 'PUT' : 'POST', body: JSON.stringify(data) })
      event.target.reset()
      closeEditorDrawer()
      await reload(originalId ? i18n.t('msg.savedCategory') : i18n.t('msg.addedCategory'))
    })
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
    await withBusy(event.target, async () => {
      await request(originalId ? `navigation/${originalId}` : 'navigation', { method: originalId ? 'PUT' : 'POST', body: JSON.stringify(data) })
      event.target.reset()
      closeEditorDrawer()
      await reload(originalId ? i18n.t('msg.savedWebsite') : i18n.t('msg.addedWebsite'))
    })
  } catch (error) { toastError(error.message) }
})
bind('#library-form', 'submit', async event => {
  event.preventDefault()
  const form = new FormData(event.target)
  const data = Object.fromEntries(form)
  const originalId = data.originalId
  delete data.originalId
  data.tags = String(data.tags || '').split(',').map(value => value.trim()).filter(Boolean)
  data.order = Number(data.order)
  data.enabled = form.has('enabled')
  data.language = data.language || ''
  data.description = data.description || ''
  try {
    await withBusy(event.target, async () => {
      await request(originalId ? `library/${originalId}` : 'library', { method: originalId ? 'PUT' : 'POST', body: JSON.stringify(data) })
      event.target.reset()
      closeEditorDrawer()
      await reload(originalId ? i18n.t('msg.savedLibrary') : i18n.t('msg.addedLibrary'))
    })
  } catch (error) { toastError(error.message) }
})
document.addEventListener('click', async event => {
  const element = event.target.closest('button')
  if (!element) return
  if (element.dataset.view) return showView(element.dataset.view)
  if (element.dataset.noteTab) { setNoteTab(element.dataset.noteTab); return }
  if (element.dataset.md) { insertMarkdown(element.dataset.md); return }
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
    if (element.dataset.addWebsite) { openWebsiteDrawer(); return }
    if (element.dataset.addLibrary) { openLibraryDrawer(); return }
    if (element.dataset.addNote) { openNoteStudio(); return }
    if (element.dataset.addCategory) { openCategoryDrawer(); return }
    if (element.dataset.edit) { openWebsiteDrawer(state.navigation.find(item => item.id === element.dataset.edit)); return }
    if (element.dataset.editLibrary) { openLibraryDrawer(state.library.find(item => item.id === element.dataset.editLibrary)); return }
    if (element.dataset.editNote) { openNoteStudio(state.notes.find(item => item.id === element.dataset.editNote)); return }
    if (element.dataset.editCategory) { openCategoryDrawer(state.categories.find(item => item.id === element.dataset.editCategory)); return }
    if (element.dataset.inspect) {
      document.querySelectorAll('.kebab-menu').forEach(menu => { menu.hidden = true })
      const tool = state.tools.find(item => item.id === element.dataset.inspect)
      if (tool) await openModal({ title: i18n.t('modal.inspectTitle'), body: inspectTool(tool) })
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
    if (element.dataset.toggleLibrary) {
      const item = state.library.find(entry => entry.id === element.dataset.toggleLibrary)
      await request(`library/${item.id}`, { method: 'PUT', body: JSON.stringify({ enabled: !item.enabled }) })
      await reload(i18n.t('msg.toggled'))
    }
    if (element.dataset.toggleNote) {
      const item = state.notes.find(entry => entry.id === element.dataset.toggleNote)
      await request(`notes/${item.id}`, { method: 'PUT', body: JSON.stringify({ enabled: !item.enabled }) })
      await reload(i18n.t('msg.toggled'))
    }
    if (element.dataset.deleteLibrary) {
      if (!await openModal({ title: i18n.t('modal.deleteTitle'), body: element.dataset.deleteLibrary, confirm: true })) return
      await request(`library/${element.dataset.deleteLibrary}`, { method: 'DELETE' })
      await reload(i18n.t('msg.deletedLibrary'))
    }
    if (element.dataset.deleteNote) {
      if (!await openModal({ title: i18n.t('modal.deleteTitle'), body: element.dataset.deleteNote, confirm: true })) return
      await request(`notes/${element.dataset.deleteNote}`, { method: 'DELETE' })
      await reload(i18n.t('msg.deletedNote'))
    }
    if (element.dataset.deleteCategory) {
      if (!await openModal({ title: i18n.t('modal.deleteTitle'), body: element.dataset.deleteCategory, confirm: true })) return
      await request(`categories/${element.dataset.deleteCategory}`, { method: 'DELETE' })
      await reload(i18n.t('msg.deletedCategory'))
    }
  } catch (error) { toastError(error.message) }
})

reload('', false).then(() => request('system').then(info => {
  if ($('#app-version')) $('#app-version').textContent = `v${info.version}`
  if ($('#sidebar-version')) $('#sidebar-version').textContent = `v${info.version}`
}).catch(() => {})).catch(error => toastError(error.message))

const carbon = $('.carbon-fx')
carbon?.addEventListener('pointermove', event => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const box = carbon.getBoundingClientRect()
  carbon.style.setProperty('--mx', `${((event.clientX - box.left) / box.width) * 100}%`)
  carbon.style.setProperty('--my', `${((event.clientY - box.top) / box.height) * 100}%`)
})
