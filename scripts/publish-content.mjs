import { mkdir, readFile, readdir, lstat, rm, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { exportSiteBackup, decodeSiteBackup, validateStaged, BACKUP_ROOTS } from './site-backup.mjs'
import { draftPreview } from './admin-state.mjs'
import { PERMISSION_KEYS } from './tool-manifest.mjs'

const common = ['id', 'name', 'description', 'tags', 'order', 'enabled', 'updated']
const schemas = {
  site: ['name','title','description','toolsDescription','navigationDescription','libraryDescription','aiHubDescription','notesDescription','github','footer','logo','publicUrl','adminUrl','basePath','tagline','todayContinueLimit'],
  navigation: [...common, 'category', 'url', 'icon'],
  categories: ['id','name','order','icon'],
  library: [...common, 'kind', 'url', 'language'],
  'ai-resources': [...common, 'kind', 'url', 'install', 'content'],
  notes: ['id','title','summary','body','tags','order','enabled','updated','kind','projectId','cfgIds'],
  projects: [...common, 'kind','status','body','repository','docs','url','cfgIds','version','platform','download'],
  'ai-workflows': [...common, 'category','steps'],
  cfgs: ['id','name','description','category','filename','tags','order','updated','version','changelog','history'],
  tags: null,
}
const manifestKeys = ['id','name','version','type','runtime','format','entry','description','icon','category','keywords','tags','author','updated','status','readme','license','favorite','enabled','order','display','permissions']
const forbidden = /^(?:auth|runtime|ai-provider|github-publisher|process|candidate|release|owner|credentials|secrets|provider|state|session|journal|audit)\.(?:json|jsonl)$/i
export function publicPath(path) {
  if (typeof path !== 'string' || path.length > 1024 || path.includes('\\') || [...path].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || path.split('/').some(part => !part || part === '..' || part.startsWith('.') || forbidden.test(part))) return false
  if (path.startsWith('src/data/')) return Object.keys(schemas).some(key => path === 'src/data/' + key + '.json')
  return path === 'src/tools/manifests/core.json' || path === 'public/tools-manifests.json' || ['public/cfgs/', 'public/tools/', 'public/downloads/'].some(root => path.startsWith(root))
}
function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error('公开字段未识别或格式无效：' + label)
}
function manifest(value) {
  object(value, manifestKeys, 'tool manifest')
  if (value.permissions !== undefined) object(value.permissions, PERMISSION_KEYS, 'permissions')
  if (value.display !== undefined) object(value.display, ['mode','height'], 'display')
}
function fields(path, bytes) {
  if (!path.startsWith('src/data/') && !['src/tools/manifests/core.json','public/tools-manifests.json'].includes(path) && !/^public\/tools\/[^/]+\/manifest\.json$/.test(path)) return
  const text = bytes.toString('utf8')
  if (!Buffer.from(text).equals(bytes)) throw new Error('公开 JSON 必须为 UTF-8：' + path)
  const value = JSON.parse(text)
  if (!path.startsWith('src/data/')) { if (Array.isArray(value)) value.forEach(manifest); else manifest(value); return }
  const kind = path.slice(9, -5)
  if (kind === 'tags') return
  const items = kind === 'site' ? [value] : value
  if (!Array.isArray(items)) throw new Error('公开集合格式无效：' + path)
  for (const item of items) {
    object(item, schemas[kind], kind)
    if (item.download !== undefined) object(item.download, ['filename','size','sha256'], 'download')
    if (item.steps !== undefined) { if (!Array.isArray(item.steps)) throw new Error('steps 无效'); item.steps.forEach(step => object(step, ['title','description','resourceId'], 'workflow step')) }
    if (item.history !== undefined) { if (!Array.isArray(item.history)) throw new Error('history 无效'); item.history.forEach(row => object(row, ['id','version','filename','updated','changelog'], 'CFG history')) }
    for (const key of ['url','github','publicUrl','adminUrl','repository','docs']) if (item[key]) {
      const url = new URL(item[key])
      if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('公开链接不能带凭据：' + kind + '.' + key)
    }
  }
}
export async function publicSnapshot(codeRoot, draftRoot) {
  const before = await draftPreview(codeRoot, draftRoot)
  for (const name of await readdir(join(draftRoot, 'public'))) if (!['cfgs','tools','downloads','tools-manifests.json'].includes(name)) throw new Error('本批不支持公开路径 public/' + name + '，不会静默省略')
  const archive = decodeSiteBackup((await exportSiteBackup(draftRoot)).content)
  const toolIds = new Set(archive.files.flatMap(file => { const match = file.path.match(/^public\/tools\/([^/]+)\/manifest\.json$/); return match ? [match[1]] : [] }))
  const projects = JSON.parse(Buffer.from(archive.files.find(file => file.path === 'src/data/projects.json').content,'base64').toString('utf8'))
  if (!Array.isArray(projects)) throw new Error('项目公开列表无效')
  const downloads = new Set(projects.filter(item => item.download).map(item => 'public/downloads/' + item.id + '/' + item.download.filename))
  for (const file of archive.files) {
    if (file.path.startsWith('public/tools/') && file.path !== 'public/tools/toolbox-bridge.js' && !toolIds.has(file.path.split('/')[2])) throw new Error('未注册工具路径不在本批公开范围：' + file.path)
    if (file.path.startsWith('public/downloads/') && !downloads.has(file.path)) throw new Error('未登记下载路径不在本批公开范围：' + file.path)
    if (!publicPath(file.path)) throw new Error('拒绝未支持或私有路径：' + file.path)
    fields(file.path, Buffer.from(file.content, 'base64'))
  }
  if ((await draftPreview(codeRoot, draftRoot)).fingerprint !== before.fingerprint) throw new Error('草稿在读取期间变化，请重新预览')
  return { files: archive.files, fingerprint: before.fingerprint, hash: createHash('sha256').update(JSON.stringify(archive.files.map(file => [file.path,file.sha256]))).digest('hex') }
}
export async function writePublicSnapshot(snapshot, root, clear = false) {
  for (const path of BACKUP_ROOTS) {
    let parent = root
    for (const part of path.split('/')) {
      parent = join(parent, part)
      const info = await lstat(parent).catch(error => { if (error.code === 'ENOENT') return null; throw error })
      if (info?.isSymbolicLink()) throw new Error('公开目标父路径不能是符号链接')
    }
    if (clear) await rm(join(root, path), { recursive: true, force: true })
    if (!path.endsWith('.json')) await mkdir(join(root, path), { recursive: true })
  }
  for (const file of snapshot.files) {
    if (!publicPath(file.path)) throw new Error('公开路径无效')
    await mkdir(dirname(join(root, file.path)), { recursive: true })
    await writeFile(join(root, file.path), Buffer.from(file.content, 'base64'))
  }
}
export async function validatePublicSnapshot(codeRoot, snapshot, stage) {
  await writePublicSnapshot(snapshot, stage)
  await validateStaged(codeRoot, stage)
  const site = JSON.parse(await readFile(join(stage, 'src/data/site.json'), 'utf8'))
  return site.publicUrl || ''
}
