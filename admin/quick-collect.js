import { confirmedFields, collectionFields, displayValue, blank, applyBlankSuggestions } from '/shared/form-collection.js'

const labels = { name: '名称', url: 'URL', description: '描述', tags: '标签', kind: '类型', install: '安装方式', content: '配置内容' }
const node = (tag, text = '', className = '') => { const item = document.createElement(tag); item.textContent = text; item.className = className; return item }
export function mountQuickCollect(form, { target, request, changed }) {
  const panel = node('details', '', 'quick-collect')
  panel.append(node('summary', '快速收集与 AI 补空'))
  const hint = node('p', '仅分析粘贴内容，不自动读取网址。先查看逐字段差异，勾选后应用；已有值和后续手动编辑保留。', 'muted')
  const source = node('textarea', '', 'ui-input'); source.rows = 4; source.maxLength = 12000; source.setAttribute('aria-label', '粘贴文本或 URL'); source.placeholder = '名称：示例工具\nURL：https://example.com\n描述：用于…\n标签：开发, 日常'
  const actions = node('div', '', 'quick-collect-actions')
  const makeButton = text => { const button = node('button', text, 'ui-button ui-button-ghost ui-button-sm'); button.type = 'button'; return button }
  const extract = makeButton('提取明确字段'), ai = makeButton('AI 补空建议'), apply = makeButton('应用勾选建议')
  const disclosure = node('p', '点击 AI 会把粘贴材料和本表单字段发送给配置的 AI 服务；建议只修改表单，仍需点击保存私有草稿。', 'field-hint')
  const status = node('p', '', 'field-hint'); status.setAttribute('role', 'status')
  const differences = node('div', '', 'quick-collect-diffs')
  actions.append(extract, ai, apply); panel.append(hint, source, actions, disclosure, status, differences)
  form.querySelector('.form-intro')?.after(panel)
  const names = collectionFields(target), versions = {}, choices = new Map()
  let lifecycle = 0, revision = 0, controller, configured = false, busy = false, proposals = {}, snapshot = {}, expectedVersions = {}
  const current = () => Object.fromEntries(names.map(key => {
    const value = form.elements.namedItem(key)?.value || ''
    // The tag picker also retains typed tags before Enter/Add; protect that input too.
    const pending = key === 'tags' ? form.elements.namedItem('__tagInput')?.value.trim() : ''
    return [key, pending ? [value, pending].filter(Boolean).join(', ') : value]
  }))
  const render = () => {
    differences.replaceChildren()
    const latest = current(), eligible = applyBlankSuggestions(target, proposals, latest, snapshot, versions, expectedVersions)
    for (const [key, value] of Object.entries(proposals)) {
      const row = node('label', '', 'quick-collect-diff')
      const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.dataset.field = key; checkbox.disabled = !Object.hasOwn(eligible, key); checkbox.checked = !checkbox.disabled && (choices.get(key) ?? true)
      checkbox.addEventListener('change', () => choices.set(key, checkbox.checked))
      const detail = node('span')
      detail.append(node('strong', labels[key]), node('span', '当前：' + (displayValue(latest[key]) || '空白')), node('span', '建议：' + displayValue(value)))
      if (checkbox.disabled) detail.append(node('small', blank(latest[key]) ? '分析后已编辑，保留你的输入。' : '已有值保留。'))
      row.append(checkbox, detail); differences.append(row)
    }
    apply.disabled = !Object.keys(eligible).length
  }
  const propose = fields => { proposals = fields; choices.clear(); render() }
  const begin = () => { snapshot = current(); expectedVersions = { ...versions } }
  const reset = () => {
    lifecycle++; revision++; controller?.abort(); source.value = ''; proposals = {}; snapshot = {}; expectedVersions = {}; busy = false; configured = false
    for (const key of names) versions[key] = 0
    differences.replaceChildren(); apply.disabled = true; ai.disabled = true; panel.open = !form.elements.originalId?.value
    status.textContent = '正在检查 AI 服务；确定性提取和手填始终可用。'
    const turn = lifecycle, materialTurn = revision
    request('ai/status').then(value => {
      if (turn !== lifecycle) return
      configured = value.configured; ai.disabled = !configured || busy
      if (materialTurn === revision && !busy) status.textContent = configured ? 'AI 服务已配置。保存仅写入私有草稿，不发布。' : 'AI 未配置；可提取明确字段或继续手填。'
    }).catch(() => { if (turn === lifecycle && materialTurn === revision && !busy) status.textContent = 'AI 服务状态暂不可用；可提取明确字段或继续手填。' })
  }
  const invalidate = () => { revision++; controller?.abort(); proposals = {}; differences.replaceChildren(); apply.disabled = true; busy = false; ai.disabled = !configured }
  source.addEventListener('input', () => { invalidate(); status.textContent = '粘贴内容已更新；可提取明确字段或继续手填。' })
  for (const event of ['input', 'change']) form.addEventListener(event, event => {
    const key = event.target.name === '__tagInput' ? 'tags' : event.target.name
    if (names.includes(key)) { versions[key] = (versions[key] || 0) + 1; if (Object.keys(proposals).length) render() }
  })
  form.addEventListener('reset', reset)
  extract.addEventListener('click', () => {
    invalidate(); begin()
    try { const result = confirmedFields(target, source.value); propose(result.fields); status.textContent = result.warnings.join(' ') || (Object.keys(result.fields).length ? '明确字段已提取，请检查后应用。' : '未发现明确字段，可粘贴带名称/URL/描述标签的材料，或继续手填。') }
    catch (error) { status.textContent = error.message }
  })
  ai.addEventListener('click', async () => {
    if (!configured || busy) return
    invalidate(); begin(); controller = new globalThis.AbortController(); busy = true; ai.disabled = true
    const turn = revision; status.textContent = 'AI 正在提供补空建议；你仍可编辑表单。'
    try {
      const result = await request('ai/suggest', { method: 'POST', body: JSON.stringify({ target, source: source.value, current: snapshot }), signal: controller.signal })
      if (turn !== revision || form.hidden) return
      propose(result.fields); status.textContent = Object.keys(result.fields).length ? 'AI 建议未经核实，请逐字段检查后应用。' : '没有可补空建议，继续手填即可。'
    } catch (error) { if (turn === revision) status.textContent = error.name === 'AbortError' ? '已取消；可以继续手填。' : error.message }
    finally { if (turn === revision) { busy = false; ai.disabled = !configured } }
  })
  apply.addEventListener('click', () => {
    const selected = Object.fromEntries([...differences.querySelectorAll('input:checked:not(:disabled)')].map(input => [input.dataset.field, proposals[input.dataset.field]]))
    const accepted = applyBlankSuggestions(target, selected, current(), snapshot, versions, expectedVersions)
    for (const [key, value] of Object.entries(accepted)) {
      const field = form.elements.namedItem(key); field.value = displayValue(value); field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    form.dispatchEvent(new Event('devos:picker-sync', { bubbles: true })); changed(form)
    status.textContent = '已应用 ' + Object.keys(accepted).length + ' 项；尚未保存。确认后点击保存私有草稿。'
    proposals = {}; differences.replaceChildren(); apply.disabled = true
  })
  return { reset, cancel: () => { lifecycle++; invalidate() } }
}
