import { randomBytes, scrypt, timingSafeEqual, createHash, createHmac } from 'node:crypto'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdir, lstat, appendFile, rename, realpath } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { Buffer } from 'node:buffer'

const derive = promisify(scrypt)
const COOKIE = '__Host-devos_session'
const digest = value => createHash('sha256').update(value).digest('hex')
export async function passwordRecord(username, password) {
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_.-]{1,64}$/.test(username) || typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 512) throw new Error('用户名需为 1–64 位字母数字，密码至少 12 字符且不超过 512 字节')
  const salt = randomBytes(16).toString('hex')
  const hash = (await derive(password, salt, 64)).toString('hex')
  return { version: 1, username, salt, hash }
}
export async function privateDirectory(directory, codeRoot) {
  const target = resolve(directory)
  if (target === resolve(codeRoot) || target.startsWith(resolve(codeRoot) + sep)) throw new Error('私有数据目录必须在项目目录之外')
  await mkdir(target, { recursive: true, mode: 0o700 })
  const canonical = await realpath(target), code = await realpath(codeRoot).catch(error => { if (error.code === 'ENOENT') return resolve(codeRoot); throw error })
  if (canonical !== target || canonical === code || canonical.startsWith(code + sep)) throw new Error('私有目录不能经符号链接进入项目或 public')
  const info = await lstat(target)
  if (!info.isDirectory() || info.isSymbolicLink() || (process.getuid && (info.uid !== process.getuid() || (info.mode & 0o077)))) throw new Error('私有目录必须由运行用户拥有，权限为 0700，且不能是符号链接')
  return target
}
export async function writePasswordRecord(directory, username, password) {
  const record = await passwordRecord(username, password)
  await writeFile(join(directory, 'auth.json'), JSON.stringify(record) + '\n', { flag: 'wx', mode: 0o600 })
}
export async function loadPasswordRecord(directory) {
  const path = join(directory, 'auth.json'), info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || (process.getuid && (info.uid !== process.getuid() || (info.mode & 0o077)))) throw new Error('auth.json 必须为运行用户拥有的 0600 普通文件')
  const record = JSON.parse(await readFile(path, 'utf8'))
  if (record.version !== 1 || typeof record.username !== 'string' || !/^[a-zA-Z0-9_.-]{1,64}$/.test(record.username || '') || !/^[a-f0-9]{32}$/.test(record.salt || '') || !/^[a-f0-9]{128}$/.test(record.hash || '')) throw new Error('管理员认证文件格式无效，请在本机维护入口设置')
  return record
}
export function createAuth({ record, origin, directory, now = Date.now, sessionTtlMs = 6 * 60 * 60 * 1000, idleMs = 30 * 60 * 1000 }) {
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('云模式需要 HTTPS origin（可带独立端口，不含路径或凭据）')
  const sessions = new Map(), failures = new Map(), auditKey = randomBytes(32)
  let credits = 5, creditTime = now()
  const identity = req => {
    // The loopback reverse proxy must overwrite, rather than append, this header.
    const forwarded = req.headers['x-forwarded-for']
    return typeof forwarded === 'string' && /^[a-fA-F0-9:.]{1,64}$/.test(forwarded) ? forwarded : req.socket.remoteAddress || 'local'
  }
  const sameOrigin = req => req.headers.host === url.host && req.headers['x-forwarded-proto'] === 'https' && (!req.headers.origin || req.headers.origin === url.origin)
  const writeOrigin = req => sameOrigin(req) && req.headers['sec-fetch-site'] !== 'cross-site' && req.headers.origin === url.origin && /^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')
  const session = req => {
    const raw = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1)
    if (!/^[a-f0-9]{64}$/.test(raw || '')) return null
    const key = digest(raw), value = sessions.get(key), time = now()
    if (!value) return null
    if (time >= value.expiresAt || time - value.lastSeen >= idleMs) { sessions.delete(key); return null }
    value.lastSeen = time
    return { ...value, key }
  }
  const cookie = (token, maxAge) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`
  let auditQueue = Promise.resolve()
  const appendAudit = async (event, req, status) => {
    const path = join(directory, 'audit.jsonl')
    const info = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (info && (!info.isFile() || info.isSymbolicLink() || (process.getuid && (info.uid !== process.getuid() || (info.mode & 0o077))))) throw new Error('审计日志路径不能是符号链接')
    if (info?.size > 1024 * 1024) await rename(path, path + '.1')
    const peer = createHmac('sha256', auditKey).update(identity(req)).digest('hex').slice(0, 16)
    // No request body, password, username, raw address, cookie, token, or query string.
    await appendFile(path, JSON.stringify({ at: new Date(now()).toISOString(), event, status, peer }) + '\n', { mode: 0o600 })
  }
  const audit = (event, req, status) => { const next = auditQueue.then(() => appendAudit(event, req, status)); auditQueue = next.catch(() => {}); return next }
  const login = async (req, username, password) => {
    const time = now(), peer = identity(req)
    for (const [key, value] of failures) if (time - value.lastFailure > 10 * 60 * 1000) failures.delete(key)
    const previous = failures.get(peer)
    if (previous && time < previous.until) return { status: 429, retryAfter: Math.max(1, Math.ceil((previous.until - time) / 1000)) }
    credits = Math.min(5, credits + (time - creditTime) / 3000); creditTime = time
    if (credits < 1) return { status: 429, retryAfter: Math.max(1, Math.ceil((1 - credits) * 3)) }
    credits--
    const validInput = typeof username === 'string' && typeof password === 'string' && Buffer.byteLength(password) <= 512
    const candidate = validInput ? await derive(password, record.salt, 64) : Buffer.alloc(64)
    const accepted = timingSafeEqual(candidate, Buffer.from(record.hash, 'hex')) && username === record.username && validInput
    if (!accepted) {
      const count = (previous?.count || 0) + 1
      if (failures.size >= 1000 && !failures.has(peer)) failures.delete(failures.keys().next().value)
      failures.set(peer, { count, lastFailure: time, until: time + Math.min(30000, 1000 * 2 ** Math.min(count - 1, 5)) })
      await audit('login_failed', req, 401)
      return { status: 401 }
    }
    failures.delete(peer)
    const prior = session(req); if (prior) sessions.delete(prior.key)
    for (const [key, value] of sessions) if (time >= value.expiresAt) sessions.delete(key)
    if (sessions.size >= 16) sessions.delete(sessions.keys().next().value)
    const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex')
    sessions.set(digest(token), { csrf, expiresAt: time + sessionTtlMs, lastSeen: time })
    await audit('login_success', req, 200)
    return { status: 200, cookie: cookie(token, Math.floor(sessionTtlMs / 1000)), csrf, expiresAt: time + sessionTtlMs }
  }
  const csrfValid = (req, value) => {
    const input = req.headers['x-csrf-token']
    return writeOrigin(req) && typeof input === 'string' && /^[a-f0-9]{64}$/.test(input) && timingSafeEqual(Buffer.from(input), Buffer.from(value.csrf))
  }
  const logout = async (req, value) => { sessions.delete(value.key); await audit('logout', req, 200); return cookie('', 0) }
  return { sameOrigin, writeOrigin, session, login, csrfValid, logout, audit }
}
