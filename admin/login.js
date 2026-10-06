import { createSessionRecovery } from './session-recovery.js'

const form = document.querySelector('#login'), message = document.querySelector('#message'), submit = form.querySelector('button')
const recovery = createSessionRecovery({
  initiallySuppressed: new URLSearchParams(location.search).has('signed_out'),
  onRecovered: () => { if (!submit.disabled && !document.hidden) location.replace('/admin/') },
  onUnavailable: () => { if (!submit.disabled) message.textContent = '自动恢复未完成，可以使用密码登录。' },
})
// Install this handler before waiting for any network operation: passwords must never enter a URL.
form.addEventListener('submit', async event => {
  event.preventDefault(); recovery.cancel(); submit.disabled = true; message.textContent = ''
  let cooldown = 0
  try {
    const payload = Object.fromEntries(new FormData(form)); payload.rememberDevice = form.elements.rememberDevice.checked
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    form.elements.password.value = ''
    const result = await response.json()
    if (response.ok) {
      if (await recovery.confirmPassword()) { location.replace('/admin/'); return }
      message.textContent = '登录会话未生效，请检查浏览器 Cookie 设置后重新登录。'; return
    }
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
// Native fallback remains POST; enable credentials only once the JSON handler is ready.
submit.disabled = false
void recovery.recover()
