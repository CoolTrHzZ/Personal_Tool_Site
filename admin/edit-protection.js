// A single form snapshot covers native inputs plus file-backed editors through extra.
export function createEditProtection({ notify = () => {} } = {}) {
  const states = new Map()
  const prefix = 'devos-admin-draft:'
  const values = form => [...form.elements].filter(field => field.name && field.type !== 'file').map(field => ({ name: field.name, type: field.type, value: field.value, checked: field.checked, selected: field.multiple ? [...field.selectedOptions].map(option => option.value) : undefined }))
  const capture = (form, state) => JSON.stringify({ values: values(form), extra: state.extra?.get() })
  const visible = form => form.isConnected && !form.closest('[hidden]') && (!form.closest('[data-view-panel]') || form.closest('[data-view-panel]').classList.contains('active'))
  const write = (form, state) => {
    if (!state.dirty) return
    try {
      const serialized = capture(form, state)
      if (new Blob([serialized]).size > 2 * 1024 * 1024) throw new Error('草稿超过 2 MiB')
      localStorage.setItem(prefix + state.key, serialized)
      state.status.textContent = '有未保存修改 · 草稿已保存在此浏览器'
    } catch { state.status.textContent = '有未保存修改 · 草稿保存失败，请保持页面开启或复制内容'; if (!state.warned) { notify('浏览器无法保存草稿，请保持页面开启或复制内容。', 'error'); state.warned = true } }
  }
  const changed = form => {
    const state = states.get(form)
    if (!state || state.busy) return
    state.left = false
    state.dirty = capture(form, state) !== state.baseline
    state.status.textContent = state.dirty ? '有未保存修改' : '所有修改已保存'
    if (!state.dirty) { try { localStorage.removeItem(prefix + state.key) } catch { notify('未能清理浏览器旧草稿。', 'error') }; state.banner.querySelectorAll('button').forEach(button => button.remove()) }
    clearTimeout(state.timer)
    state.timer = setTimeout(() => write(form, state), 250)
  }
  const end = form => {
    const state = states.get(form)
    if (!state) return
    clearTimeout(state.timer)
    form.removeEventListener('input', state.listener); form.removeEventListener('change', state.listener)
    state.banner.remove()
    for (const [field, disabled] of state.disabled || []) field.disabled = disabled
    form.removeAttribute('aria-busy')
    states.delete(form)
  }
  const begin = (form, { key = `${form.id}:${form.elements.originalId?.value || 'new'}`, extra, afterRestore } = {}) => {
    for (const [node] of states) if (!node.isConnected) end(node)
    end(form)
    const banner = document.createElement('div'); banner.className = 'admin-draft'; banner.setAttribute('role', 'status')
    const status = document.createElement('span'); status.textContent = '所有修改已保存'; banner.append(status)
    const state = { key, extra, status, banner, dirty: false, busy: false, listener: () => changed(form) }
    states.set(form, state); state.baseline = capture(form, state)
    form.prepend(banner); form.addEventListener('input', state.listener); form.addEventListener('change', state.listener)
    let draft
    try { draft = localStorage.getItem(prefix + key) } catch { /* Storage may be unavailable; write gives an explicit warning. */ }
    if (draft && draft !== state.baseline) {
      status.textContent = '发现此条目的未保存草稿（仅此浏览器）'
      const restore = document.createElement('button'), discard = document.createElement('button')
      for (const node of [restore, discard]) { node.type = 'button'; node.className = 'ui-button ui-button-ghost ui-button-sm' }
      restore.textContent = '恢复草稿'; discard.textContent = '删除草稿'; banner.append(restore, discard)
      const removeActions = () => { restore.remove(); discard.remove() }
      discard.onclick = () => { try { localStorage.removeItem(prefix + key) } catch { notify('无法删除浏览器草稿。', 'error'); return } removeActions(); status.textContent = '草稿已删除' }
      restore.onclick = () => {
        try {
          const saved = JSON.parse(draft)
          if (!Array.isArray(saved.values)) throw new Error('草稿格式无效')
          for (const entry of saved.values) {
            const field = form.elements.namedItem(entry.name)
            if (!field || field.readOnly || field.type === 'hidden' || field.type === 'file') continue
            if (field.multiple) for (const option of field.options) option.selected = entry.selected?.includes(option.value) || false
            else if (field.type === 'checkbox' || field.type === 'radio') field.checked = Boolean(entry.checked)
            else field.value = entry.value
          }
          if (saved.extra !== undefined) extra?.set(saved.extra)
          afterRestore?.(); removeActions(); changed(form)
        } catch (error) { notify(`草稿恢复失败：${error.message}`, 'error') }
      }
    }
  }
  const clean = form => {
    const state = states.get(form); if (!state) return
    clearTimeout(state.timer); state.dirty = false; state.busy = false; state.baseline = capture(form, state); state.status.textContent = '所有修改已保存'; state.banner.querySelectorAll('button').forEach(button => button.remove())
    try { localStorage.removeItem(prefix + state.key) } catch { notify('内容已保存，但浏览器旧草稿未能清理。', 'error') }
  }
  const busy = (form, value) => {
    const state = states.get(form); if (!state) return
    state.busy = value; form.setAttribute('aria-busy', String(value))
    if (value) { write(form, state); state.disabled = [...form.elements].map(field => [field, field.disabled]); for (const [field] of state.disabled) field.disabled = true }
    else for (const [field, disabled] of state.disabled || []) field.disabled = disabled
  }
  const mayLeave = (form) => {
    const active = [...states].filter(([node]) => form ? node === form : visible(node))
    if (active.some(([, state]) => state.busy)) { notify('正在保存，请稍候再离开。', 'error'); return false }
    const dirty = active.filter(([, state]) => state.dirty)
    if (!dirty.length) return true
    dirty.forEach(([node, state]) => write(node, state))
    if (!window.confirm('还有未保存修改。离开后可在此浏览器重新打开条目恢复草稿；确定离开？')) return false
    // Keep the draft but cease guarding editors that were deliberately left.
    dirty.forEach(([, state]) => { state.dirty = false; state.left = true })
    return true
  }
  window.addEventListener('beforeunload', event => {
    const active = [...states].filter(([node, state]) => visible(node) && (state.dirty || state.busy))
    if (!active.length) return
    active.forEach(([form, state]) => write(form, state)); event.preventDefault(); event.returnValue = ''
  })
  return { begin, end, changed, clean, busy, mayLeave, hasChanges: form => Boolean(states.get(form)?.dirty), resume: form => { const state = states.get(form); if (state?.left) { state.left = false; changed(form) } } }
}
