const make = (tag, value = '', className = '') => { const item = document.createElement(tag); item.textContent = value; item.className = className; return item }
const actionFor = { app: 'url', model: 'content', prompt: 'content', agent: 'content', skill: 'install' }

export function mountCollectionLayout(form, { target }) {
  const organization = [...form.querySelectorAll(':scope > .form-section')].at(-1)
  const optional = make('details', '', 'form-advanced form-optional')
  const summary = make('summary', '说明、标签与分类')
  const body = make('div', '', 'form-advanced-fields')
  optional.append(summary, body)
  const description = form.elements.namedItem('description').closest('label')
  body.append(description, organization)
  form.querySelector(':scope > .form-advanced').before(optional)
  const complete = make('button', '显示完整表单', 'ui-button ui-button-ghost ui-button-sm collection-complete')
  complete.type = 'button'
  complete.dataset.fullForm = 'true'
  ;[...form.querySelectorAll(':scope > .form-advanced')].at(-1).before(complete)
  let full = false, others, otherBody, actionSection
  const actions = target === 'ai-resources' ? ['url', 'install', 'content'].map(key => ({ key, field: form.elements.namedItem(key), label: form.elements.namedItem(key).closest('label') })) : []
  if (actions.length) {
    actionSection = actions[0].label.parentElement
    others = make('details', '', 'form-advanced collection-other-actions')
    otherBody = make('div', '', 'form-advanced-fields')
    others.append(make('summary', '其他使用方式 · 链接、安装或配置'), otherBody)
    optional.before(others)
  }
  const sync = () => {
    complete.textContent = full ? '使用简洁表单' : '显示完整表单'
    complete.setAttribute('aria-expanded', String(full))
    if (target === 'navigation') {
      const selected = form.querySelector('[data-category-option][aria-pressed="true"] strong')?.textContent
      summary.textContent = '说明、标签与分类' + (selected ? ' · ' + selected : '')
    } else summary.textContent = '说明、标签与展示'
    if (form.elements.namedItem('description').value.trim() || form.elements.namedItem('tags').value.trim()) optional.open = true
    if (actions.length) {
      const primary = actionFor[form.elements.kind.value] || 'url'
      const hasAction = actions.some(({ field }) => field.value.trim())
      for (const { key, label, field } of actions) {
        const destination = full || key === primary ? actionSection : otherBody
        if (label.parentElement !== destination) destination.append(label)
        field.required = !hasAction && key === primary
      }
      others.hidden = full
      if (actions.some(({ key, field }) => key !== primary && field.value.trim())) others.open = true
    }
    if (full) form.querySelectorAll('details.form-advanced').forEach(details => { details.open = true })
  }
  complete.addEventListener('click', () => { full = !full; if (!full) form.querySelectorAll('details.form-advanced').forEach(details => { details.open = false }); sync() })
  for (const event of ['input', 'change']) form.addEventListener(event, event => { if (['kind', 'url', 'install', 'content', 'description', 'tags', 'category'].includes(event.target.name)) sync() })
  form.addEventListener('devos:picker-sync', sync)
  return { sync, reset: () => { full = Boolean(form.elements.originalId?.value); sync() } }
}

export function aiSetupGuide({ cloud }) {
  const guide = make('div', '', 'admin-management-result')
  guide.append(make('p', cloud ? 'AI 表单建议入口已接入；是否可用取决于私有服务配置和一次真实连接验收。此处只提供设置说明，不保存或显示密钥。' : '本地模式可提取明确字段。AI 建议目前只支持已登录的云端私有草稿模式。'))
  const steps = make('ol')
  for (const line of ['选择兼容 OpenAI Chat Completions 的服务，准备服务基础地址（通常以 /v1 结尾）和准确模型名。远程地址使用 HTTPS；同机 HTTP 只允许回环地址。', '维护者通过受保护终端一次输入地址、模型及可选密钥，写入服务器私有配置。密钥不要粘贴到聊天、收集材料或公开站点字段。当前界面没有凭据保存表单。', '回到收集表单刷新配置状态，再用下方合成材料请求一次建议；逐字段检查并勾选应用，最后显式保存草稿。保存不发布。']) steps.append(make('li', line))
  guide.append(steps, make('p', '同一私有 AI 服务供网站与 AI 资源表单共用。不自动抓取网址，不会自动保存或发布。'), make('pre', '名称：AI 连接验收示例\n描述：仅用于连接验收的合成内容。\nURL：https://example.invalid/devos-ai-check', 'admin-command'))
  return guide
}
