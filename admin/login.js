const form = document.querySelector('#login'), message = document.querySelector('#message'), submit = form.querySelector('button')
form.addEventListener('submit', async event => {
  event.preventDefault(); submit.disabled = true; message.textContent = ''
  let cooldown = 0
  try {
    const payload = Object.fromEntries(new FormData(form))
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    form.elements.password.value = ''
    const result = await response.json()
    if (response.ok) { location.replace('/admin/'); return }
    cooldown = response.status === 429 ? Math.min(30, Math.max(1, Number(response.headers.get('retry-after')) || 1)) : 0
    message.textContent = result.error || '登录未成功，请重试。'
  } catch { message.textContent = '连接失败，请稍后重试。' }
  finally {
    if (cooldown) {
      const tick = () => { message.textContent = '尝试过于频繁，请等待 ' + cooldown + ' 秒。'; if (cooldown-- > 0) setTimeout(tick, 1000); else { submit.disabled = false; message.textContent = '可以重新登录。' } }
      tick()
    } else submit.disabled = false
  }
})
