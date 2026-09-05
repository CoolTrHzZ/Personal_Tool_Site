import { assertProjects, assertAIWorkflows } from '/shared/content-validation.js'
export function mountContentCollections({ request, el, button, toast, openModal, showEditorModal, closeEditorDrawer, hideEditorForms, protectForm, getState }) {
  const configs = {
    projects: { title: '项目与服务', category: ['project', 'service'], defaults: { kind: 'project', status: 'active', body: '', repository: '', docs: '', url: '', cfgIds: [] } },
    'ai-workflows': { title: 'AI 工作流', category: ['code-review', 'requirements', 'incident'], defaults: { category: 'code-review', steps: [{ title: '准备上下文', description: '', resourceId: '' }] } },
  }
  const hosts = new Map()
  function field(form, name, label, value, { options, type = 'text', rows, required = false } = {}) {
    const wrapper = el('label', 'ui-field'), caption = el('span', 'ui-field-label', label)
    const node = document.createElement(options ? 'select' : rows ? 'textarea' : 'input'); node.name = name; node.className = type === 'checkbox' ? '' : 'ui-input'; node.required = required
    if (options) for (const [id, title] of options) { const option = el('option', '', title); option.value = id; node.append(option) }
    else if (rows) node.rows = rows
    else node.type = type
    node.value = value ?? ''; if (type === 'checkbox') { wrapper.className = 'check-inline'; wrapper.append(node, caption) } else wrapper.append(caption, node); form.append(wrapper); return node
  }
  async function edit(key, item) {
    if (!protectForm.mayLeave()) return
    hideEditorForms()
    const config = configs[key], state = getState()
    let cfgs
    try { cfgs = await request('cfgs') } catch (error) { toast(error.message, 'error'); return }
    const record = { ...config.defaults, id: '', name: '', description: '', tags: [], order: 10, enabled: true, updated: new Date().toISOString().slice(0, 10), ...item }
    const old = document.querySelector('#content-collection-form'); old?.remove()
    const form = el('form', 'drawer-form'); form.id = 'content-collection-form'; document.querySelector('#editor-drawer-body').append(form)
    document.querySelector('#editor-drawer-title').textContent = `${item ? '编辑' : '新增'}${config.title}`
    form.append(el('p', 'muted', '保存到本地项目，随站点发布后公开。已有 ID 是固定地址，不可更改。'))
    field(form, 'id', 'ID / slug', record.id, { required: true }).readOnly = Boolean(item)
    field(form, 'name', '名称', record.name, { required: true })
    field(form, 'description', '说明', record.description, { rows: 3 })
    if (key === 'projects') {
      field(form, 'kind', '类型', record.kind, { options: [['project', '项目'], ['service', '服务']] })
      field(form, 'status', '维护状态', record.status, { options: [['active', '维护中'], ['paused', '暂停'], ['archived', '归档']] })
      for (const [name, label] of [['repository', '代码仓库'], ['docs', '文档链接'], ['url', '访问链接']]) field(form, name, label, record[name], { type: 'url' })
      field(form, 'body', '项目说明（Markdown）', record.body, { rows: 12 })
      const cfg = field(form, 'cfgIds', '关联 CFG（可多选）', '', { options: cfgs.map(entry => [entry.id, entry.name]) }); cfg.multiple = true
      for (const option of cfg.options) option.selected = record.cfgIds.includes(option.value)
    } else {
      field(form, 'category', '工作流类型', record.category, { options: [['code-review', '代码审查'], ['requirements', '需求分析'], ['incident', '故障排查']] })
      field(form, 'steps', '步骤 JSON', JSON.stringify(record.steps, null, 2), { rows: 12, required: true })
      form.append(el('p', 'muted', '每步包含 title、description、resourceId；resourceId 为空表示人工步骤。顺序即执行顺序。'))
      const refs = el('details', 'admin-resource-ids'); refs.append(el('summary', '', '查看可关联的 AI 资源 ID'))
      const list = el('ul', 'admin-file-list'); for (const resource of state.aiResources) list.append(el('li', '', `${resource.id} · ${resource.name}`)); refs.append(list); form.append(refs)
    }
    field(form, 'tags', '标签（逗号分隔）', record.tags.join(', '))
    field(form, 'order', '排序', record.order, { type: 'number' }); field(form, 'updated', '更新日期', record.updated, { type: 'date' })
    const enabled = field(form, 'enabled', '启用并公开', '', { type: 'checkbox' }); enabled.checked = record.enabled
    const errorHost = el('p', 'cfg-admin-error'); errorHost.setAttribute('role', 'alert'); form.append(errorHost)
    const actions = el('div', 'ui-modal-actions'), cancel = button('取消'), submit = button('保存到项目', {}, 'ui-button ui-button-primary', 'submit'); cancel.onclick = closeEditorDrawer; actions.append(cancel, submit); form.append(actions)
    showEditorModal(form); protectForm.begin(form, { key: `${key}:${item?.id || 'new'}` })
    form.onsubmit = async event => {
      event.preventDefault()
      const data = Object.fromEntries(new FormData(form)); data.tags = data.tags.split(',').map(tag => tag.trim()).filter(Boolean); data.order = Number(data.order); data.enabled = enabled.checked
      try {
        if (key === 'projects') { data.cfgIds = [...form.elements.cfgIds.selectedOptions].map(option => option.value); assertProjects([data], cfgs) }
        else { data.steps = JSON.parse(data.steps); assertAIWorkflows([data], state.aiResources) }
        protectForm.busy(form, true); errorHost.textContent = ''
        await request(item ? `${key}/${item.id}` : key, { method: item ? 'PUT' : 'POST', body: JSON.stringify(data) })
        protectForm.clean(form); protectForm.busy(form, false); closeEditorDrawer(); toast('已保存到本地项目'); await load(key)
      } catch (error) { errorHost.textContent = error.message } finally { protectForm.busy(form, false) }
    }
  }
  for (const [key, config] of Object.entries(configs)) {
    const nav = button(config.title, { view: key }, 'nav-item'); document.querySelector('.nav-item[data-view="notes"]').after(nav)
    const section = el('section', 'view content-medium'); section.dataset.viewPanel = key
    const panel = el('div', 'ui-card panel'), toolbar = el('div', 'panel-toolbar'), create = button(`新增${config.title}`, {}, 'ui-button ui-button-primary')
    const search = document.createElement('input'); search.className = 'ui-input'; search.type = 'search'; search.placeholder = `搜索${config.title}`; search.setAttribute('aria-label', search.placeholder)
    const list = el('div', 'admin-collection-list'); toolbar.append(el('h2', '', config.title), create); panel.append(toolbar, search, list); section.append(panel); document.querySelector('[data-view-panel="notes"]').after(section)
    hosts.set(key, { list, search, items: [] }); create.onclick = () => edit(key); search.oninput = () => render(key)
  }
  function render(key) {
    const { list, search, items } = hosts.get(key); list.replaceChildren()
    const query = search.value.toLowerCase(), filtered = items.filter(item => `${item.name} ${item.description} ${item.tags.join(' ')}`.toLowerCase().includes(query))
    if (!filtered.length) list.append(el('p', 'muted', items.length ? '没有匹配内容' : '暂无内容，从新增开始'))
    for (const item of filtered.sort((a, b) => a.order - b.order)) {
      const row = el('article', 'admin-collection-row'), detail = el('div', ''), actions = el('div', 'toolbar-actions'), editButton = button('编辑'), remove = button('删除')
      detail.append(el('h3', '', item.name), el('p', 'muted', item.description), el('p', 'muted', `${item.id} · ${item.enabled ? '已启用' : '已停用'} · ${item.updated}`)); row.append(detail, actions); actions.append(editButton, remove); list.append(row)
      editButton.onclick = () => edit(key, item)
      remove.onclick = async () => { if (!await openModal({ title: `删除${configs[key].title}`, body: item.name, confirm: true })) return; try { await request(`${key}/${item.id}`, { method: 'DELETE' }); await load(key); toast('已删除') } catch (error) { toast(error.message, 'error') } }
    }
  }
  async function load(key) {
    try { hosts.get(key).items = await request(key); render(key) } catch (error) { hosts.get(key).list.replaceChildren(el('p', 'cfg-admin-error', error.message)) }
  }
  return { load, titles: Object.fromEntries(Object.entries(configs).map(([key, value]) => [key, value.title])) }
}
