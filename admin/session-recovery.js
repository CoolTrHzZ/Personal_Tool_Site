// Authentication lives in memory. Recovery never submits a saved action or reloads an editor.
export function createSessionRecovery({ session = {}, fetcher = fetch, doc = document, events = window, now = Date.now, initiallySuppressed = false, onRecovered = () => {}, onUnavailable = () => {} } = {}) {
  let generation = 0, pending = null, failed = false, suppressed = initiallySuppressed, timer
  const visible = () => !doc.hidden
  const expired = value => Number.isFinite(value.idleExpiresAt) && now() >= value.idleExpiresAt || Number.isFinite(value.expiresAt) && now() >= value.expiresAt
  const clearTimer = () => { clearTimeout(timer); timer = undefined }
  const current = value => value.generation === generation && !value.controller.signal.aborted
  const waitVisible = signal => {
    if (signal.aborted) return Promise.resolve(false)
    if (visible()) return Promise.resolve(true)
    return new Promise(resolve => {
      const done = result => { doc.removeEventListener('visibilitychange', check); events.removeEventListener('focus', check); events.removeEventListener('pageshow', check); signal.removeEventListener('abort', abort); resolve(result) }
      const check = () => { if (visible()) done(true) }
      const abort = () => done(false)
      doc.addEventListener('visibilitychange', check); events.addEventListener('focus', check); events.addEventListener('pageshow', check); signal.addEventListener('abort', abort, { once: true })
    })
  }
  const readSession = async (restore, signal) => {
    const controller = new globalThis.AbortController(), abort = () => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) controller.abort()
    const timeout = setTimeout(abort, 10000)
    try {
      const response = await fetcher('/api/auth/session' + (restore ? '' : '?restore=0'), { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw Error('SESSION_UNAVAILABLE')
      const value = await response.json()
      if (value?.authenticated !== true || !['local','cloud'].includes(value.mode) || (value.mode !== 'local' && (typeof value.csrf !== 'string' || !value.csrf))) throw Error('SESSION_NOT_CONFIRMED')
      if (!restore && value.restoredSession === true) throw Error('SESSION_NOT_CONFIRMED')
      return value
    } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort) }
  }
  const deadline = () => Math.min(Number.isFinite(session.idleExpiresAt) ? session.idleExpiresAt : Infinity, Number.isFinite(session.expiresAt) ? session.expiresAt : Infinity)
  const schedule = () => {
    clearTimer()
    if (suppressed || failed || !session.authenticated || session.mode === 'local' || !Number.isFinite(deadline())) return
    timer = setTimeout(() => { if (now() >= deadline()) void recover(); else schedule() }, Math.max(5, Math.min(3600000, deadline() - now() + 5)))
  }
  function recover({ manual = false, confirmOnly = false } = {}) {
    if ((suppressed || failed) && !manual) return Promise.resolve(false)
    if (pending) return pending.promise
    if (manual) { suppressed = false; failed = false }
    clearTimer()
    const value = { generation: ++generation, controller: new globalThis.AbortController() }
    pending = value
    value.promise = (async () => {
      try {
        // Only a known elapsed deadline can open one additional cycle; failures never loop.
        for (let cycle=0;cycle<2;cycle++) {
          if (!await waitVisible(value.controller.signal) || !current(value)) return false
          let next = await readSession(!confirmOnly, value.controller.signal)
          const becameHidden = !visible()
          if (!await waitVisible(value.controller.signal) || !current(value)) return false
          if (expired(next) && !confirmOnly && cycle===0) continue
          // Cookie confirmation cannot create another session, even if Set-Cookie was blocked.
          if (becameHidden || next.restoredSession !== false && next.mode !== 'local' && !confirmOnly) next = await readSession(false, value.controller.signal)
          if (!await waitVisible(value.controller.signal) || !current(value)) return false
          if (expired(next) && !confirmOnly && cycle===0) continue
          if (expired(next)) throw Error('SESSION_EXPIRED')
          Object.assign(session, next); failed = false
          onRecovered(session); schedule(); return true
        }
        return false
      } catch {
        if (current(value)) { failed = true; clearTimer(); onUnavailable('自动恢复未完成。草稿仍保留，可以重试恢复或使用密码登录。') }
        return false
      } finally { if (pending === value) pending = null }
    })()
    return value.promise
  }
  const cancel = () => { generation++; pending?.controller.abort(); pending = null; clearTimer() }
  const resume = () => { if (visible() && (!session.authenticated || now() >= deadline())) void recover() }
  doc.addEventListener('visibilitychange', resume); events.addEventListener('focus', resume); events.addEventListener('pageshow', resume)
  return {
    recover, cancel, resumeTimer: schedule,
    confirmPassword: () => { cancel(); return recover({ manual: true, confirmOnly: true }) },
    suppress: () => { suppressed = true; cancel() },
    noteActivity: () => { if (Number.isFinite(session.idleTtlMs)) session.idleExpiresAt = Math.min(session.expiresAt, now() + session.idleTtlMs); schedule() },
    setHandlers: handlers => { if (handlers.onRecovered) onRecovered = handlers.onRecovered; if (handlers.onUnavailable) onUnavailable = handlers.onUnavailable },
    get generation() { return generation }, get suppressed() { return suppressed },
    dispose: () => { suppressed = true; cancel(); doc.removeEventListener('visibilitychange', resume); events.removeEventListener('focus', resume); events.removeEventListener('pageshow', resume) },
  }
}
