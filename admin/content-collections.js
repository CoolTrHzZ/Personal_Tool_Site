import { assertProjects, assertAIWorkflows } from '/shared/content-validation.js'
export function mountContentCollections({ request, el, button, toast, openModal, showEditorModal, closeEditorDrawer, hideEditorForms, protectForm, getState }) {
  const configs = {
    projects: { title: '桌面工具库', itemTitle: '桌面工具', category: ['desktop', 'project', 'service'], defaults: { kind: 'desktop', status: 'active', body: '', repository: '', docs: '', url: '', cfgIds: [], version: '', platform: '' } },
    'ai-workflows': { title: 'AI 工作流', category: ['code-review', 'requirements', 'incident'], defaults: { category: 'code-review', steps: [{ title: '准备上下文', description: '', resourceId: '' }] } },
  }
  const hosts = new Map()
  const describeFile = download => `${download.filename} · ${(download.size / 1024 / 1024).toFixed(2)} MiB`
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
    let fileUpload = null, pendingFilename = '', reading = false, saving = false, fileRevision = 0, reader, platform, fileStatus, clearFile
    const updateFile = () => {
      if (!fileStatus) return
      fileStatus.replaceChildren()
      if (record.download) fileStatus.append(el('p', 'muted', `已保存：${describeFile(record.download)}`), el('p', 'cfg-admin-filename', `SHA-256：${record.download.sha256}`))
      fileStatus.append(el('p', 'muted', reading ? `正在读取 ${pendingFilename}…` : fileUpload ? `待保存：${pendingFilename} · ${(fileUpload.size / 1024 / 1024).toFixed(2)} MiB` : pendingFilename ? `草稿中的 ${pendingFilename} 需要重新选择文件，或取消文件替换。` : record.download ? '只修改说明会保留原文件。选择新文件后，点击保存才会替换。' : '可上传 Windows .exe 文件，最大 20 MiB；平台保存时自动识别。'))
      clearFile.hidden = !pendingFilename
      platform.disabled = Boolean(record.download || pendingFilename)
      submit.disabled = reading || saving
    }
    document.querySelector('#editor-drawer-title').textContent = `${item ? '编辑' : '新增'}${config.itemTitle || config.title}`
    form.append(el('p', 'muted', '保存到本地项目，随站点发布后公开。已有 ID 是固定地址，不可更改。'))
    field(form, 'id', 'ID / slug', record.id, { required: true }).readOnly = Boolean(item)
    field(form, 'name', '名称', record.name, { required: true })
    field(form, 'description', '说明', record.description, { rows: 3 })
    if (key === 'projects') {
      field(form, 'kind', '类型', record.kind, { options: [['desktop', '桌面工具'], ['project', '项目'], ['service', '服务']] })
      field(form, 'status', '维护状态', record.status, { options: [['active', '维护中'], ['paused', '暂停'], ['archived', '归档']] })
      field(form, 'version', '版本', record.version)
      platform = field(form, 'platform', '平台（上传 EXE 后自动识别）', record.platform, { options: [['', '未指定'], ['windows-x64', 'Windows x64'], ['windows-x86', 'Windows x86'], ['windows-arm64', 'Windows ARM64']] })
      const uploadLabel = el('label', 'ui-field'), fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = '.exe'; fileInput.className = 'ui-input'
      uploadLabel.append(el('span', 'ui-field-label', '选择或替换 EXE 文件'), fileInput)
      fileStatus = el('div', 'cfg-admin-details'); fileStatus.setAttribute('role', 'status'); fileStatus.setAttribute('aria-live', 'polite')
      clearFile = button('取消文件替换', {}, 'ui-button ui-button-ghost'); clearFile.hidden = true
      const fileActions = el('div', 'cfg-admin-actions'); fileActions.append(clearFile)
      form.append(uploadLabel, fileStatus, fileActions, el('p', 'muted', '浏览器草稿仅保存说明和文件名；离开页面后，未保存的 EXE 需重新选择。'))
      clearFile.onclick = () => {
        fileRevision++; reader?.abort(); reading = false; fileUpload = null; pendingFilename = ''; fileInput.value = ''; errorHost.textContent = ''; updateFile(); protectForm.changed(form)
      }
      fileInput.onchange = async () => {
        if (saving) return
        const file = fileInput.files?.[0]; if (!file) return
        const revision = ++fileRevision; reader?.abort()
        const previousFilename = pendingFilename
        try {
          if (!/\.exe$/i.test(file.name)) throw new Error('请选择 .exe 文件。')
          if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('EXE 文件不能为空，且不能超过 20 MiB。')
          reading = true; pendingFilename = file.name; errorHost.textContent = ''; updateFile(); protectForm.changed(form)
          const data = await new Promise((resolve, reject) => {
            reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('读取 EXE 文件失败，请重新选择。')); reader.onabort = () => reject(new Error('文件读取已取消。')); reader.readAsDataURL(file)
          })
          if (revision !== fileRevision || !form.isConnected) return
          fileUpload = { filename: file.name, data, size: file.size }
          form.elements.kind.value = 'desktop'
        } catch (error) {
          if (revision !== fileRevision || !form.isConnected) return
          pendingFilename = previousFilename; errorHost.textContent = error.message
        } finally {
          if (revision === fileRevision && form.isConnected) { reading = false; fileInput.value = ''; updateFile(); protectForm.changed(form) }
        }
      }
      for (const [name, label] of [['repository', '代码仓库'], ['docs', '文档链接'], ['url', '访问链接']]) field(form, name, label, record[name], { type: 'url' })
      field(form, 'body', '工具说明 / 使用方法（Markdown）', record.body, { rows: 12 })
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
    updateFile()
    showEditorModal(form); protectForm.begin(form, { key: `${key}:${item?.id || 'new'}`, ...(key === 'projects' ? { extra: { get: () => ({ pendingFilename }), set: value => { fileRevision++; reader?.abort(); reading = false; fileUpload = null; pendingFilename = typeof value?.pendingFilename === 'string' ? value.pendingFilename : ''; updateFile() } } } : {}) })
    form.onsubmit = async event => {
      event.preventDefault()
      if (reading || saving) return
      const data = Object.fromEntries(new FormData(form)); data.tags = data.tags.split(',').map(tag => tag.trim()).filter(Boolean); data.order = Number(data.order); data.enabled = enabled.checked
      try {
        if (key === 'projects') {
          if (pendingFilename && !fileUpload) throw new Error('请重新选择草稿中的 EXE 文件，或取消文件替换后保存。')
          if ((record.download || fileUpload) && data.kind !== 'desktop') throw new Error('含 EXE 文件的条目请选择“桌面工具”类型。')
          if (!data.platform) delete data.platform
          data.cfgIds = [...form.elements.cfgIds.selectedOptions].map(option => option.value); assertProjects([data], cfgs)
          if (fileUpload) data.fileUpload = { filename: fileUpload.filename, data: fileUpload.data }
        }
        else { data.steps = JSON.parse(data.steps); assertAIWorkflows([data], state.aiResources) }
        saving = true; protectForm.busy(form, true); errorHost.textContent = ''
        await request(item ? `${key}/${item.id}` : key, { method: item ? 'PUT' : 'POST', body: JSON.stringify(data) })
        protectForm.clean(form); protectForm.busy(form, false); closeEditorDrawer(); toast('已保存到本地项目'); await load(key)
      } catch (error) { errorHost.textContent = error.message } finally { saving = false; protectForm.busy(form, false); updateFile() }
    }
  }
  for (const [key, config] of Object.entries(configs)) {
    const nav = button(config.title, { view: key }, 'nav-item'); document.querySelector('.nav-item[data-view="notes"]').after(nav)
    const section = el('section', 'view content-medium'); section.dataset.viewPanel = key
    const panel = el('div', 'ui-card panel'), toolbar = el('div', 'panel-toolbar'), create = button(`新增${config.itemTitle || config.title}`, {}, 'ui-button ui-button-primary')
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
      if (key === 'projects') detail.append(el('p', 'muted', [item.version && `v${item.version}`, item.platform, item.download ? describeFile(item.download) : '尚未上传 EXE'].filter(Boolean).join(' · ')))
      editButton.onclick = () => edit(key, item)
      remove.onclick = async () => { if (!await openModal({ title: `删除${configs[key].itemTitle || configs[key].title}`, body: item.name, confirm: true })) return; try { await request(`${key}/${item.id}`, { method: 'DELETE' }); await load(key); toast('已删除') } catch (error) { toast(error.message, 'error') } }
    }
  }
  async function load(key) {
    try { hosts.get(key).items = await request(key); render(key) } catch (error) { hosts.get(key).list.replaceChildren(el('p', 'cfg-admin-error', error.message)) }
  }
  return { load, titles: Object.fromEntries(Object.entries(configs).map(([key, value]) => [key, value.title])) }
}
