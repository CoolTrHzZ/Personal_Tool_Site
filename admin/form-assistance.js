export function showFormError(form, message = '') {
  let error = form.querySelector('.form-error, .cfg-admin-error')
  if (!error) {
    error = document.createElement('p')
    error.className = 'form-error'
    error.setAttribute('role', 'alert')
    const actions = form.querySelector('.ui-modal-actions')
    if (actions) actions.before(error)
    else form.append(error)
  }
  error.textContent = message
  if (message || error.classList.contains('form-error')) error.hidden = !message
}

// Generated IDs remain editable; existing and restored addresses are never rewritten.
export function assistForm(form, { idHint, fixedIdHint } = {}) {
  showFormError(form)
  const id = form.elements.namedItem('id')
  if (id) {
    delete id.dataset.suggestedId
    id.maxLength = 80
    id.pattern = '[a-z0-9][a-z0-9-]*'
    let hint = id.parentElement.querySelector('.field-hint')
    if (!hint) {
      hint = document.createElement('small'); hint.className = 'field-hint'; hint.id = `${form.id}-id-hint`
      id.after(hint); id.setAttribute('aria-describedby', hint.id)
    }
    hint.textContent = id.readOnly ? fixedIdHint : idHint
    if (!id.readOnly) id.placeholder = 'my-item'
  }
  if (form.dataset.assisted) return
  form.dataset.assisted = 'true'
  form.addEventListener('input', event => {
    const error = form.querySelector('.form-error')
    if (error) { error.textContent = ''; error.hidden = true }
    const id = form.elements.namedItem('id')
    if (!id || id.readOnly || !['name', 'title'].includes(event.target.name) || (id.value && id.value !== id.dataset.suggestedId)) return
    const name = event.target.value.trim()
    if (!name) return
    const slug = name.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64)
    const suffix = id.dataset.suggestedId?.split('-').at(-1) || window.crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8, '0')
    id.value = `${slug || 'item'}-${suffix}`
    id.dataset.suggestedId = id.value
  })
  form.addEventListener('invalid', event => {
    const field = event.target
    field.closest('details')?.setAttribute('open', '')
    const label = field.closest('.ui-field, .field')?.querySelector('.ui-field-label, .field-label')?.textContent || field.name
    showFormError(form, `${label}：${field.validationMessage}`)
    if (field.hidden) { event.preventDefault(); field.closest('.ui-field')?.querySelector('button')?.focus() }
  }, true)
}
