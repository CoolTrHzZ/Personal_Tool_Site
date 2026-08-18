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
    for (const value of [tool.id, tool.name, `v${tool.version}`, tool.type, toolStatus(tool)]) row.append(text('td', value))
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
    card.append(text('strong', tool.name), text('small', tool.description || tool.id), text('small', `v${tool.version} · ${tool.type} · ${tool.category || '-'} · ${toolStatus(tool)}`))
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
    const field = form.elements[key]
    if (!field) continue
    if (field.type === 'checkbox') field.checked = Boolean(value)
    else field.value = tags && Array.isArray(value) ? value.join(', ') : value
  }
  form.elements.originalId.value = item.id
  form.querySelector('button').textContent = form.id === 'category-form' ? i18n.t('form.saveCategory') : i18n.t('form.saveWebsite')
  form.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

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
function toBase64(bytes) { let binary = ''; for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]); return btoa(binary) }
$('#tool-upload').addEventListener('submit', async event => {
  event.preventDefault()
  const file = event.target.elements.file.files[0]
  if (!file) return
  try {
    await request('tools/upload', { method: 'POST', body: JSON.stringify({ filename: file.name, content: toBase64(new Uint8Array(await file.arrayBuffer())) }) })
    event.target.reset()
    await reload(i18n.t('msg.uploaded'))
  } catch (error) { status(error.message) }
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
