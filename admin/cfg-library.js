import { hasUnsupportedCfgControl } from '../shared/cfg-text.js'

const MAX_BYTES = 256 * 1024

export function mountCfgLibrary({ request, openModal, showEditorModal, closeEditorDrawer, hideEditorForms, toast, el, button, protectForm }) {
  const $ = selector => document.querySelector(selector)
  const form = $('#cfg-form')
  const field = name => form.elements.namedItem(name)
  let records = [], editing = null, content, replacement = false, previewOnly = false
  let revision = 0, reading = false, saving = false, listRevision = 0
  const historyBox = el('section', 'cfg-admin-history')
  historyBox.id = 'cfg-history'; historyBox.setAttribute('aria-label', 'CFG 历史版本')
  form.querySelector('.ui-modal-actions').before(historyBox)
  const versionLabel = el('p', 'muted'); versionLabel.id = 'cfg-version-label'
  form.querySelector('.cfg-admin-publish-note').after(versionLabel)
  const error = (selector, message = '') => { $(selector).textContent = message; $(selector).hidden = !message }
  const showContent = () => {
    form.querySelectorAll('input, textarea, button, select').forEach(node => { node.disabled = saving || (reading && content === undefined && node.id !== 'cfg-cancel') })
    $('#cfg-file').disabled = saving || previewOnly || (reading && content === undefined)
    $('#cfg-content-preview').textContent = content ?? '选择文件后可预览原文。'
    $('#cfg-download').disabled = saving || content === undefined
    $('#cfg-save').disabled = reading || saving || content === undefined
    historyBox.querySelectorAll('[data-history-ready]').forEach(node => { node.disabled = saving || node.dataset.historyReady !== 'true' })
  }
  const saveDownload = (filename, text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const link = el('a', '')
    link.href = url; link.download = filename
    document.body.append(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const beginProtection = () => protectForm?.begin(form, { key: `cfg:${editing?.id || 'new'}`, extra: {
    get: () => ({ content, replacement }), set: value => {
      if (!value || (value.content !== undefined && (typeof value.content !== 'string' || new window.TextEncoder().encode(value.content).length > MAX_BYTES))) throw new Error('CFG 草稿原文格式无效或超过 256 KiB。')
      content = value.content; replacement = Boolean(value.replacement); showContent()
    },
  } })
  function renderHistory(item) {
    historyBox.replaceChildren()
    versionLabel.textContent = `当前版本 v${item?.version || 1} · 替换文件或文件名时自动保存历史并递增版本`
    if (!item?.history?.length) return
    historyBox.append(el('h3', '', '历史版本'))
    const label = el('label', 'ui-field'), select = el('select', 'ui-input')
    select.setAttribute('aria-label', '历史 CFG 版本')
    select.append(new Option('选择历史版本预览', ''))
    for (const old of item.history) select.append(new Option(`v${old.version} · ${old.updated} · ${old.filename}`, old.id))
    label.append(el('span', 'ui-field-label', '历史 CFG 版本'), select)
    const note = el('p', 'muted'), status = el('p', 'muted'), preview = el('pre', 'cfg-admin-history-code'), actions = el('div', 'cfg-admin-actions')
    status.setAttribute('role', 'status'); preview.id = 'cfg-history-preview'; preview.tabIndex = 0
    const download = button('下载历史 CFG'), rollback = button('回滚为新版本')
    download.dataset.historyReady = 'false'; rollback.dataset.historyReady = 'false'
    download.disabled = true; rollback.disabled = true; rollback.hidden = previewOnly
    let chosen = null, historicContent, run = 0
    select.addEventListener('change', async () => {
      const current = ++run, opened = revision
      chosen = item.history.find(old => old.id === select.value) || null
      historicContent = undefined; preview.textContent = ''; note.textContent = chosen?.changelog || ''; download.disabled = true; rollback.disabled = true; download.dataset.historyReady = 'false'; rollback.dataset.historyReady = 'false'
      if (!chosen) { status.textContent = ''; return }
      status.textContent = '正在读取历史版本…'
      try {
        const result = await request(`cfgs/${encodeURIComponent(item.id)}/versions/${encodeURIComponent(chosen.id)}`)
        if (current !== run || opened !== revision || form.hidden) return
        if (typeof result.content !== 'string') throw new Error('历史版本内容无效。')
        historicContent = result.content; preview.textContent = historicContent; status.textContent = `v${chosen.version} · ${chosen.filename}`
        download.dataset.historyReady = 'true'; rollback.dataset.historyReady = String(!previewOnly); showContent()
      } catch (failure) { if (current === run && opened === revision) status.textContent = failure.message || '历史版本读取失败。' }
    })
    download.addEventListener('click', () => { if (chosen && historicContent !== undefined) saveDownload(chosen.filename, historicContent) })
    rollback.addEventListener('click', async () => {
      if (!chosen || historicContent === undefined || previewOnly || saving) return
      const target = chosen
      if (!await openModal({ title: '回滚 CFG 版本', body: `将 v${target.version} 另存为新的当前版本，保留现有历史。当前表单未保存的修改将舍弃。是否继续？`, confirm: true, okText: '确认回滚' })) return
      saving = true; protectForm?.busy(form, true); showContent(); status.textContent = '正在回滚…'
      try {
        await request(`cfgs/${encodeURIComponent(item.id)}/rollback`, { method: 'POST', body: JSON.stringify({ revisionId: target.id }) })
        protectForm?.clean(form); saving = false; protectForm?.busy(form, false); closeEditorDrawer(); toast(`已将 v${target.version} 回滚为新版本`); await load()
      } catch (failure) { status.textContent = failure.message || '回滚失败，现有版本未改变。' }
      finally { saving = false; protectForm?.busy(form, false); showContent() }
    })
    actions.append(download, rollback); historyBox.append(label, note, status, preview, actions)
  }
  function render() {
    const query = $('#cfg-query').value.trim().toLocaleLowerCase()
    const matches = records.filter(item => [item.name, item.filename, item.description, item.category, ...(item.tags || [])].join(' ').toLocaleLowerCase().includes(query))
    $('#cfg-library-count').textContent = query ? `找到 ${matches.length} / ${records.length} 份配置` : `${records.length} 份公开配置 · 保存后随下一次站点发布更新`
    const list = $('#cfg-list')
    list.replaceChildren()
    if (!matches.length) { list.append(el('p', 'muted cfg-admin-empty', query ? '没有匹配的配置。' : '还没有 CFG。上传常用配置，发布后即可在其他机器下载。')); return }
    for (const item of matches) {
      const card = el('article', 'cfg-admin-card')
      card.dataset.cfgId = item.id
      card.setAttribute('aria-label', item.name)
      const details = el('div', 'cfg-admin-details')
      details.append(el('h3', '', item.name), el('p', 'cfg-admin-filename', item.filename), el('p', 'muted', item.description || '暂无说明'))
      const meta = el('div', 'cfg-admin-tags')
      for (const value of [item.category || '未分类', ...(item.tags || [])]) meta.append(el('span', '', value))
      meta.append(el('small', '', `v${item.version || 1} · 更新 ${item.updated} · ${item.history?.length || 0} 个历史版本`))
      details.append(meta)
      const actions = el('div', 'cfg-admin-actions')
      const preview = button('预览'), edit = button('编辑'), remove = button('删除', {}, 'ui-button ui-button-danger ui-button-sm')
      preview.addEventListener('click', () => void open(item, true))
      edit.addEventListener('click', () => void open(item))
      const download = el('a', 'ui-button ui-button-ghost ui-button-sm', '下载')
      download.href = `/cfgs/${encodeURIComponent(item.id)}.cfg`; download.download = item.filename
      remove.addEventListener('click', async () => {
        if (!await openModal({ title: '删除 CFG 配置', body: `删除「${item.name}」及其全部历史 CFG 文件？已发布站点会在下一次发布后更新。`, confirm: true, okText: '删除配置' })) return
        remove.disabled = true
        try { await request(`cfgs/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); toast('已从本地项目删除 CFG'); await load() }
        catch (failure) { error('#cfg-library-error', failure.message || '删除失败，请重试。') }
        finally { remove.disabled = false }
      })
      actions.append(preview, download, edit, remove)
      card.append(details, actions); list.append(card)
    }
  }
  async function load() {
    const current = ++listRevision
    $('#cfg-refresh').disabled = true
    error('#cfg-library-error')
    try {
      const result = await request('cfgs')
      if (current !== listRevision) return
      if (!Array.isArray(result)) throw new Error('配置目录格式异常。')
      records = result.slice().sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh'))
      render()
    } catch (failure) { if (current === listRevision) error('#cfg-library-error', failure.message || '配置库载入失败，请刷新重试。') }
    finally { if (current === listRevision) $('#cfg-refresh').disabled = false }
  }
  async function open(item = null, readOnly = false) {
    if (saving) { toast('配置正在保存，请稍候。', 'error'); return }
    if (protectForm && !protectForm.mayLeave()) return
    protectForm?.end?.(form)
    const current = ++revision
    editing = item; content = undefined; replacement = false; previewOnly = readOnly; reading = Boolean(item)
    hideEditorForms(); form.reset(); form.hidden = false
    for (const name of ['name', 'filename', 'description', 'changelog', 'category', 'tags', 'order']) {
      if (!field(name)) continue
      field(name).value = name === 'tags' ? (item?.tags || []).join(', ') : item?.[name] ?? (name === 'order' ? '10' : name === 'category' ? '通用' : '')
      field(name).readOnly = readOnly
    }
    $('#cfg-file').value = ''; $('#cfg-file').disabled = readOnly || reading
    form.querySelector('.cfg-admin-file').hidden = readOnly
    $('#cfg-save').hidden = readOnly
    $('#cfg-cancel').textContent = readOnly ? '关闭' : '取消'
    $('#cfg-file-status').textContent = item ? '正在读取原文…' : '请选择 UTF-8 .cfg 文件，最大 256 KiB；支持社区服彩色字体控制符。'
    $('#editor-drawer-title').textContent = readOnly ? '预览 CFG 配置' : item ? '编辑 CFG 配置' : '上传 CFG 配置'
    renderHistory(item); error('#cfg-form-error'); showContent(); showEditorModal(form)
    if (!item) { beginProtection(); return }
    try {
      const loaded = await request(`cfgs/${encodeURIComponent(item.id)}`)
      if (current !== revision || form.hidden) return
      if (typeof loaded.content !== 'string') throw new Error('无法读取 CFG 原文。')
      content = loaded.content
      editing = loaded; renderHistory(loaded)
      $('#cfg-file-status').textContent = `${item.filename} · 编辑元信息会保留原始文件；选择文件可替换。`
    } catch (failure) { if (current === revision && !form.hidden) error('#cfg-form-error', failure.message || '无法读取原文，请关闭后重试。') }
    finally { if (current === revision) { reading = false; $('#cfg-file').disabled = readOnly; showContent(); if (content !== undefined && !readOnly) beginProtection() } }
  }
  $('#cfg-file').addEventListener('change', async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const current = ++revision
    reading = true; showContent(); error('#cfg-form-error')
    try {
      if (!/\.cfg$/i.test(file.name)) throw new Error('请选择 .cfg 文件。')
      if (file.size > MAX_BYTES) throw new Error('单个 CFG 不能超过 256 KiB。')
      let next
      try { next = new window.TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer()) }
      catch { throw new Error('文件不是有效 UTF-8，请转换编码后再上传。') }
      if (hasUnsupportedCfgControl(next)) throw new Error('文件包含二进制或不支持的控制字符；CFG 彩色字体控制符可以保留。')
      if (current !== revision || form.hidden) return
      content = next; replacement = true
      field('filename').value = file.name
      if (!field('name').value.trim()) field('name').value = file.name.replace(/\.cfg$/i, '')
      $('#cfg-file-status').textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KiB · 原始 BOM 与换行符均保留，彩色字体控制符原样保留`
      protectForm?.changed(form)
    } catch (failure) { if (current === revision && !form.hidden) error('#cfg-form-error', `${failure.message} 已有内容保持不变。`) }
    finally { if (current === revision) { reading = false; showContent() } }
  })
  form.addEventListener('submit', async event => {
    event.preventDefault()
    if (previewOnly || saving || reading || content === undefined || !form.reportValidity()) return
    const order = Number(field('order').value)
    if (!Number.isSafeInteger(order)) { error('#cfg-form-error', '排序必须为安全范围内的整数。'); return }
    const payload = {
      name: field('name').value.trim(), filename: field('filename').value.trim(), description: field('description').value.trim(),
      category: field('category').value.trim(), tags: [...new Set(field('tags').value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean))], order,
      changelog: field('changelog')?.value.trim() || '',
      ...(!editing || replacement ? { content } : {}),
    }
    if (!payload.name || !/^[^/\\]+\.cfg$/i.test(payload.filename)) { error('#cfg-form-error', '请填写配置名称，以及以 .cfg 结尾且不包含路径的文件名。'); return }
    const current = revision
    saving = true; protectForm?.busy(form, true); showContent(); error('#cfg-form-error')
    $('#cfg-save').textContent = '正在保存…'
    try {
      await request(editing ? `cfgs/${encodeURIComponent(editing.id)}` : 'cfgs', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) })
      protectForm?.clean(form); saving = false; protectForm?.busy(form, false)
      if (current === revision && !form.hidden) closeEditorDrawer()
      toast('CFG 已保存到本地项目，发布站点后可公开下载。')
      await load()
    } catch (failure) { if (current === revision && !form.hidden) error('#cfg-form-error', failure.message || '保存失败，表单内容已保留。'); else toast(failure.message || '保存失败。', 'error') }
    finally { saving = false; protectForm?.busy(form, false); $('#cfg-save').textContent = '保存到项目'; showContent() }
  })
  $('#cfg-add').addEventListener('click', () => void open())
  $('#cfg-refresh').addEventListener('click', () => void load())
  $('#cfg-query').addEventListener('input', render)
  $('#cfg-cancel').addEventListener('click', closeEditorDrawer)
  $('#cfg-download').addEventListener('click', () => { if (content !== undefined) saveDownload(field('filename').value.trim() || 'config.cfg', content) })
  return { load }
}
