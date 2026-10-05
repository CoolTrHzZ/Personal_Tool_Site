import { createDeviceStore, DEVICE_TTL_MS } from './admin-devices.mjs'
import { randomBytes, scrypt, timingSafeEqual, createHash, createHmac } from 'node:crypto'
import { promisify } from 'node:util'
import { readFile, writeFile, mkdir, lstat, appendFile, rename, realpath, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { Buffer } from 'node:buffer'

const derive = promisify(scrypt)
const COOKIE = '__Host-devos_session'
const DEVICE_COOKIE = '__Host-devos_device'
const digest = value => createHash('sha256').update(value).digest('hex')
export const PROFILE_AVATARS = ['D', '👤', '🧑‍💻', '🚀', '🛠️', '🌙']
function assertProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['displayName', 'avatar'].includes(key)) || typeof value.displayName !== 'string' || !value.displayName.trim() || [...value.displayName].length > 48 || [...value.displayName].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || !PROFILE_AVATARS.includes(value.avatar)) throw new Error('显示名需为 1–48 个字符，头像请选择现有选项')
  return { displayName: value.displayName.trim(), avatar: value.avatar }
}
async function privateJsonInfo(path) {
  const info = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  if (info && (!info.isFile() || info.isSymbolicLink() || info.size > 32768 || (process.getuid && (info.uid !== process.getuid() || (info.mode & 0o077))))) throw new Error('账号设置必须为运行用户拥有的 0600 普通文件且不超过 32 KiB')
  return info
}
async function readPrivateJson(directory, name) {
  const path = join(directory, name)
  if (!await privateJsonInfo(path)) return null
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { throw new Error('私有账号设置格式无效，请在维护终端核对') }
}
async function writePrivateJson(directory, name, value) {
  const path = join(directory, name), stage = path + '.' + randomBytes(8).toString('hex') + '.tmp'
  await privateJsonInfo(path)
  try { await writeFile(stage, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 }); await rename(stage, path) }
  finally { await rm(stage, { force: true }) }
}
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
  let profile = { displayName: record.username, avatar: 'D' }
  const ready = (async () => {
    const savedProfile = await readPrivateJson(directory, 'profile.json')
    if (savedProfile) {
      if (savedProfile.version !== 1) throw new Error('个人设置版本无效')
      profile = assertProfile({ displayName: savedProfile.displayName, avatar: savedProfile.avatar })
    }
  })()
  const devices = createDeviceStore({ directory, fingerprint:digest(JSON.stringify(record)), now })
  const tokenFrom = (req, name) => (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(name+'='))?.slice(name.length+1)
  const revokeSessions = (id,exceptKey) => { if (id) for (const [key,value] of sessions) if (value.deviceId===id && key!==exceptKey) sessions.delete(key) }
  let credits = 5, creditTime = now()
  const identity = req => {
    // The loopback reverse proxy must overwrite, rather than append, this header.
    const forwarded = req.headers['x-forwarded-for']
    return typeof forwarded === 'string' && /^[a-fA-F0-9:.]{1,64}$/.test(forwarded) ? forwarded : req.socket.remoteAddress || 'local'
  }
  const sameOrigin = req => req.headers.host === url.host && req.headers['x-forwarded-proto'] === 'https' && (!req.headers.origin || req.headers.origin === url.origin)
  const writeOrigin = req => sameOrigin(req) && req.headers['sec-fetch-site'] !== 'cross-site' && req.headers.origin === url.origin && /^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')
  const session = req => {
    const raw = tokenFrom(req,COOKIE)
    if (!/^[a-f0-9]{64}$/.test(raw || '')) return null
    const key = digest(raw), value = sessions.get(key), time = now()
    if (!value) return null
    if (time >= value.expiresAt || time - value.lastSeen >= idleMs) { sessions.delete(key); return null }
    value.lastSeen = time
    return { ...value, key }
  }
  const cookie = (token, maxAge, name=COOKIE) => `${name}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`
  const deviceCookie = value => cookie(value?.token || '',value ? Math.max(0,Math.floor((value.expiresAt-now())/1000)) : 0,DEVICE_COOKIE)
  const fresh = value => Number.isFinite(value.authenticatedAt) && now()-value.authenticatedAt < 5*60*1000
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
  const verify = async (req, username, password) => {
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
    return {status:200}
  }
  const issueSession = ({deviceId,deviceExpiresAt,authenticatedAt}={}) => {
    const time=now()
    for (const [key,value] of sessions) if (time>=value.expiresAt) sessions.delete(key)
    if (sessions.size>=16) sessions.delete(sessions.keys().next().value)
    const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex'),expiresAt=Math.min(time+sessionTtlMs,deviceExpiresAt ?? Infinity)
    const value={csrf,expiresAt,lastSeen:time,authenticatedAt,deviceId}
    sessions.set(digest(token),value)
    return {cookie:cookie(token,Math.floor((expiresAt-time)/1000)),csrf,expiresAt,value:{...value,key:digest(token)}}
  }
  const login = async (req,username,password,rememberDevice=false) => {
    await ready
    const checked=await verify(req,username,password);if (checked.status!==200) return checked
    let device=null
    if (rememberDevice) { device=await devices.issue(tokenFrom(req,DEVICE_COOKIE));revokeSessions(device.replacedId);revokeSessions(device.evictedId) }
    else if (tokenFrom(req,DEVICE_COOKIE)) revokeSessions(await devices.revoke(null,tokenFrom(req,DEVICE_COOKIE)))
    const prior=session(req);if (prior) sessions.delete(prior.key)
    const issued=issueSession({deviceId:device?.id,authenticatedAt:now()})
    await audit('login_success',req,200)
    return {status:200,...issued,cookies:[issued.cookie,deviceCookie(device)],rememberedDevice:Boolean(device)}
  }
  const restore = async req => {
    if (!sameOrigin(req) || req.method!=='GET') return null
    const device=await devices.consume(tokenFrom(req,DEVICE_COOKIE));if (!device) return null
    const issued=issueSession({deviceId:device.id,deviceExpiresAt:device.expiresAt})
    await audit('session_restored',req,200)
    return {...issued,cookies:[issued.cookie,deviceCookie(device)]}
  }
  const reauthenticate = async (req,value,password) => {
    const checked=await verify(req,record.username,password);if (checked.status!==200) return checked
    const active=sessions.get(value.key);if (!active) return {status:401}
    active.authenticatedAt=now();await audit('reauth_success',req,200);return {status:200}
  }
  const remember = async (req,value) => {
    if (!fresh(value)) throw Object.assign(new Error('请重新验证密码'),{statusCode:428})
    const device=await devices.issue(tokenFrom(req,DEVICE_COOKIE));revokeSessions(device.replacedId,value.key);revokeSessions(device.evictedId,value.key)
    const active=sessions.get(value.key);if (active) active.deviceId=device.id
    await audit('device_remembered',req,200);return deviceCookie(device)
  }
  const revoke = async (req,value,id) => {
    if (!/^[a-f0-9]{32}$/.test(id || '')) throw new Error('设备编号无效')
    const revoked=await devices.revoke(id);revokeSessions(revoked);await audit('device_revoked',req,200)
    return id===value.deviceId ? [cookie('',0),deviceCookie(null)] : []
  }
  const csrfValid = (req, value) => {
    const input = req.headers['x-csrf-token']
    return writeOrigin(req) && typeof input === 'string' && /^[a-f0-9]{64}$/.test(input) && timingSafeEqual(Buffer.from(input), Buffer.from(value.csrf))
  }
  const logout = async (req,value,forgetDevice=true) => {
    sessions.delete(value.key)
    if (forgetDevice) revokeSessions(await devices.revoke(value.deviceId,tokenFrom(req,DEVICE_COOKIE)))
    await audit('logout',req,200);return forgetDevice ? [cookie('',0),deviceCookie(null)] : [cookie('',0)]
  }
  const saveProfile = async value => {
    await ready
    const next = assertProfile(value)
    await writePrivateJson(directory, 'profile.json', { version: 1, ...next })
    profile = next
    return { ...profile }
  }
  return {ready,sameOrigin,writeOrigin,session,login,restore,reauthenticate,remember,revoke,listDevices:value=>devices.list(value.deviceId),deviceConfirmed:(req,value)=>devices.active(tokenFrom(req,DEVICE_COOKIE),value.deviceId).catch(()=>false),fresh,csrfValid,logout,audit,deviceTtlMs:DEVICE_TTL_MS,idleMs,profile:()=>({...profile}),saveProfile}
}
