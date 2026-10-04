import { createSessionRecovery } from './session-recovery.js'
import { loadI18n } from './i18n/index.js'
import { renderMarkdown } from './markdown.js'
import {
  buildSandbox, buildAllow, checkField, collectMetadataForm, collectPermissionsForm,
  field, renderMetadataForm, renderPermissionsForm,
} from './wizard-forms.js'
import { TAG_PAGE_SIZES, collectTagItems, filterTagItems, paginateTagItems, tagSourceLabel } from './tags-core.js'
import { commitTagPicker, mountTagPicker } from './tag-picker.js'
import { ICON_NAMES, createIconSvg } from './icon-catalog.js'
import { mountTechField } from '/shared/tech-field.js'
import { mountCfgLibrary } from './cfg-library.js'
import { createEditProtection } from './edit-protection.js'
import { mountQuickCollect } from './quick-collect.js'
import { mountCollectionLayout, aiSetupGuide } from './collection-flow.js'
import { mountSiteDisplayPreview } from './site-display-preview.js'
import { assistForm, showFormError } from './form-assistance.js'
import { mountSiteManagement } from './site-management.js'
import { mountContentCollections } from './content-collections.js'
import { noteKinds, runbookTemplates } from '/shared/runbook-templates.js'
import { DISPLAY_PAGES, pageVisible } from '/shared/page-display.js'

const readPreference = (key, fallback) => { try { return localStorage.getItem(key) || fallback } catch { return fallback } }
let themePreference = readPreference('theme', 'dark')
if (!['dark', 'light', 'system'].includes(themePreference)) themePreference = 'dark'
const systemTheme = matchMedia('(prefers-color-scheme: dark)')
function applyAdminTheme() {
  const preference = themePreference
  const dark = preference === 'dark' || (preference === 'system' && systemTheme.matches)
  const theme = dark ? 'dark' : 'light'
  document.documentElement.dataset.theme = theme
  let themeColor = document.querySelector('meta[name="theme-color"]')
  if (!themeColor) {
    themeColor = document.createElement('meta')
    themeColor.name = 'theme-color'
    document.head.append(themeColor)
  }
  themeColor.content = window.getComputedStyle(document.documentElement).getPropertyValue('--surface-page').trim()
  const select = document.querySelector('#admin-theme')
  if (select) select.value = preference
}

applyAdminTheme()
systemTheme.addEventListener('change', applyAdminTheme)
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
let state = { navigation: [], categories: [], site: {}, tools: [], library: [], aiResources: [], notes: [], projects: [], cfgs: [], aiWorkflows: [], tags: [], system: null, validation: null, loadErrors: [] }
document.documentElement.lang = i18n.locale
if ($('#locale-select')) $('#locale-select').value = i18n.locale
i18n.apply()
for (const field of document.querySelectorAll('.visual-picker-field input[type="hidden"]')) {
  field.type = 'text'; field.hidden = true; field.dataset.restoreValue = 'true'
}
if (i18n.locale === 'en-US') {
  $('#admin-preview').textContent = 'Local preview ↗'
  $('#admin-theme').setAttribute('aria-label', 'Admin theme')
  ;['Dark', 'Light', 'System'].forEach((label, index) => { $('#admin-theme').options[index].textContent = label })
}

const authSession = {}
const authRecovery = createSessionRecovery({ session: authSession })
if (!await authRecovery.recover()) { location.replace('/admin/login.html'); await new Promise(() => {}) }
let reauthenticating
const preserveModal = async action => {
  const modal = $('#modal'), body = $('#modal-body'), ok = $('#modal-ok'), cancel = $('#modal-cancel')
  const saved = !modal.hidden && !body.querySelector('input[type="password"]') ? { title: $('#modal-title').textContent, nodes: [...body.childNodes], okHidden: ok.hidden, okText: ok.textContent, okClick: ok.onclick, cancelClick: cancel.onclick } : null
  try { return await action() }
  finally { if (saved) { $('#modal-title').textContent = saved.title; body.replaceChildren(...saved.nodes); ok.hidden = saved.okHidden; ok.textContent = saved.okText; ok.onclick = saved.okClick; cancel.onclick = saved.cancelClick; modal.hidden = false } }
}
const verifyPassword = () => {
  reauthenticating ||= preserveModal(async () => {
    const body=el('div'),password=document.createElement('input'),label=el('label','ui-field')
    password.type='password';password.autocomplete='current-password';password.className='ui-input';password.maxLength=512
    label.append(el('span','ui-field-label','管理员密码'),password);body.append(el('p','','此操作需要重新验证密码，设备记忆到期时间不会延长。'),label)
    if (!await openModal({title:'重新验证密码',body,confirm:true,okText:'验证密码'})) throw Error('已取消密码验证，操作尚未执行')
    const value=password.value;password.value=''
    if (!value) throw Error('请输入密码')
    authRecovery.cancel()
    await request('auth/reauth',{method:'POST',body:JSON.stringify({password:value})})
  }).finally(()=>{reauthenticating=null;authRecovery.resumeTimer()})
  return reauthenticating
}
const confirmSensitive = path => preserveModal(() => openModal({ title: '再次确认操作', body: `密码已验证。确认${({ 'publishing/publish': '发布到 GitHub Pages', 'backup/restore': '恢复此备份', 'auth/remember': '记住此浏览器 7 天' })[path] || '执行此操作'}？`, confirm: true, okText: '确认执行' }))
const request = async (path, options = {}) => {
  if (authRecovery.suppressed && path !== 'auth/logout') throw Error('已暂停自动登录恢复，请使用密码登录后再操作')
  const sendRequest=async()=>{
    const generation=authRecovery.generation
    const response=await fetch(`/api/${path}`,{...options,headers:{'content-type':'application/json',...(authSession.csrf ? {'x-csrf-token':authSession.csrf}:{}),...options.headers}})
    let data
    try { data = await response.json() }
    catch { throw Error(i18n.t('msg.invalidResponse', { status: String(response.status) })) }
    if (generation!==authRecovery.generation && path!=='auth/logout') throw Error('登录状态已更新，请重新确认此操作')
    return {response,data}
  }
  let {response,data}=await sendRequest()
  if (!authRecovery.suppressed && (response.status===401 && path!=='auth/reauth' || response.status===403 && data?.code==='CSRF_MISMATCH')) {
    if (await authRecovery.recover()) {
      if (!['GET','HEAD'].includes((options.method || 'GET').toUpperCase())) throw Error('登录已恢复，原操作结果尚未确认。请先检查结果，再重新确认执行；草稿仍保留。')
      ;({response,data}=await sendRequest())
    }
  }
  if (response.status===401) throw Error(path==='auth/reauth' ? data?.error || '密码验证未通过，操作尚未执行' : '会话已失效。草稿仍保留，请恢复登录后重新操作')
  if (response.status===428 && data?.code==='REAUTH_REQUIRED') {
    await verifyPassword()
    if (!await confirmSensitive(path)) throw Error('已取消操作，草稿仍保留')
    ;({response,data}=await sendRequest())
  }
  if (!response.ok) throw Error(data?.error || i18n.t('msg.request'))
  authRecovery.noteActivity()
  return data
}
const collectionTargets = [['nav-form', 'navigation'], ['ai-resource-form', 'ai-resources']]
const collectionLayouts = Object.fromEntries(collectionTargets.map(([id, target]) => [id, mountCollectionLayout($('#' + id), { target })]))
const quickCollectors = Object.fromEntries(collectionTargets.map(([id, target]) => [id, mountQuickCollect($('#' + id), { target, request, aiAvailable: authSession.mode === 'cloud', changed: form => { collectionLayouts[id].sync(); protectForm.changed(form) }, showSetup: () => openModal({ title: 'AI 服务设置说明', body: aiSetupGuide({ cloud: authSession.mode === 'cloud' }) }) })]))

const text = (tag, value) => { const element = document.createElement(tag); element.textContent = value ?? ''; return element }
const el = (tag, className, value) => { const element = text(tag, value); if (className) element.className = className; return element }
const button = (label, data = {}, className = 'ui-button ui-button-ghost ui-button-sm', type = 'button') => {
  const element = document.createElement('button')
  element.type = type
  element.textContent = label
  element.className = className
  Object.assign(element.dataset, data)
  return element
}
const input = (name, value, label, { required = false, type = 'text' } = {}) => {
  const wrapper = document.createElement('label')
  wrapper.className = 'ui-field'
  const caption = document.createElement('span')
  caption.className = 'ui-field-label'
  caption.textContent = label || name
  const element = document.createElement('input')
  element.type = type
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
  try { localStorage.setItem(ACTIVITY_KEY, JSON.stringify(items)) } catch { /* Activity history is optional. */ }
}
const toolStatus = tool => tool.status || (tool.enabled === false ? 'disabled' : 'active')
const formatBytes = bytes => `${(Number(bytes) / 1024).toFixed(Number(bytes) > 1024 * 1024 ? 0 : 1)}KB`
function toBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk))
  return btoa(binary)
}
const fileToPayload = async (file, maxBytes = Infinity) => {
  if (file.size > maxBytes) throw new Error(i18n.locale === 'en-US' ? `File must be at most ${maxBytes / 1024 / 1024} MiB.` : `文件不能超过 ${maxBytes / 1024 / 1024} MiB。`)
  return { filename: file.name, content: toBase64(new Uint8Array(await file.arrayBuffer())) }
}
function downloadBase64(filename, base64) {
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: filename.endsWith('.gz') ? 'application/gzip' : 'application/zip' }))
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
const protectForm = createEditProtection({ notify: toast })
const prepareForm = form => assistForm(form, { idHint: i18n.t('form.idHint'), fixedIdHint: i18n.t('form.fixedIdHint') })
const adminScene = { dashboard: 'dash', websites: 'nav', library: 'nav', 'ai-resources': 'cms', notes: 'cms', 'note-editor': 'cms', tools: 'tools', marketplace: 'market', categories: 'nav', tags: 'cms', settings: 'form', validate: 'cms', import: 'form' }
let currentView = 'dashboard'
let viewHistoryIndex = Number.isInteger(window.history.state?.devosAdminViewIndex) ? window.history.state.devosAdminViewIndex : 0
let revertingViewHistory = false
const viewHash = view => '#' + (view === 'cfg-library' ? 'cfgs' : view === 'note-editor' ? 'notes' : view)
function updateTelemetry() {
  if ($('#page-telemetry')) $('#page-telemetry').textContent = `index · tools ${state.tools.length} · websites ${state.navigation.length} · System Online`
}

function showView(view, updateHistory = true) {
  if (!protectForm.mayLeave()) return false
  const menuWasOpen = $('.admin-shell').classList.contains('nav-open')
  setAdminMenu(false)
  closeEditorDrawer()
  if ($('#tag-drawer')) $('#tag-drawer').hidden = true
  if (currentView === 'note-editor' && view !== 'note-editor') protectForm.end($('#note-studio-form'))
  currentView = view
  if (updateHistory && location.hash !== viewHash(view)) window.history.pushState({ ...window.history.state, devosAdminViewIndex: ++viewHistoryIndex }, '', viewHash(view))
  document.querySelectorAll('[data-view-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.viewPanel === view))
  const navView = view === 'note-editor' ? 'notes' : view
  document.querySelectorAll('.nav-item[data-view]').forEach(item => { item.classList.toggle('active', item.dataset.view === navView); if (item.dataset.view === navView) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current') })
  const activeNavigation = document.querySelector('.nav-item[aria-current="page"]')
  const navigationGroup = activeNavigation?.closest('details.admin-nav-group')
  if (navigationGroup) navigationGroup.open = true
  $('#page-title').textContent = view === 'cfg-library' ? 'CFG 配置库' : contentCollections.titles[view] || i18n.t(`title.${view}`)
  const title = $('#page-title')
  title.classList.remove('title-swap')
  void title.offsetWidth
  title.classList.add('title-swap')
  updateTelemetry()
  $('.carbon-fx')?.setAttribute('data-scene', adminScene[view] || 'cms')
  if (menuWasOpen) $('#page-title').focus()
  if (view === 'import') $('#tool-dropzone')?.focus()
  if (view === 'cfg-library') void cfgLibrary.load()
  if (contentCollections.titles[view]) void contentCollections.load(view)
  if (view === 'tags') void readTags().then(renderTags).catch(error => toastError(error.message))
  if (view === 'settings') protectForm.resume($('#site'))
  return true
}

let modalFocusRevision = 0
function openModal({ title, body, confirm = false, okText }) {
  const focusRevision = ++modalFocusRevision
  const modal = $('#modal')
  const returnFocus = document.activeElement
  $('#modal-title').textContent = title
  $('#modal-body').replaceChildren(typeof body === 'string' ? text('p', body) : body)
  $('#modal-ok').hidden = !confirm
  $('#modal-ok').textContent = okText || i18n.t('modal.confirm')
  $('#modal').hidden = false
  requestAnimationFrame(() => {
    if (focusRevision !== modalFocusRevision || !modal.isConnected || modal.hidden || modal.contains(document.activeElement)) return
    $('#modal-cancel').focus({ preventScroll: true })
  })
  return new Promise(resolve => {
    const done = value => { $('#modal').hidden = true; $('#modal-ok').onclick = null; $('#modal-cancel').onclick = null; returnFocus?.focus(); resolve(value) }
    $('#modal-cancel').onclick = () => done(false)
    $('#modal-ok').onclick = () => done(true)
  })
}

function openPromptModal({ title, label, value = '' }) {
  modalFocusRevision++
  const inputBox = document.createElement('input')
  inputBox.className = 'ui-input'
  inputBox.value = value
  const wrapper = el('label', 'prompt-field', label)
  wrapper.append(inputBox)
  $('#modal-title').textContent = title
  $('#modal-body').replaceChildren(wrapper)
  $('#modal-ok').hidden = false
  $('#modal-ok').textContent = i18n.t('modal.confirm')
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
  if (protectForm.hasChanges($('#site'))) return
  const labels = {
    name: i18n.t('form.siteName'), title: i18n.t('form.title'), description: i18n.t('form.description'), github: i18n.t('form.github'),
    footer: i18n.t('form.footer'), logo: i18n.t('form.logo'), tagline: i18n.t('form.tagline'), todayContinueLimit: i18n.t('form.todayContinueLimit'),
    toolsDescription: i18n.t('form.toolsDescription'), navigationDescription: i18n.t('form.navigationDescription'), libraryDescription: i18n.t('form.libraryDescription'),
    aiHubDescription: i18n.t('form.aiHubDescription'), notesDescription: i18n.t('form.notesDescription'),
    publicUrl: i18n.t('form.publicUrl'), basePath: i18n.t('form.basePath'), adminUrl: i18n.t('form.adminUrl'),
  }
  const form = $('#site')
  const extra = $('#settings-extra')
  document.querySelectorAll('.settings-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.settingsTab === settingsTab))
  form.replaceChildren()
  extra.replaceChildren()
  if (settingsTab === 'general') {
    form.hidden = false
    const basics = el('fieldset', 'form-section'), details = el('details', 'form-advanced'), pages = el('div', 'form-advanced-fields')
    basics.append(el('legend', '', '站点展示与入口'))
    details.append(el('summary', '', '更多展示设置 · 页面标题、说明与外观'), pages)
    const required = new Set(['name', 'title', 'description', 'github'])
    const common = ['name', 'tagline', 'description', 'footer', 'github', 'publicUrl', 'adminUrl']
    for (const name of common) basics.append(input(name, state.site[name] ?? '', labels[name], { required: required.has(name), type: ['github','publicUrl','adminUrl'].includes(name) ? 'url' : 'text' }))
    basics.append(el('p', 'field-hint', '这些字段属于公开站点内容。显示链接不能配置登录 origin、监听地址、密钥或服务代理。'))
    for (const name of ['title', 'logo', 'toolsDescription', 'navigationDescription', 'libraryDescription', 'aiHubDescription', 'notesDescription']) pages.append(input(name, state.site[name] ?? '', labels[name], { required: required.has(name) }))
    const limitField = input('todayContinueLimit', state.site.todayContinueLimit ?? 3, labels.todayContinueLimit, { required: true, type: 'number' })
    const limitInput = limitField.querySelector('input'); limitInput.min = '1'; limitInput.max = '8'; limitInput.step = '1'
    pages.append(limitField)
    const display = el('fieldset', 'form-section')
    display.append(el('legend', '', '页面显示'), el('p', 'field-hint', '选择前台展示的组件页。关闭会同步隐藏导航、首页入口与搜索结果，数据保留，可随时恢复。首页、后台管理与设置始终可用。'))
    for (const page of DISPLAY_PAGES) {
      const label = el('label', 'check-inline'), checkbox = document.createElement('input')
      checkbox.type = 'checkbox'; checkbox.name = 'pageVisibility.' + page.id; checkbox.checked = pageVisible(state.site.pageVisibility, page.id)
      label.append(checkbox, el('span', '', page.label)); display.append(label)
    }
    display.append(el('p', 'field-hint', authSession.mode === 'cloud' ? '保存为私有草稿后，请到发布面板预览并显式发布，公开站点才会生效。' : '本地模式保存到站点内容，公开站点需构建并显式发布后生效。'), el('p', 'field-hint', '这是展示设置，不是访问控制；静态文件中仍可能包含原数据或资源。'))
    form.append(basics, display, details)
    const refreshDisplay = mountSiteDisplayPreview(form)
    form.append(button(authSession.mode === 'cloud' ? '保存展示草稿' : i18n.t('form.saveSite'), {}, 'ui-button ui-button-primary', 'submit'))
    prepareForm(form)
    protectForm.begin(form, { key: `site:${settingsTab}`, afterRestore: refreshDisplay })
    if (settingsTab === 'deploy') void siteManagement.publishing(extra)
    return
  }
  if (settingsTab === 'appearance') {
    form.hidden = false
    for (const name of ['logo', 'footer']) form.append(input(name, state.site[name], labels[name]))
    form.append(button(i18n.t('form.saveSite'), {}, 'ui-button ui-button-primary', 'submit'))
    prepareForm(form)
    protectForm.begin(form, { key: `site:${settingsTab}` })
    if (settingsTab === 'deploy') void siteManagement.publishing(extra)
    return
  }
  if (settingsTab === 'deploy') {
    form.hidden = false
    form.append(el('p', 'muted', i18n.t('form.deployHint')))
    for (const name of ['publicUrl', 'basePath', 'adminUrl']) form.append(input(name, state.site[name], labels[name], { required: name === 'basePath', type: name === 'basePath' ? 'text' : 'url' }))
    form.append(button(i18n.t('form.saveSite'), {}, 'ui-button ui-button-primary', 'submit'))
    prepareForm(form)
    protectForm.begin(form, { key: `site:${settingsTab}` })
    if (settingsTab === 'deploy') void siteManagement.publishing(extra)
    return
  }
  form.hidden = true
  if (settingsTab === 'data') {
    extra.append(el('p', 'muted', i18n.t('tools.indexHint')), button(i18n.t('tools.rebuild'), {}, 'ui-button ui-button-ghost'))
    extra.querySelector('button').id = 'rebuild-index-settings'
    extra.querySelector('button').addEventListener('click', () => $('#rebuild-index')?.click())
  }
  if (settingsTab === 'backup') siteManagement.backup(extra)
  if (settingsTab === 'about') extra.append(el('p', '', `${state.site.name || 'DevOS'}`), el('p', 'muted', state.site.tagline || ''), el('p', 'muted', state.site.description || ''), el('p', 'muted', state.site.publicUrl || i18n.t('form.publicUrlEmpty')))
}
function renderStats() {
  const enabled = item => item.enabled !== false && toolStatus(item) !== 'disabled'
  const groups = [
    { id: 'websites', fill: 'websites', label: i18n.t('dash.websites'), view: 'websites', items: state.navigation, active: item => item.enabled !== false },
    { id: 'library', source: 'library', fill: 'library', label: i18n.t('dash.library'), view: 'library', items: state.library, active: item => item.enabled !== false },
    { id: 'ai-resources', source: 'ai-resources', fill: 'aiResources', label: i18n.t('dash.aiResources'), view: 'ai-resources', items: state.aiResources, active: item => item.enabled !== false },
    { id: 'notes', source: 'notes', fill: 'notes', label: i18n.t('dash.notes'), view: 'notes', items: state.notes, active: item => item.enabled !== false },
    { id: 'tools', source: 'tools', fill: 'tools', label: i18n.t('dash.tools'), view: 'tools', items: state.tools, active: enabled },
    { id: 'categories', fill: 'categories', label: i18n.t('dash.categories'), view: 'categories', items: state.categories },
    { id: 'tags', fill: 'tags', label: i18n.t('dash.tags'), view: 'tags', items: state.tags.slice().sort((a, b) => b.total - a.total) },
  ]
  const inventory = $('#dashboard-inventory')
  inventory.replaceChildren()
  for (const group of groups) {
    const total = group.items.length
    const active = group.active ? group.items.filter(group.active).length : total
    const failed = state.loadErrors.includes(group.source)
    const meta = failed
      ? i18n.t('dash.loadFailed')
      : group.active
      ? i18n.t('dash.enabledCount', { enabled: active, disabled: total - active })
      : i18n.t('dash.configuredCount', { total })
    $(`#stat-${group.id}`).textContent = failed ? '!' : String(total)
    $(`#stat-${group.id}-meta`).textContent = meta
    document.querySelector(`[data-fill="${group.fill}"]`)?.style.setProperty('--fill', String(total ? active / total : 0))

    const card = button('', { view: group.view }, 'dashboard-config-card')
    const head = el('span', 'dashboard-config-head')
    head.append(el('strong', '', group.label), el('span', 'dashboard-config-count', String(total)))
    const names = el('span', 'dashboard-config-items')
    for (const item of group.items.slice(0, 5)) names.append(el('span', 'dashboard-config-item', item.name || item.title || item.id))
    if (failed) names.append(el('span', 'dashboard-config-item dashboard-config-error', i18n.t('dash.loadFailed')))
    else if (!total) names.append(el('span', 'dashboard-config-item', i18n.t('dash.emptyGroup')))
    if (total > 5) names.append(el('span', 'dashboard-config-item dashboard-config-more', `+${total - 5}`))
    card.append(head, names, el('span', 'dashboard-config-meta', meta))
    inventory.append(card)
  }

  const runtimes = new Map()
  for (const tool of state.tools) runtimes.set(tool.runtime || 'unknown', (runtimes.get(tool.runtime || 'unknown') || 0) + 1)
  $('#dashboard-runtime-mix').replaceChildren(...[...runtimes].map(([runtime, count]) => el('span', 'dashboard-runtime-chip', `${runtime} ${count}`)))
  const issues = state.validation?.issues || []
  const validationOk = state.validation?.ok === true
  const adminOk = state.system?.admin === 'running'
  const indexOk = state.system?.index === 'synced'
  const runtimeOk = state.system?.runtime === 'ready'
  const healthIssueCount = issues.length + state.loadErrors.length + Number(!adminOk) + Number(!indexOk) + Number(!runtimeOk)
  const healthOk = validationOk && healthIssueCount === 0
  const health = $('#dashboard-health')
  health.classList.toggle('is-ok', healthOk)
  health.classList.toggle('is-error', !healthOk)
  $('#dashboard-health-title').textContent = healthOk ? i18n.t('dash.healthOk') : i18n.t('dash.healthIssues', { count: healthIssueCount || 1 })
  const managedTotal = groups.slice(0, 5).reduce((sum, group) => sum + group.items.length, 0)
  $('#dashboard-health-detail').textContent = i18n.t('dash.assetSummary', { assets: managedTotal, groups: groups.length })
  $('#dashboard-site-name').textContent = state.site.name || 'DevOS'
  $('#dashboard-site-description').textContent = state.site.tagline || state.site.description || i18n.t('dash.overviewHint')

  const setStatus = (selector, value, tone = '') => {
    const node = $(selector)
    node.textContent = value
    node.className = tone
  }
  const dataIssueCount = issues.length + state.loadErrors.length
  setStatus('#status-data', validationOk && !state.loadErrors.length ? i18n.t('dash.statusHealthy') : i18n.t('dash.statusIssues', { count: dataIssueCount || 1 }), validationOk && !state.loadErrors.length ? '' : 'is-error')
  setStatus('#status-index', indexOk ? i18n.t('dash.statusSynced', { count: state.tools.length }) : i18n.t('dash.statusUnavailable'), indexOk ? '' : 'is-warning')
  setStatus('#status-admin', adminOk ? i18n.t('dash.statusRunning') : i18n.t('dash.statusUnavailable'), adminOk ? '' : 'is-error')
  setStatus('#status-runtime', runtimeOk ? i18n.t('dash.statusReady') : i18n.t('dash.statusRuntime', { status: state.system?.runtime || i18n.t('dash.statusUnavailable') }), runtimeOk ? '' : 'is-error')

  const siteRows = [
    [i18n.t('dash.siteName'), state.site.name || 'DevOS'],
    [i18n.t('dash.publicUrl'), state.site.publicUrl || i18n.t('dash.notConfigured')],
    ['basePath', state.site.basePath || './'],
    [i18n.t('dash.adminUrl'), state.site.adminUrl || 'http://127.0.0.1:4174/admin/'],
  ]
  const siteConfig = $('#dashboard-site-config')
  siteConfig.replaceChildren()
  for (const [label, value] of siteRows) siteConfig.append(el('dt', '', label), el('dd', '', value))

  const items = readActivity().filter((item, index, all) => index === 0 || item.message !== all[index - 1]?.message).slice(0, 6)
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

function metadataButton(collection, item) {
  const description = item[collection === 'notes' ? 'summary' : 'description'] || ''
  const en = i18n.locale === 'en-US'
  const action = button(description ? `${en ? 'Edit' : '编辑'} · ${description}` : en ? 'Add tags / description' : '添加标签 / 说明', { metadataKind: collection, metadataId: item.id }, 'metadata-edit')
  action.title = description || action.textContent
  action.setAttribute('aria-label', en ? `Edit tags and description for ${item.name || item.title}` : `编辑 ${item.name || item.title} 的标签和说明`)
  action.addEventListener('click', () => openMetadataEditor(collection, item))
  return action
}

function openMetadataEditor(collection, item) {
  if (!protectForm.mayLeave()) return
  hideEditorForms()
  $('#metadata-form')?.remove()
  if ($('#tag-drawer')) $('#tag-drawer').hidden = true
  const en = i18n.locale === 'en-US', descriptionKey = collection === 'notes' ? 'summary' : 'description'
  const form = el('form', 'drawer-form')
  form.id = 'metadata-form'
  const identity = document.createElement('input')
  identity.type = 'hidden'; identity.name = 'originalId'; identity.value = `${collection}:${item.id}`
  const description = el('label', 'ui-field')
  const textarea = el('textarea', 'ui-input')
  textarea.name = descriptionKey; textarea.rows = 3; textarea.value = item[descriptionKey] || ''
  textarea.placeholder = en ? 'What is it for, and when would you use it?' : '它能做什么？什么场景下会用到？'
  description.append(el('span', 'ui-field-label', en ? 'Card description' : collection === 'notes' ? '摘要' : '卡片说明'), textarea)
  const tags = collection === 'tools' ? [...new Set([...(item.tags || []), ...(item.keywords || [])])] : item.tags || []
  const actions = el('div', 'ui-modal-actions')
  const cancel = button(en ? 'Cancel' : '取消', {}, 'ui-button ui-button-ghost')
  cancel.addEventListener('click', closeEditorDrawer)
  actions.append(cancel, button(en ? 'Save changes' : '保存修改', {}, 'ui-button ui-button-primary', 'submit'))
  form.append(identity, el('p', 'form-intro', en ? 'Save to update the card description and tags in the local preview.' : '补充一句用途说明，再选几个标签；保存后即可在本地预览中查看。'), description, input('tags', tags.join(', '), en ? 'Tags' : '标签'), actions)
  $('#editor-drawer-body').append(form)
  $('#editor-drawer-title').textContent = item.name || item.title
  showEditorModal(form)
  form.addEventListener('submit', async event => {
    event.preventDefault()
    if (!commitTagPicker(form) || !form.reportValidity()) return
    const data = Object.fromEntries(new FormData(form))
    const tags = String(data.tags || '').split(',').map(tag => tag.trim()).filter(Boolean)
    const patch = { [descriptionKey]: data[descriptionKey].trim(), tags }
    if (collection === 'tools') patch.keywords = tags
    try {
      await withBusy(form, async () => {
        await request(`${collection}/${encodeURIComponent(item.id)}`, { method: 'PUT', body: JSON.stringify(patch) })
        protectForm.clean(form)
        closeEditorDrawer()
        await reload(en ? 'Tags and description saved' : '标签和说明已保存')
        document.querySelector(`[data-metadata-kind="${collection}"][data-metadata-id="${window.CSS.escape(item.id)}"]`)?.focus({ preventScroll: true })
      })
    } catch (error) { toastError(error.message) }
  })
}

function renderCategoryPicker(form) {
  const host = form.querySelector('.category-picker')
  const field = form.elements.category
  if (!host || !field) return
  const focused = host.contains(document.activeElement) ? document.activeElement.dataset.categoryOption : undefined
  field.dataset.restoreValue = 'true'
  if (!field.value && state.categories[0]) field.value = state.categories[0].id
  host.replaceChildren(...state.categories.map(category => {
    const option = button('', { categoryOption: category.id }, 'picker-card')
    option.setAttribute('aria-pressed', String(field.value === category.id))
    option.append(el('strong', '', category.name), el('small', '', category.id))
    option.addEventListener('click', () => { field.value = category.id; field.dispatchEvent(new Event('change', { bubbles: true })); renderCategoryPicker(form) })
    return option
  }))
  if (!state.categories.length) host.append(el('span', 'picker-empty', i18n.t('picker.noCategories')))
  if (focused !== undefined) [...host.children].find(option => option.dataset.categoryOption === focused)?.focus({ preventScroll: true })
}

function renderTagPicker(form) {
  return mountTagPicker(form, { initialTags: state.tags, locale: i18n.locale, getTags: readTags, maxTags: form.getAttribute('id') === 'cfg-form' ? 20 : 30 })
}
async function readTags() {
  const data = await request('tags')
  if (!Array.isArray(data.items)) throw new Error('标签目录无效')
  state.tags = data.items
  return data.items
}

function renderIconPicker(form) {
  const host = form.querySelector('.icon-picker')
  const field = form.elements.icon
  if (!host || !field) return
  const focused = host.contains(document.activeElement) ? document.activeElement.dataset.iconOption : undefined
  field.dataset.restoreValue = 'true'
  const website = host.id === 'nav-icon-picker'
  const names = website ? ['auto', 'letter'] : ICON_NAMES
  host.replaceChildren(...names.map(name => {
    const option = button('', { iconOption: name }, 'icon-option')
    option.setAttribute('aria-pressed', String(field.value === name))
    const preview = name === 'auto' ? el('span', 'icon-option-letter', 'A') : name === 'letter' ? el('span', 'icon-option-letter', 'A') : createIconSvg(name, 20)
    option.append(preview, el('small', '', name === 'auto' ? i18n.t('picker.autoIcon') : name === 'letter' ? i18n.t('picker.letterIcon') : name))
    option.addEventListener('click', () => { field.value = name; field.dispatchEvent(new Event('change', { bubbles: true })); renderIconPicker(form) })
    return option
  }))
  if (focused !== undefined) [...host.children].find(option => option.dataset.iconOption === focused)?.focus({ preventScroll: true })
}

function renderEditorPickers(form) {
  renderTagPicker(form)
  if (form.querySelector('.category-picker')) {
    renderCategoryPicker(form)
    renderIconPicker(form)
  }
  if (form.querySelector('#category-icon-picker')) renderIconPicker(form)
}
document.addEventListener('devos:picker-sync', event => { renderCategoryPicker(event.target); renderIconPicker(event.target) })

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
    const icon = el('td', 'category-icon-cell')
    icon.append(createIconSvg(category.icon || 'Code2', 18))
    row.append(text('td', category.name), text('td', category.id), icon, text('td', String(sites)), text('td', String(tools)))
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
    const blob = `${item.name} ${item.description || ''} ${item.url} ${item.id} ${(item.tags || []).join(' ')}`.toLowerCase()
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
    name.append(metadataButton('navigation', item))
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
    name.append(metadataButton('library', item))
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
function renderAIResources() {
  const table = $('#ai-resources')
  if (!table) return
  const labels = { skill: 'Skill', agent: 'Agent', prompt: 'Prompt', model: '模型', app: '应用 / 产品' }
  table.replaceChildren(...state.aiResources.slice().sort((a, b) => a.order - b.order).map(item => {
    const row = document.createElement('tr')
    const name = text('td', item.name)
    name.className = 'cell-tool'
    name.title = item.name
    name.append(metadataButton('ai-resources', item))
    const detail = el('td', 'cell-url', item.content || item.url || '—')
    detail.title = item.content || item.url || ''
    const tags = el('td', 'cell-tags')
    tags.append(chips(item.tags || []))
    row.append(name, text('td', labels[item.kind] || item.kind), detail, tags, text('td', item.enabled ? i18n.t('table.enable') : i18n.t('table.disable')))
    const actions = el('td', 'cell-actions')
    actions.append(kebab([
      button(i18n.t('table.edit'), { editAiResource: item.id }),
      button(item.enabled ? i18n.t('table.disable') : i18n.t('table.enable'), { toggleAiResource: item.id }),
      button(i18n.t('table.delete'), { deleteAiResource: item.id }, 'ui-button ui-button-danger ui-button-sm'),
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
    title.append(metadataButton('notes', item))
    const summary = text('td', item.summary || '')
    summary.className = 'cell-clip'
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
    nameCell.append(metadataButton('tools', tool))
    const displayCell = el('td', 'cell-display')
    if (tool.runtime === 'react') {
      displayCell.textContent = '—'
    } else {
      const on = tool.display?.mode === 'fullscreen'
      const toggle = button('', { displayFullscreen: tool.id }, `ui-switch${on ? ' is-on' : ''}`)
      toggle.type = 'button'
      toggle.setAttribute('role', 'switch')
      toggle.setAttribute('aria-checked', on ? 'true' : 'false')
      toggle.setAttribute('aria-label', i18n.t('tools.fullscreenLoad'))
      toggle.setAttribute('data-display-fullscreen', tool.id)
      const track = el('span', 'ui-switch-track')
      track.append(el('span', 'ui-switch-thumb'))
      toggle.append(track, el('span', 'ui-switch-text', i18n.t('tools.fullscreenShort')))
      toggle.addEventListener('click', async event => {
        event.stopPropagation()
        const height = tool.display?.height ?? 'auto'
        const mode = tool.display?.mode === 'fullscreen' ? 'embedded' : 'fullscreen'
        try {
          await request(`tools/${encodeURIComponent(tool.id)}`, { method: 'PUT', body: JSON.stringify({ display: { mode, height } }) })
          await reload(i18n.t('msg.manifestSaved'))
        } catch (error) { toastError(error.message) }
      })
      displayCell.append(toggle)
    }
    row.append(nameCell, text('td', tool.runtime), text('td', tool.format || '-'), text('td', `v${tool.version}`), text('td', toolStatus(tool)), displayCell, text('td', tool.updated || '—'))
    const actions = el('td', 'cell-actions', '')
    const items = [button(i18n.t('table.inspect'), { inspect: tool.id })]
    if (tool.runtime !== 'react') {
      items.push(
        button(i18n.t('lifecycle.edit'), { editTool: tool.id }),
        button(toolStatus(tool) === 'disabled' ? i18n.t('table.enable') : i18n.t('table.disable'), { toggleTool: tool.id }),
        button(i18n.t('lifecycle.overwrite'), { overwriteTool: tool.id }),
        button(i18n.t('lifecycle.export'), { exportTool: tool.id }),
      )
    } else {
      items.push(button(toolStatus(tool) === 'disabled' ? i18n.t('table.enable') : i18n.t('table.disable'), { toggleTool: tool.id }))
    }
    items.push(button(i18n.t('table.delete'), { deleteTool: tool.id }, 'ui-button ui-button-danger ui-button-sm'))
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
  $('#tag-summary').textContent = i18n.t('tags.summary', { total: String(state.tags.length), used: String(state.tags.filter(item => item.total > 0).length), unused: String(state.tags.filter(item => !item.total).length) })
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
      const actions = el('td', 'cell-actions', '')
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
  if (!closeEditorDrawer()) return
  tagsView.current = name
  const body = $('#tag-drawer-body')
  body.replaceChildren(el('h3', 'drawer-title', item.name), el('p', 'muted', i18n.t('tags.usageCount', { count: String(item.total) })))
  for (const [type, key] of [['tool', 'tools'], ['navigation', 'navigation'], ['ai-resource', 'ai-resources'], ['library', 'library'], ['note', 'notes'], ['project', 'projects'], ['ai-workflow', 'ai-workflows'], ['cfg', 'cfgs']]) {
    const sources = item.sources.filter(source => source.type === type)
    if (!sources.length) continue
    const section = el('div', 'drawer-section')
    section.append(el('h4', '', i18n.t(`tags.source.${key}`)))
    for (const source of sources) section.append(el('div', 'drawer-item', `${source.name} (${source.id})`))
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

function render() { renderSite(); renderStats(); renderCategories(); renderNavigation(); renderLibrary(); renderAIResources(); renderNotes(); renderTools(); renderMarketplace(); renderTags(); updateTelemetry(); i18n.apply() }

async function reload(message = i18n.t('msg.updated'), record = true) {
  const [navigation, categories, site, system, validation] = await Promise.all([
    request('navigation'), request('categories'), request('site'),
    request('system').catch(() => null),
    request('validate').catch(error => ({ ok: false, issues: [error.message] })),
  ])
  state.navigation = navigation
  state.categories = categories
  state.site = site
  const siteLink = $('.site-link')
  try {
    const url = new URL(site.publicUrl)
    siteLink.hidden = !['http:', 'https:'].includes(url.protocol)
    if (!siteLink.hidden) siteLink.href = url.href
  } catch { siteLink.hidden = true }
  siteLink.textContent = i18n.locale === 'en-US' ? 'Published site ↗' : '线上站点 ↗'
  state.system = system
  state.validation = validation
  state.loadErrors = []
  const loadCollection = async path => {
    try { return await request(path) } catch { state.loadErrors.push(path); return [] }
  }
  ;[state.library, state.aiResources, state.notes, state.tools, state.projects, state.cfgs, state.aiWorkflows] = await Promise.all([
    loadCollection('library'), loadCollection('ai-resources'), loadCollection('notes'), loadCollection('tools'), loadCollection('projects'), loadCollection('cfgs'), loadCollection('ai-workflows'),
  ])
  try {
    await readTags()
  } catch {
    state.loadErrors.push('tags')
    state.tags = collectTagItems(state)
  }
  if (message && record) logActivity(message)
  render()
  if (message) toast(message)
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
  const active = [...$('#editor-drawer-body').querySelectorAll('form')].find(form => !form.hidden)
  if (!$('#editor-drawer').hidden && active && !protectForm.mayLeave(active)) return false
  editorFocusRevision++
  stopOutside?.()
  const returnFocus = editorReturnFocus
  editorReturnFocus = null
  hideEditorForms()
  $('#editor-drawer').hidden = true
  returnFocus?.focus()
  return true
}
function hideEditorForms() {
  Object.values(quickCollectors).forEach(collector => collector.cancel())
  $('#editor-drawer-body').querySelectorAll('form').forEach(form => { protectForm.end(form); form.hidden = true })
}
let editorReturnFocus = null
let editorFocusRevision = 0
function showEditorModal(form) {
  const focusRevision = ++editorFocusRevision
  const drawer = $('#editor-drawer')
  form.querySelectorAll('details.form-advanced').forEach(details => { details.open = false })
  if (form.elements.originalId && form.elements.id) { form.elements.id.readOnly = Boolean(form.elements.originalId.value); form.elements.id.title = form.elements.originalId.value ? '已有 ID 为固定地址，不能更改' : '' }
  prepareForm(form)
  quickCollectors[form.getAttribute('id')]?.reset()
  editorReturnFocus = document.activeElement
  renderEditorPickers(form)
  collectionLayouts[form.getAttribute('id')]?.reset()
  if (authSession.mode === 'cloud' && collectionLayouts[form.getAttribute('id')]) {
    const save = form.querySelector('[type="submit"]'); save.removeAttribute('data-i18n'); save.textContent = '保存私有草稿'
  }
  if (!['cfg-form', 'content-collection-form'].includes(form.getAttribute('id'))) protectForm.begin(form, { afterRestore: () => collectionLayouts[form.getAttribute('id')]?.sync() })
  drawer.hidden = false
  $('#editor-drawer-body').scrollTop = 0
  requestAnimationFrame(() => {
    if (focusRevision !== editorFocusRevision || !form.isConnected || !drawer.isConnected || drawer.hidden || form.hidden || !$('#modal').hidden || drawer.contains(document.activeElement)) return
    ;[...form.querySelectorAll('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])')].find(field => !field.hidden && field.getClientRects().length)?.focus({ preventScroll: true })
  })
}
function openWebsiteDrawer(item) {
  if (!protectForm.mayLeave()) return
  if ($('#tag-drawer')) $('#tag-drawer').hidden = true
  hideEditorForms()
  const form = $('#nav-form')
  form.hidden = false
  $('#editor-drawer-title').textContent = item ? i18n.t('form.saveWebsite') : i18n.t('form.addWebsite')
  if (item) fill(form, item, true)
  else { form.reset(); form.elements.originalId.value = ''; form.querySelector('.ui-modal-actions .ui-button-primary').textContent = i18n.t('form.saveWebsite') }
  showEditorModal(form)
}
function openCategoryDrawer(item) {
  if (!protectForm.mayLeave()) return
  if ($('#tag-drawer')) $('#tag-drawer').hidden = true
  hideEditorForms()
  const form = $('#category-form')
  form.hidden = false
  $('#editor-drawer-title').textContent = item ? i18n.t('form.saveCategory') : i18n.t('form.addCategory')
  if (item) fill(form, item)
  else { form.reset(); form.elements.originalId.value = ''; form.querySelector('.ui-modal-actions .ui-button-primary').textContent = i18n.t('form.saveCategory') }
  showEditorModal(form)
}
function readNoteForm() {
  const form = $('#note-studio-form')
  if (!form) return null
  const data = Object.fromEntries(new FormData(form))
  const originalId = data.originalId
  delete data.originalId
  data.tags = String(data.tags || '').split(',').map(value => value.trim()).filter(Boolean)
  data.cfgIds = [...form.elements.cfgIds.selectedOptions].map(option => option.value)
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
  populateNoteRelations(form)
  form.elements.kind.value = item?.kind || 'note'
  if (item) fill(form, item, true)
  else {
    form.elements.originalId.value = ''
    form.elements.updated.value = new Date().toISOString().slice(0, 10)
    form.elements.order.value = '10'
    form.elements.enabled.checked = true
    form.elements.body.value = '# 标题\n\n在左侧写 Markdown，右侧即时预览。\n'
  }
  form.elements.id.readOnly = Boolean(item)
  prepareForm(form)
  renderTagPicker(form)
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
  const rawJson = $('#note-json').value
  try { parsed = JSON.parse(rawJson) } catch { throw new Error(i18n.t('notes.jsonInvalid')) }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(i18n.t('notes.jsonInvalid'))
  const form = $('#note-studio-form')
  const current = form.elements.originalId.value
  const pendingTags = form.elements.namedItem('__tagInput')?.value || ''
  fill(form, {
    id: current || parsed.id || '',
    kind: parsed.kind || 'note', projectId: parsed.projectId || '', cfgIds: parsed.cfgIds || [],
    title: parsed.title || '',
    summary: parsed.summary || '',
    tags: parsed.tags || [],
    order: Number.isFinite(parsed.order) ? parsed.order : 10,
    updated: parsed.updated || '',
    body: parsed.body || '',
    enabled: parsed.enabled !== false,
  }, true)
  form.elements.originalId.value = current
  if (form.elements.namedItem('__tagInput')) form.elements.namedItem('__tagInput').value = pendingTags
  form.dispatchEvent(new Event('devos:picker-sync'))
  $('#note-json').value = rawJson
  refreshNotePreview()
}
function renderNoteTab(tab) {
  document.querySelectorAll('[data-note-tab]').forEach(button => button.classList.toggle('active', button.dataset.noteTab === tab))
  $('#note-studio-form .note-meta').hidden = tab === 'json'
  if ($('#note-tab-write')) $('#note-tab-write').hidden = tab !== 'write'
  if ($('#note-tab-json')) $('#note-tab-json').hidden = tab !== 'json'
}
function setNoteTab(tab) {
  const jsonPanel = $('#note-tab-json')
  const enteringJson = tab === 'json' && Boolean(jsonPanel?.hidden)
  if (enteringJson && !commitTagPicker($('#note-studio-form'))) return false
  if (tab !== 'json' && jsonPanel && !jsonPanel.hidden) {
    try { applyNoteJson() }
    catch (error) { toastError(error.message); $('#note-json')?.focus(); return false }
    protectForm.changed($('#note-studio-form'))
  }
  renderNoteTab(tab)
  if (enteringJson) syncNoteJson()
  if (tab === 'write') refreshNotePreview()
  return true
}
function insertMarkdown(kind) {
  const ta = $('#note-body')
  if (!ta) return
  const snippets = {
    h2: '## 标题\n',
    list: '- 列表项\n',
    link: '[文字](https://example.com)\n',
    image: '![图片说明](/images/example.png)\n',
    code: '```\ncode\n```\n',
  }
  const insert = snippets[kind]
  if (!insert) return
  const start = ta.selectionStart
  const end = ta.selectionEnd
  ta.setRangeText(insert, start, end, 'end')
  ta.focus()
  protectForm.changed($('#note-studio-form'))
  refreshNotePreview()
}
async function openNoteStudio(item) {
  const revision = ++editorFocusRevision
  let projects, cfgs
  try { [projects, cfgs] = await Promise.all([request('projects'), request('cfgs')]) }
  catch (error) { if (revision === editorFocusRevision) toastError(error.message); return }
  if (revision !== editorFocusRevision) return
  state.projects = projects; state.cfgs = cfgs
  if (!showView('note-editor')) return
  closeEditorDrawer()
  if ($('#tag-drawer')) $('#tag-drawer').hidden = true
  fillNoteStudio(item)
  $('#note-studio-title').textContent = item ? i18n.t('form.saveNote') : i18n.t('form.addNote')
  protectForm.begin($('#note-studio-form'), {
    extra: {
      get: () => ({ rawJson: $('#note-json').value, tab: $('#note-tab-json').hidden ? 'write' : 'json' }),
      set: value => { $('#note-json').value = value.rawJson || ''; renderNoteTab(value.tab === 'write' ? 'write' : 'json') },
    },
    afterRestore: () => { refreshNotePreview(); ($('#note-tab-json').hidden ? $('#note-body') : $('#note-json')).focus() },
  })
  $('#note-body')?.focus()
}
function openLibraryDrawer(item) {
  if (!protectForm.mayLeave()) return
  if ($('#tag-drawer')) $('#tag-drawer').hidden = true
  hideEditorForms()
  const form = $('#library-form')
  form.hidden = false
  $('#editor-drawer-title').textContent = item ? i18n.t('form.saveLibrary') : i18n.t('form.addLibrary')
  if (item) fill(form, item, true)
  else { form.reset(); form.elements.originalId.value = ''; form.elements.kind.value = 'repo' }
  showEditorModal(form)
}
function openAIResourceDrawer(item) {
  if (!protectForm.mayLeave()) return
  if ($('#tag-drawer')) $('#tag-drawer').hidden = true
  hideEditorForms()
  const form = $('#ai-resource-form')
  form.hidden = false
  $('#editor-drawer-title').textContent = item ? i18n.t('form.saveAIResource') : i18n.t('form.addAIResource')
  if (item) fill(form, item, true)
  else {
    form.reset()
    form.elements.originalId.value = ''
    form.elements.kind.value = 'app'
    form.elements.updated.value = new Date().toISOString().slice(0, 10)
  }
  showEditorModal(form)
}

function fill(form, item, tags = false) {
  form.reset()
  for (const [key, value] of Object.entries(item)) {
    const fieldElement = form.elements[key]
    if (!fieldElement) continue
    if (fieldElement.multiple && Array.isArray(value)) { for (const option of fieldElement.options) option.selected = value.includes(option.value) }
    else if (fieldElement.type === 'checkbox') fieldElement.checked = Boolean(value)
    else fieldElement.value = tags && Array.isArray(value) ? value.join(', ') : value
  }
  form.elements.originalId.value = item.id
  form.dispatchEvent(new Event('devos:picker-sync', { bubbles: true }))
}

// ---------------- Import Wizard：StepRegistry + WizardState + 错误边界（v3.0.1 P0）----------------

const wizard = { step: 1, file: null, analysis: null, manifest: null, metadataDraft: null, overwrite: false, busy: false, error: null, warning: null, notice: null, previewReady: false }

let wizardPreviewListener = null
const detachWizardPreview = () => { if (wizardPreviewListener) { window.removeEventListener('message', wizardPreviewListener); wizardPreviewListener = null } }

function openWizard(file = null) {
  if (!protectForm.mayLeave() || !$('#wizard').hidden) return
  Object.assign(wizard, { step: 1, file: null, analysis: null, manifest: null, metadataDraft: null, overwrite: false, busy: false, error: null, warning: null, notice: null, previewReady: false })
  $('#wizard').hidden = false
  renderWizard()
  $('#wizard-close').focus()
  if (file) analyzeWizardFile(file)
}

// 关闭向导必须清理服务端 staging（v3.0.1 十一）
async function closeWizard(saved = false) {
  if (wizard.busy && !saved) { toastError('工具正在分析或保存，请稍候再关闭。'); return false }
  if (!saved && wizard.analysis && !await openModal({ title: i18n.t('wizard.exitTitle'), body: i18n.t('wizard.exitBody'), confirm: true, okText: i18n.t('wizard.exitConfirm') })) return false
  detachWizardPreview()
  const token = wizard.analysis?.token
  Object.assign(wizard, { step: 1, file: null, analysis: null, manifest: null, metadataDraft: null, overwrite: false, busy: false, error: null, warning: null, notice: null, previewReady: false })
  $('#wizard').hidden = true
  if (token) await request(`tools/staging/${token}`, { method: 'DELETE' }).catch(() => {})
  return true
}

async function analyzeWizardFile(file) {
  if (wizard.busy) return
  if (!/\.(html?|zip)$/i.test(file.name)) { wizard.error = i18n.t('wizard.badFile'); renderWizard(); return }
  wizard.busy = true
  wizard.error = null
  renderWizard()
  try {
    const analysis = await request('tools/analyze', { method: 'POST', body: JSON.stringify(await fileToPayload(file, 20 * 1024 * 1024)) })
    const previousToken = wizard.analysis?.token
    wizard.file = file
    wizard.analysis = analysis
    wizard.manifest = analysis.manifestDraft
    wizard.metadataDraft = null
    if (previousToken && previousToken !== analysis.token) await request(`tools/staging/${previousToken}`, { method: 'DELETE' }).catch(() => {})
  } catch (error) { wizard.error = error.message }
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
  renderTagPicker(form)
  for (const entry of wizard.metadataDraft || []) {
    const element = form.elements.namedItem(entry.name)
    if (!(element instanceof window.HTMLElement)) continue
    if (element instanceof HTMLInputElement && element.type === 'checkbox') element.checked = entry.checked
    else element.value = entry.value
  }
  form.dispatchEvent(new Event('devos:picker-sync'))
}

function rememberWizardMetadata() {
  const form = $('#wizard-body .wizard-form')
  if (!form) return
  wizard.metadataDraft = [...form.elements]
    .filter(element => element.name)
    .map(element => ({ name: element.name, value: element.value, checked: element instanceof HTMLInputElement && element.type === 'checkbox' ? element.checked : undefined }))
}

function collectWizardStep2() {
  const form = $('#wizard-body .wizard-form')
  if (!commitTagPicker(form) || !form.reportValidity()) return false
  const result = collectMetadataForm(form, wizard.manifest)
  if (!result.ok) { wizard.error = i18n.t(`wizard.${result.code}`); return false }
  wizard.manifest = result.manifest
  wizard.metadataDraft = null
  return true
}

function renderWizardStep3() {
  const body = $('#wizard-body')
  const sandboxPreview = el('p', 'wizard-sandbox', `${i18n.t('wizard.sandbox')} ${buildSandbox(wizard.manifest.permissions)}`)
  const form = renderPermissionsForm(document, {
    permissions: wizard.manifest.permissions,
    t: i18n.t,
    onChange: permissions => {
      wizard.manifest = { ...wizard.manifest, permissions }
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
  heightSelect.name = 'display.mode'
  heightSelect.setAttribute('aria-label', i18n.t('wizard.f.displayMode'))
  heightSelect.value = manifest.display?.mode || 'embedded'
  const frameWrap = el('div', `wizard-preview-frame mode-${heightSelect.value}`)
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
  heightSelect.addEventListener('change', () => {
    frameWrap.className = `wizard-preview-frame mode-${heightSelect.value}`
    const mode = ['embedded', 'workspace', 'fullscreen'].includes(heightSelect.value) ? heightSelect.value : 'embedded'
    wizard.manifest = { ...wizard.manifest, display: { ...(wizard.manifest.display || {}), mode, height: wizard.manifest.display?.height ?? 'auto' } }
  })
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

function collectWizardStep5() {
  const select = $('#wizard-body select[name="display.mode"]')
  if (select instanceof HTMLSelectElement) {
    const mode = ['embedded', 'workspace', 'fullscreen'].includes(select.value) ? select.value : 'embedded'
    wizard.manifest = { ...wizard.manifest, display: { ...(wizard.manifest.display || {}), mode, height: wizard.manifest.display?.height ?? 'auto' } }
  }
  return true
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
    collect: collectWizardStep5,
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
  $('#wizard-prev').disabled = wizard.busy || wizard.step === 1
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
    await closeWizard(true)
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
  if (wizard.busy || wizard.step <= 1) return
  if (wizard.step === 2) rememberWizardMetadata()
  else WIZARD_STEPS[wizard.step]?.collect?.()
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
window.addEventListener('beforeunload', event => { if (!$('#wizard').hidden && (wizard.busy || wizard.analysis)) { event.preventDefault(); event.returnValue = '' } })
bind('#wizard-close', 'click', () => { closeWizard().catch(() => {}) })
bind('#wizard-prev', 'click', () => { try { wizardPrev() } catch (error) { wizardGuard(error) } })
bind('#wizard-next', 'click', async () => { try { await wizardNext() } catch (error) { wizardGuard(error) } })
bind('#wizard', 'click', event => { if (event.target === $('#wizard')) closeWizard().catch(() => {}) })

// 主拖放区：拖入即开向导
const dropzone = $('#tool-dropzone')
const toolFileInput = $('#tool-file-input')
bind('#dashboard-add-website', 'click', () => openWebsiteDrawer())
bind('#dashboard-import-tool', 'click', () => toolFileInput.click())
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
  if (!protectForm.mayLeave()) return
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
  renderTagPicker(form)
  protectForm.begin(form, { key: `tool:${tool.id}` })
  protectForm.begin(access.querySelector('form'), { key: `tool-permissions:${tool.id}` })
  form.elements.name.focus()
}

bind('#tool-edit-cancel', 'click', () => { if (!protectForm.mayLeave()) return; $('#tool-edit-body').querySelectorAll('form').forEach(form => protectForm.end(form)); $('#tool-edit').hidden = true; editingTool = null })
bind('#tool-edit-save', 'click', async () => {
  if (!editingTool) return
  try {
    const form = $('#tool-edit-body .tool-edit-form')
    if (!commitTagPicker(form) || !form.reportValidity()) return
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
    protectForm.busy(form, true); protectForm.busy(permForm, true); $('#tool-edit-save').disabled = true
    try { await request(`tools/${encodeURIComponent(editingTool.id)}`, { method: 'PUT', body: JSON.stringify(patch) }); protectForm.clean(form); protectForm.clean(permForm) }
    finally { protectForm.busy(form, false); protectForm.busy(permForm, false); $('#tool-edit-save').disabled = false }
    protectForm.end(form); protectForm.end(permForm)
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
      const analysis = await request('tools/analyze', { method: 'POST', body: JSON.stringify(await fileToPayload(file, 20 * 1024 * 1024)) })
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
bind('#editor-drawer', 'click', event => { if (event.target.id === 'editor-drawer') closeEditorDrawer() })
const mobileMenu = matchMedia('(max-width: 1024px)')
function setAdminMenu(open) {
  const visible = mobileMenu.matches && open
  $('.admin-shell').classList.toggle('nav-open', visible)
  $('#admin-menu').setAttribute('aria-expanded', String(visible))
  $('#admin-menu-backdrop').hidden = !visible
  $('#admin-sidebar').inert = mobileMenu.matches && !visible
  $('.admin-content').inert = visible
}
function closeMenuForAction() { const wasOpen = $('.admin-shell').classList.contains('nav-open'); setAdminMenu(false); if (wasOpen) $('#admin-menu').focus() }
bind('#admin-menu', 'click', () => setAdminMenu(!$('.admin-shell').classList.contains('nav-open')))
bind('#admin-menu-backdrop', 'click', () => { setAdminMenu(false); $('#admin-menu').focus() })
mobileMenu.addEventListener('change', () => setAdminMenu(false))
setAdminMenu(false)
bind('#website-query', 'input', renderNavigation)
bind('#website-category', 'change', renderNavigation)
bind('#website-status', 'change', renderNavigation)
bind('#nav-cancel', 'click', closeEditorDrawer)
bind('#library-cancel', 'click', closeEditorDrawer)
bind('#ai-resource-cancel', 'click', closeEditorDrawer)
bind('#category-cancel', 'click', closeEditorDrawer)

function populateNoteRelations(form) {
  for (const [name, items, label] of [['projectId', state.projects || [], '不关联项目'], ['cfgIds', state.cfgs || [], null]]) {
    const select = form.elements[name]; select.replaceChildren()
    if (label) { const option = el('option', '', label); option.value = ''; select.append(option) }
    for (const item of items) { const option = el('option', '', item.name); option.value = item.id; select.append(option) }
  }
}
for (const [id, label] of Object.entries(noteKinds)) { const option = el('option', '', label); option.value = id; $('#note-kind').append(option) }
bind('#note-template', 'click', async () => {
  const template = runbookTemplates[$('#note-kind').value]
  if (!template) return toast('请选择部署、故障或回滚类型后使用模板')
  if ($('#note-body').value.trim() && !await openModal({ title: '替换当前正文？', body: '使用类型模板会替换当前 Markdown 正文。', confirm: true, okText: '替换正文' })) return
  $('#note-body').value = template; refreshNotePreview(); syncNoteJson(); protectForm.changed($('#note-studio-form'))
})

bind('#note-body', 'input', () => { refreshNotePreview() })
bind('#note-studio-form', 'input', event => {
  if (event.target.id === 'note-json') return
  if (currentView === 'note-editor' && $('#note-tab-json').hidden) syncNoteJson()
})
bind('#note-studio-form', 'submit', event => { event.preventDefault(); $('#note-save')?.click() })
bind('#note-save', 'click', async () => {
  if (!$('#note-tab-json').hidden) { try { applyNoteJson() } catch (error) { toastError(error.message); return } }
  const form = $('#note-studio-form')
  if (!commitTagPicker(form) || !form.checkValidity()) {
    if (!$('#note-tab-json').hidden) setNoteTab('write')
    form.reportValidity()
    return
  }
  const pack = readNoteForm()
  if (!pack) return
  if (!pack.data.id || !pack.data.title) { toastError(i18n.t('notes.needFields')); return }
  try {
    await withBusy($('#note-save'), async () => {
      await request(pack.originalId ? `notes/${pack.originalId}` : 'notes', { method: pack.originalId ? 'PUT' : 'POST', body: JSON.stringify(pack.data) })
      protectForm.clean($('#note-studio-form'))
      await reload(pack.originalId ? i18n.t('msg.savedNote') : i18n.t('msg.addedNote'))
      showView('notes')
    })
  } catch (error) { toastError(error.message) }
})
bind('#note-json', 'input', () => protectForm.changed($('#note-studio-form')))
bind('#note-json-apply', 'click', () => {
  if (setNoteTab('write')) toast(i18n.t('notes.jsonApplied'))
})
document.querySelectorAll('.settings-tab').forEach(tab => tab.addEventListener('click', () => { if (!protectForm.mayLeave($('#site'))) return; settingsTab = tab.dataset.settingsTab; renderSite() }))
document.addEventListener('click', event => {
  if (event.target.closest('.kebab')) return
  document.querySelectorAll('.kebab-menu').forEach(menu => { menu.hidden = true })
})
document.addEventListener('keydown', event => {
  const editor = ['#modal', '#tool-edit', '#editor-drawer', '#wizard'].map($).find(node => !node.hidden)
  if (event.key === 'Tab' && editor && !editor.hidden) {
    const authControls = editor.id !== 'modal' && !$('#auth-recovery').hidden ? [...$('#auth-recovery').querySelectorAll('button')] : []
    const focusable = [...editor.querySelectorAll('button, input:not([type="hidden"]), select, textarea, summary, a[href], [tabindex="0"]'), ...authControls].filter(node => !node.hidden && !node.disabled && !node.closest('[hidden], details:not([open]) > :not(summary)') && node.offsetParent)
    const [first] = focusable
    const last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last || !editor.contains(document.activeElement) && !authControls.includes(document.activeElement)) { event.preventDefault(); first?.focus() }
    return
  }
  if (event.key !== 'Escape') return
  if ($('.admin-shell').classList.contains('nav-open')) { setAdminMenu(false); $('#admin-menu').focus(); return }
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
  const protectedForm = form.matches?.('button') ? (form.id === 'note-save' ? $('#note-studio-form') : form.closest('form')) : form
  if (protectedForm?.getAttribute('aria-busy') === 'true') return
  if (protectedForm) protectForm.busy(protectedForm, true)
  const previous = submit?.textContent
  if (submit) { submit.disabled = true; submit.textContent = i18n.t('form.saving') }
  if (protectedForm) showFormError(protectedForm)
  try { return await fn() }
  catch (error) { if (protectedForm) showFormError(protectedForm, error.message); throw error }
  finally { if (protectedForm) protectForm.busy(protectedForm, false); if (submit) { submit.disabled = false; submit.textContent = previous } }
}
bind('#site', 'submit', async event => {
  event.preventDefault()
  const data = Object.fromEntries(new FormData(event.target))
  if (DISPLAY_PAGES.some(page => event.target.elements.namedItem('pageVisibility.' + page.id))) {
    data.pageVisibility = Object.fromEntries(DISPLAY_PAGES.map(page => [page.id, event.target.elements.namedItem('pageVisibility.' + page.id).checked]))
    for (const page of DISPLAY_PAGES) delete data['pageVisibility.' + page.id]
  }
  if (data.todayContinueLimit === undefined || data.todayContinueLimit === '') delete data.todayContinueLimit
  else data.todayContinueLimit = Number(data.todayContinueLimit)
  try { await withBusy(event.target, async () => { await request('site', { method: 'PUT', body: JSON.stringify({ ...state.site, ...data }) }); protectForm.clean(event.target); await reload(i18n.t('msg.savedSite')) }) } catch (error) { toastError(error.message) }
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
      protectForm.clean(event.target)
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
      protectForm.clean(event.target)
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
      protectForm.clean(event.target)
      event.target.reset()
      closeEditorDrawer()
      await reload(originalId ? i18n.t('msg.savedLibrary') : i18n.t('msg.addedLibrary'))
    })
  } catch (error) { toastError(error.message) }
})
bind('#ai-resource-form', 'submit', async event => {
  event.preventDefault()
  const form = new FormData(event.target)
  const data = Object.fromEntries(form)
  const originalId = data.originalId
  delete data.originalId
  data.name = String(data.name || '').trim()
  data.description = String(data.description || '').trim()
  data.install = String(data.install || '').trim()
  data.content = String(data.content || '').trim()
  data.url = String(data.url || '').trim()
  data.tags = String(data.tags || '').split(',').map(value => value.trim()).filter(Boolean)
  data.order = Number(data.order)
  data.enabled = form.has('enabled')
  data.updated = data.updated || new Date().toISOString().slice(0, 10)
  if (!data.install && !data.content && !data.url) { showFormError(event.target, i18n.t('aiResources.needAction')); event.target.elements.install.focus(); return }
  try {
    await withBusy(event.target, async () => {
      await request(originalId ? `ai-resources/${originalId}` : 'ai-resources', { method: originalId ? 'PUT' : 'POST', body: JSON.stringify(data) })
      protectForm.clean(event.target)
      event.target.reset()
      closeEditorDrawer()
      await reload(originalId ? i18n.t('msg.savedAIResource') : i18n.t('msg.addedAIResource'))
    })
  } catch (error) { toastError(error.message) }
})
document.addEventListener('click', async event => {
  const element = event.target.closest('button')
  if (!element) return
  if (element.dataset.collect) {
    closeMenuForAction()
    if (element.dataset.collect === 'navigation') openWebsiteDrawer()
    else if (element.dataset.collect === 'ai-resources') openAIResourceDrawer()
    return
  }
  if (element.dataset.aiHelp) { closeMenuForAction(); await openModal({ title: 'AI 服务设置说明', body: aiSetupGuide({ cloud: authSession.mode === 'cloud' }) }); return }
  if (element.dataset.settingsShortcut) {
    if (!showView('settings') || !protectForm.mayLeave($('#site'))) return
    protectForm.end($('#site'))
    settingsTab = element.dataset.settingsShortcut === 'deploy' ? 'deploy' : 'general'
    renderSite()
    return
  }
  if (element.dataset.view) return showView(element.dataset.view)
  if (element.dataset.noteTab) { setNoteTab(element.dataset.noteTab); return }
  if (element.dataset.md) { insertMarkdown(element.dataset.md); return }
  try {
    if (element.dataset.tagPage) { tagsView.page = Number(element.dataset.tagPage) || 1; renderTags(); return }
    if (element.dataset.addTag) {
      const name = await openPromptModal({ title: i18n.t('tags.addTitle'), label: i18n.t('tags.addLabel'), value: '' })
      if (!name) return
      await request('tags', { method: 'POST', body: JSON.stringify({ name }) })
      await reload(i18n.t('msg.tagAdded'))
      return
    }
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
      const body = i18n.t('tags.deleteBody', { name, count: String(item?.total || 0) })
      if (!await openModal({ title: i18n.t('modal.deleteTitle'), body, confirm: true })) return
      const result = await request(`tags/${encodeURIComponent(name)}`, { method: 'DELETE' })
      $('#tag-drawer').hidden = true
      await reload(i18n.t('msg.tagDeleted', { count: String(result.affected) }))
      return
    }
    if (element.dataset.addWebsite) { openWebsiteDrawer(); return }
    if (element.dataset.addLibrary) { openLibraryDrawer(); return }
    if (element.dataset.addAiResource) { openAIResourceDrawer(); return }
    if (element.dataset.addNote) { openNoteStudio(); return }
    if (element.dataset.addCategory) { openCategoryDrawer(); return }
    if (element.dataset.edit) { openWebsiteDrawer(state.navigation.find(item => item.id === element.dataset.edit)); return }
    if (element.dataset.editLibrary) { openLibraryDrawer(state.library.find(item => item.id === element.dataset.editLibrary)); return }
    if (element.dataset.editAiResource) { openAIResourceDrawer(state.aiResources.find(item => item.id === element.dataset.editAiResource)); return }
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
    if (element.dataset.toggleAiResource) {
      const item = state.aiResources.find(entry => entry.id === element.dataset.toggleAiResource)
      await request(`ai-resources/${item.id}`, { method: 'PUT', body: JSON.stringify({ enabled: !item.enabled }) })
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
    if (element.dataset.deleteAiResource) {
      if (!await openModal({ title: i18n.t('modal.deleteTitle'), body: element.dataset.deleteAiResource, confirm: true })) return
      await request(`ai-resources/${element.dataset.deleteAiResource}`, { method: 'DELETE' })
      await reload(i18n.t('msg.deletedAIResource'))
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

if (authSession.mode === 'cloud') {
  const localLabel = document.querySelector('.admin-local-label')
  if (localLabel) { localLabel.textContent = '私有草稿 · 保存不发布'; localLabel.title = '私有管理入口；回环服务经独立 HTTPS 端口访问' }
  $('#status').removeAttribute('data-i18n'); $('#status').textContent = '云端私有草稿'
  const hint = document.querySelector('.admin-get-started .muted')
  if (hint) { hint.removeAttribute('data-i18n'); hint.textContent = '先添加内容并保存私有草稿，再预览变更与校验；到系统设置 → 发布与域名生成发布清单，确认后发布。' }
  $('#admin-preview').hidden = true
  $('#admin-logout').hidden = false
  $('#admin-draft-preview').hidden = false
  $('#sidebar-draft-preview').hidden = false
  const sidebarMode = document.querySelector('.sidebar-status [data-i18n]')
  if (sidebarMode) { sidebarMode.removeAttribute('data-i18n'); sidebarMode.textContent = '私有草稿 · 保存不发布' }
  const showDeviceConfirmation = session => {
    const missing=session.rememberedDevice===true && session.deviceConfirmed===false
    $('#auth-recovery').hidden=!missing
    if (missing) $('#auth-recovery-message').textContent='本次短登录已生效，但 7 天设备记忆尚未确认。请检查 Cookie 设置后重新登记设备。'
  }
  authRecovery.setHandlers({
    onRecovered: showDeviceConfirmation,
    onUnavailable: message => { $('#auth-recovery-message').textContent=message;$('#auth-recovery').hidden=false },
  })
  showDeviceConfirmation(authSession)
  bind('#auth-retry','click',()=>{void authRecovery.recover({manual:true})})
  bind('#auth-signin','click',async()=>{
    try {
      await preserveModal(async()=>{
        const body=el('div'),username=document.createElement('input'),password=document.createElement('input'),remember=document.createElement('input')
        username.autocomplete='username';username.maxLength=64;username.className='ui-input'
        password.type='password';password.autocomplete='current-password';password.maxLength=512;password.className='ui-input'
        remember.type='checkbox';remember.checked=false
        const userLabel=el('label','ui-field'),passwordLabel=el('label','ui-field'),rememberLabel=el('label','check-inline')
        userLabel.append(el('span','ui-field-label','用户名'),username);passwordLabel.append(el('span','ui-field-label','密码'),password);rememberLabel.append(remember,el('span','','记住此浏览器 7 天'));body.append(userLabel,passwordLabel,rememberLabel)
        if (!await openModal({title:'恢复登录',body,confirm:true,okText:'登录并保留草稿'})) return
        const payload={username:username.value,password:password.value,rememberDevice:remember.checked};password.value=''
        authRecovery.cancel()
        const response=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)})
        if (!response.ok) throw Error('登录未成功，请稍后重试；草稿仍保留')
        if (!await authRecovery.confirmPassword()) throw Error('登录会话未生效；草稿仍保留，请检查 Cookie 设置')
      })
    }catch(error){toastError(error.message)}
  })
  $('#admin-devices').hidden=false
  bind('#admin-devices','click',async()=>{
    try {
      const draw=async()=>{
        const {devices}=await request('auth/devices'),body=el('div','admin-management-result'),remember=button('记住此浏览器 7 天')
        body.append(el('p','','选择后在短会话失效时自动恢复；固定 7 天到期。撤销当前设备也会结束该设备的会话。'),remember)
        remember.onclick=async()=>{remember.disabled=true;try{await verifyPassword();if(!await confirmSensitive('auth/remember'))return;await request('auth/remember',{method:'POST',body:'{}'});if(!await authRecovery.confirmPassword())throw Error('登录会话未确认，请使用密码登录；草稿仍保留');await draw()}catch(error){toastError(error.message)}finally{remember.disabled=false}}
        for(const device of devices){
          const row=el('div','admin-management-result'),revoke=button('撤销设备')
          row.append(el('p','',`${device.current?'当前设备':'已记住的设备'} · 到期 ${new Date(device.expiresAt).toLocaleString()}`),revoke);body.append(row)
          revoke.onclick=async()=>{if(device.current && !await protectForm.mayLeave())return;revoke.disabled=true;if(device.current)authRecovery.suppress();try{const result=await request('auth/devices/revoke',{method:'POST',body:JSON.stringify({id:device.id})});if(result.current){location.replace('/admin/login.html?signed_out=1')}else await draw()}catch(error){toastError(error.message)}finally{revoke.disabled=false}}
        }
        if(!devices.length)body.append(el('p','muted','尚未记住任何设备。'))
        void openModal({title:'登录设备',body})
      }
      await draw()
    }catch(error){toastError(error.message)}
  })
  bind('#admin-logout', 'click', async () => {
    if (!await protectForm.mayLeave()) return
    const body=el('div'),label=el('label','check-inline'),forget=document.createElement('input')
    forget.type='checkbox';forget.checked=true;label.append(forget,el('span','','同时忘记此设备'))
    body.append(el('p','','忘记后需重新输入密码。保留设备时，之后打开管理入口可自动恢复登录。'),label)
    if (!await openModal({title:'退出登录',body,confirm:true,okText:'退出登录'})) return
    authRecovery.suppress()
    try {await request('auth/logout',{method:'POST',body:JSON.stringify({forgetDevice:forget.checked})});location.replace('/admin/login.html?signed_out=1')}catch(error){$('#auth-recovery-message').textContent='退出结果未确认。自动登录恢复已暂停，可以再次退出或使用密码登录。';$('#auth-recovery').hidden=false;toastError(error.message)}
  })
  const showDraftPreview = async () => {
    closeMenuForAction()
    try {
      const report = await request('drafts/preview')
      const validation = await request('publishing/validate', { method: 'POST', body: '{}' })
      const content = el('div', 'admin-management-result')
      content.append(el('p', '', report.message), el('p', '', validation.ok ? '内容校验通过。' : '内容校验未通过：' + validation.issues.join('；')))
      const list = el('ul', 'admin-file-list')
      for (const item of report.changes) list.append(el('li', '', ({ add: '新增', replace: '覆盖', delete: '删除' }[item.action] || item.action) + ' · ' + item.path))
      if (!report.changes.length) list.append(el('li', '', '没有未发布变更'))
      content.append(list)
      await openModal({ title: '私有草稿变更预览', body: content })
    } catch (error) { toastError(error.message) }
  }
  bind('#admin-draft-preview', 'click', showDraftPreview)
  bind('#sidebar-draft-preview', 'click', showDraftPreview)
}
const siteManagement = mountSiteManagement({ request, el, button, toast, openModal, downloadBase64, fileToPayload, reload, cloud: authSession.mode === 'cloud' })
const contentCollections = mountContentCollections({ request, el, button, toast, openModal, showEditorModal, closeEditorDrawer, hideEditorForms, protectForm, getState: () => state })
const cfgLibrary = mountCfgLibrary({ request, openModal, showEditorModal, closeEditorDrawer, hideEditorForms, toast, el, button, protectForm })
const followAdminHash = () => {
  if (revertingViewHistory) { revertingViewHistory = false; return }
  const requested = location.hash === '#cfgs' ? 'cfg-library' : location.hash.slice(1)
  const view = requested !== 'note-editor' && [...document.querySelectorAll('[data-view-panel]')].some(panel => panel.dataset.viewPanel === requested) ? requested : requested === 'note-editor' ? 'notes' : 'dashboard'
  const nextIndex = Number.isInteger(window.history.state?.devosAdminViewIndex) ? window.history.state.devosAdminViewIndex : viewHistoryIndex + 1
  if (location.hash === viewHash(currentView) && nextIndex === viewHistoryIndex) return
  if (!showView(view, false)) {
    if (nextIndex !== viewHistoryIndex) { revertingViewHistory = true; window.history.go(viewHistoryIndex - nextIndex) }
    else window.history.replaceState({ ...window.history.state, devosAdminViewIndex: viewHistoryIndex }, '', viewHash(currentView))
    return
  }
  viewHistoryIndex = nextIndex
  window.history.replaceState({ ...window.history.state, devosAdminViewIndex: viewHistoryIndex }, '', viewHash(view))
}
window.history.replaceState({ ...window.history.state, devosAdminViewIndex: viewHistoryIndex }, '', location.href)
followAdminHash()
window.addEventListener('popstate', followAdminHash)
window.addEventListener('hashchange', followAdminHash)
reload('', false).catch(error => toastError(error.message))

const carbon = $('.carbon-fx')
let motionEnabled = readPreference('devos-motion', 'on') !== 'off'
const systemMotion = matchMedia('(prefers-reduced-motion: reduce)')
let unmountTechField = () => {}
function applyAdminMotion() {
  const systemReduced = systemMotion.matches
  const motionActive = motionEnabled && !systemReduced
  document.documentElement.dataset.motion = motionEnabled ? 'on' : 'off'
  const control = $('#admin-motion')
  const systemLabel = i18n.locale === 'en-US' ? 'System reduced motion' : '系统设置已减少动效'
  control.disabled = systemReduced
  control.setAttribute('aria-pressed', String(motionActive))
  control.textContent = systemReduced ? systemLabel : i18n.locale === 'en-US' ? `Motion ${motionActive ? 'on' : 'off'}` : `动效${motionActive ? '开启' : '关闭'}`
  control.setAttribute('aria-label', systemReduced ? systemLabel : i18n.locale === 'en-US' ? `${motionActive ? 'Disable' : 'Enable'} motion` : `${motionActive ? '关闭' : '开启'}管理页动效`)
  unmountTechField()
  unmountTechField = motionActive ? mountTechField(carbon) : () => {}
}
bind('#admin-theme', 'change', event => {
  themePreference = event.target.value
  applyAdminTheme()
  try { localStorage.setItem('theme', themePreference) } catch { /* Keep the preference for this page. */ }
})
bind('#admin-motion', 'click', () => {
  motionEnabled = !motionEnabled
  applyAdminMotion()
  try { localStorage.setItem('devos-motion', motionEnabled ? 'on' : 'off') } catch { /* Keep the preference for this page. */ }
})
window.addEventListener('storage', event => {
  if (event.key === 'theme' || event.key === null) {
    const preference = readPreference('theme', 'dark')
    themePreference = ['dark', 'light', 'system'].includes(preference) ? preference : 'dark'
    applyAdminTheme()
  }
  if (event.key === 'devos-motion' || event.key === null) { motionEnabled = readPreference('devos-motion', 'on') !== 'off'; applyAdminMotion() }
})
systemMotion.addEventListener('change', applyAdminMotion)
applyAdminMotion()
carbon?.addEventListener('pointermove', event => {
  if (!motionEnabled || systemMotion.matches) return
  const box = carbon.getBoundingClientRect()
  carbon.style.setProperty('--mx', `${((event.clientX - box.left) / box.width) * 100}%`)
  carbon.style.setProperty('--my', `${((event.clientY - box.top) / box.height) * 100}%`)
})
