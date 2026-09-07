const pickers = new WeakMap()
const splitTags = value => [...new Set(String(value || '').split(/[,，]/).map(tag => tag.trim()).filter(Boolean))]
export function matchesTag(name, query) {
  let index = 0
  const needle = [...query.trim().toLocaleLowerCase()]
  for (const character of name.toLocaleLowerCase()) if (character === needle[index]) index++
  return index === needle.length
}

export function mountTagPicker(form, { getTags, initialTags = [], locale = 'zh-CN', maxTags = 30 }) {
  const field = form.elements.namedItem('tags')
  if (!field) return
  if (pickers.has(field)) return pickers.get(field).refresh()
  const en = locale === 'en-US', label = en ? 'Search or create tags' : '搜索或新建标签'
  const make = (tag, className, text = '') => { const node = document.createElement(tag); node.className = className; node.textContent = text; return node }
  const action = (text, handler, className = 'tag-option') => { const node = make('button', className, text); node.type = 'button'; node.onclick = handler; return node }
  const wrapper = field.closest('label')
  if (wrapper) { const group = make('div', wrapper.className); group.append(...wrapper.childNodes); wrapper.replaceWith(group) }
  // Text inputs keep value separate from defaultValue, so opening a new form clears old tags on reset.
  const originalValue = field.value
  field.type = 'text'; field.hidden = true; field.defaultValue = ''; field.value = originalValue; field.dataset.restoreValue = 'true'
  let host = field.parentElement.querySelector('.tags-picker')
  if (!host) { host = make('div', 'tags-picker'); field.after(host) }
  host.setAttribute('role', 'group'); host.setAttribute('aria-label', en ? 'Tags' : '标签')
  const search = make('input', 'ui-input picker-search'); search.type = 'search'; search.placeholder = label; search.setAttribute('aria-label', label)
  const selectedHost = make('div', 'tag-chips'), options = make('div', 'tag-option-list'), feedback = make('p', 'picker-empty')
  feedback.setAttribute('role', 'status')
  const hint = make('small', 'picker-empty', en ? 'Choose tags or type a new one and press Enter. Commas add several tags.' : '点击选择；输入新标签后按 Enter 添加，支持逗号批量添加。')
  const retry = action(en ? 'Retry loading tags' : '重新加载标签', () => refresh(), 'ui-button ui-button-ghost ui-button-sm'); retry.hidden = true
  host.replaceChildren(search, selectedHost, options, hint, feedback, retry)
  let candidates = initialTags, revision = 0
  const disabled = () => field.disabled || field.readOnly
  const names = () => [...new Set(candidates.map(item => typeof item === 'string' ? item : item.name).filter(name => typeof name === 'string'))]
  const validation = (message = '') => { search.setCustomValidity(message); search.setAttribute('aria-invalid', String(Boolean(message))); feedback.textContent = message }
  const write = tags => {
    if (disabled()) return
    if (tags.length > maxTags || tags.some(tag => tag.length > 64 || [...tag].some(character => { const code = character.charCodeAt(0); return code < 32 || (code >= 127 && code <= 159) || character === ',' || character === '，' }))) { validation(en ? `Use up to ${maxTags} tags, each at most 64 characters, without control characters.` : `最多 ${maxTags} 个标签，每个不超过 64 个字符，不能包含控制字符。`); return false }
    field.value = tags.join(', '); validation()
    field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true })); draw(); return true
  }
  const add = value => {
    const existing = names(), tags = splitTags(field.value)
    for (const raw of splitTags(value)) {
      const tag = existing.find(name => name.toLocaleLowerCase() === raw.toLocaleLowerCase()) || raw
      if (!tags.some(name => name.toLocaleLowerCase() === tag.toLocaleLowerCase())) tags.push(tag)
    }
    if (write(tags)) { search.value = ''; draw() }
  }
  const draw = () => {
    const focused = document.activeElement, optionName = options.contains(focused) ? focused.dataset.tagOption : undefined, creating = options.contains(focused) && focused.dataset.createTag === 'true'
    const chipIndex = [...selectedHost.children].indexOf(focused)
    const selected = splitTags(field.value), locked = disabled(), query = search.value.trim()
    search.disabled = locked; retry.disabled = locked
    selectedHost.replaceChildren(...selected.map(tag => {
      const chip = action(`${tag} ×`, () => write(selected.filter(value => value !== tag)))
      chip.setAttribute('aria-label', `${en ? 'Remove tag' : '移除标签'} ${tag}`); chip.setAttribute('aria-pressed', 'true'); chip.disabled = locked; return chip
    }))
    selectedHost.hidden = !selected.length
    const filtered = names().filter(name => matchesTag(name, query))
    options.replaceChildren(...filtered.map(name => {
      const option = action(name, () => selected.includes(name) ? write(selected.filter(value => value !== name)) : add(name))
      option.dataset.tagOption = name; option.setAttribute('aria-pressed', String(selected.includes(name))); option.disabled = locked; return option
    }))
    if (query && !names().some(name => name.toLocaleLowerCase() === query.toLocaleLowerCase())) {
      const create = action(`${en ? 'Add' : '添加'}「${query}」`, () => add(query)); create.dataset.createTag = 'true'; create.disabled = locked; options.append(create)
    } else if (!filtered.length) options.append(make('span', 'picker-empty', en ? 'No tags yet. Create one above.' : '暂无候选标签，可直接输入新标签。'))
    if (!locked && (optionName !== undefined || creating || chipIndex !== -1)) {
      const next = chipIndex !== -1 ? [...selectedHost.children].find(chip => chip.getAttribute('aria-label') === focused.getAttribute('aria-label')) || selectedHost.children[Math.min(chipIndex, selectedHost.children.length - 1)] : [...options.children].find(option => optionName !== undefined ? option.dataset.tagOption === optionName : option.dataset.createTag === 'true')
      const target = next || search
      target.focus({ preventScroll: true })
    }
  }
  search.addEventListener('input', event => { event.stopPropagation(); validation(); if (!event.isComposing && /[,，]/.test(search.value)) add(search.value); else draw() })
  search.addEventListener('change', event => event.stopPropagation())
  search.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) return
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); if (search.value.trim()) add(search.value) }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); [...options.querySelectorAll('button:not(:disabled)')].at(event.key === 'ArrowDown' ? 0 : -1)?.focus() }
    if (event.key === 'Escape' && search.value) { event.preventDefault(); event.stopPropagation(); search.value = ''; validation(); draw() }
  })
  for (const list of [selectedHost, options]) list.addEventListener('keydown', event => {
    const buttons = [...list.querySelectorAll('button:not(:disabled)')], index = buttons.indexOf(event.target)
    if (index === -1 || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return
    event.preventDefault(); event.stopPropagation()
    const next = event.key === 'Escape' ? search : event.key === 'Home' ? buttons[0] : event.key === 'End' ? buttons.at(-1) : buttons[index + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1)] || search
    next.focus()
  })
  const refresh = async () => {
    const current = ++revision; search.value = ''; validation(); draw(); retry.hidden = true
    try { const items = await getTags(); if (!Array.isArray(items)) throw new Error('Invalid tags'); if (current === revision && form.isConnected) { candidates = items; draw(); feedback.textContent = search.validationMessage } }
    catch { if (current === revision && form.isConnected) { feedback.textContent = search.validationMessage || (en ? 'Could not load tags. Existing values are kept; new tags can still be added.' : '标签目录加载失败；已有标签保留，仍可自定义添加。'); retry.hidden = false } }
  }
  const resetSearch = () => { search.value = ''; validation(); draw() }
  form.addEventListener('devos:picker-sync', resetSearch)
  form.addEventListener('reset', () => window.queueMicrotask(resetSearch))
  new MutationObserver(draw).observe(field, { attributes: true, attributeFilter: ['disabled', 'readonly'] })
  pickers.set(field, { refresh }); return refresh()
}
