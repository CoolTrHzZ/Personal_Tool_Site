import { randomBytes, createHash } from 'node:crypto'
import { readFile, writeFile, lstat, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

export const DEVICE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const digest = value => createHash('sha256').update(value).digest('hex')
const hex = (value, size) => typeof value === 'string' && new RegExp('^[a-f0-9]{'+size+'}$').test(value)
export function createDeviceStore({ directory, fingerprint, now }) {
  const path = join(directory, 'remembered-devices.json')
  let queue = Promise.resolve()
  const read = async () => {
    const info = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (!info) return { version:1, fingerprint, devices:[] }
    if (!info.isFile() || info.isSymbolicLink() || info.size > 32768 || (process.getuid && (info.uid !== process.getuid() || (info.mode & 0o077)))) throw new Error('设备记录必须是运行用户拥有的私有普通文件')
    const data = JSON.parse(await readFile(path,'utf8'))
    if (!data || data.version !== 1 || Object.keys(data).some(key => !['version','fingerprint','devices'].includes(key)) || !hex(data.fingerprint,64) || !Array.isArray(data.devices) || data.devices.length > 16) throw new Error('设备记录格式无效')
    const ids = new Set(), hashes = new Set()
    for (const item of data.devices) {
      if (!item || Object.keys(item).some(key => !['id','hash','createdAt','expiresAt','lastUsedAt'].includes(key)) || !hex(item.id,32) || !hex(item.hash,64) || ids.has(item.id) || hashes.has(item.hash) || ![item.createdAt,item.expiresAt,item.lastUsedAt].every(Number.isSafeInteger) || item.createdAt < 0 || item.lastUsedAt < item.createdAt || item.expiresAt <= item.createdAt || item.expiresAt - item.createdAt > DEVICE_TTL_MS) throw new Error('设备记录格式无效')
      ids.add(item.id); hashes.add(item.hash)
    }
    return { version:1, fingerprint, devices:data.fingerprint === fingerprint ? data.devices.filter(item => item.expiresAt > now()) : [] }
  }
  const write = async data => {
    const temp = path+'.'+randomBytes(12).toString('hex')+'.tmp'
    try { await writeFile(temp,JSON.stringify(data)+'\n',{flag:'wx',mode:0o600}); await rename(temp,path) }
    finally { await rm(temp,{force:true}).catch(() => {}) }
  }
  const transaction = action => {
    const next = queue.then(async () => { const data=await read(), result=await action(data); await write(data); return result }).catch(() => {throw Object.assign(new Error('设备记录暂不可用，请使用密码登录或联系站点维护者'),{statusCode:503})})
    queue = next.catch(() => {}); return next
  }
  return {
    active(token, id) {
      if (!hex(token,64) || !hex(id,32)) return Promise.resolve(false)
      const next=queue.then(async()=>{const data=await read();return data.devices.some(item=>item.id===id && item.hash===digest(token))})
      queue=next.catch(()=>{});return next
    },
    issue(previousToken) { return transaction(data => {
      const old=hex(previousToken,64) ? data.devices.find(item => item.hash===digest(previousToken)) : null
      if (old) data.devices=data.devices.filter(item => item.id!==old.id)
      const evicted=data.devices.length >= 16 ? data.devices.shift() : null
      const token=randomBytes(32).toString('hex'), time=now(), item={id:randomBytes(16).toString('hex'),hash:digest(token),createdAt:time,expiresAt:time+DEVICE_TTL_MS,lastUsedAt:time}
      data.devices.push(item); return {token,id:item.id,expiresAt:item.expiresAt,replacedId:old?.id,evictedId:evicted?.id}
    }) },
    consume(token) { if (!hex(token,64)) return Promise.resolve(null); return transaction(data => {
      const item=data.devices.find(item=>item.hash===digest(token)); if (!item) return null
      const rotated=randomBytes(32).toString('hex'); item.hash=digest(rotated);item.lastUsedAt=now()
      return {token:rotated,id:item.id,expiresAt:item.expiresAt}
    }) },
    revoke(id, token) { return transaction(data => {
      const item=data.devices.find(item=>hex(id,32) ? item.id===id : hex(token,64) && item.hash===digest(token))
      if (item) data.devices=data.devices.filter(row=>row.id!==item.id)
      return item?.id || null
    }) },
    list(currentId) { return transaction(data=>data.devices.map(({id,createdAt,expiresAt,lastUsedAt})=>({id,createdAt,expiresAt,lastUsedAt,current:id===currentId}))) },
  }
}
