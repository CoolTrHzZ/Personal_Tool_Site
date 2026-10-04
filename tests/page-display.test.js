// @vitest-environment node
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile, rm, mkdir, cp } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { DISPLAY_PAGES, assertPageVisibility, pageVisible } from '../shared/page-display.js'
import { prepareDrafts, draftPreview } from '../scripts/admin-state.mjs'
import { publicSnapshot, validatePublicSnapshot } from '../scripts/publish-content.mjs'

const temporary = []
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive:true, force:true }))) })

// Isolate public fixtures and synthesize the download bytes; never read or execute the owner's EXE.
async function publicFixture() {
  const original = fileURLToPath(new URL('../', import.meta.url))
  const source = await mkdtemp(join(tmpdir(), 'devos-public-fixture-')); temporary.push(source)
  for (const path of ['src/data','src/tools/registry.ts','src/tools/manifests/core.json','public/tools-manifests.json','public/cfgs','public/tools','scripts','shared']) {
    await mkdir(dirname(join(source,path)), { recursive:true })
    await cp(join(original,path),join(source,path), { recursive:true, filter:path => !path.endsWith('.exe') })
  }
  const bytes = Buffer.alloc(1024)
  bytes.write('MZ'); bytes.writeUInt32LE(128,60); bytes.writeUInt32LE(0x4550,128)
  bytes.writeUInt16LE(0x8664,132); bytes.writeUInt16LE(1,134); bytes.writeUInt16LE(240,148); bytes.writeUInt16LE(2,150)
  bytes.writeUInt16LE(0x20b,152); bytes.writeUInt16LE(3,220); bytes.writeUInt32LE(512,408); bytes.writeUInt32LE(512,412)
  const download = { filename:'Synthetic-Display-Name.exe', size:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex') }
  const project = { id:'synthetic-download', name:'合成下载', kind:'desktop', description:'', body:'', repository:'', docs:'', url:'', status:'active', tags:[], cfgIds:[], enabled:true, order:1, updated:'2026-10-03', platform:'windows-x64', download }
  const projectsPath=join(source,'src/data/projects.json')
  const projects=JSON.parse(await readFile(projectsPath,'utf8')).map(item=>{ const copy={...item}; delete copy.download; return copy })
  await writeFile(projectsPath,JSON.stringify([...projects,project]))
  const folder=join(source,'public/downloads',project.id); await mkdir(folder,{recursive:true})
  const asset=join(folder,download.sha256+'.exe'); await writeFile(asset,bytes)
  return {source,project,asset,bytes}
}

it('keeps every legacy page visible and supports independently reversible switches', () => {
  expect(() => assertPageVisibility(undefined)).not.toThrow()
  for (const page of DISPLAY_PAGES) {
    expect(pageVisible(undefined, page.id)).toBe(true)
    expect(pageVisible({ [page.id]:false }, page.id)).toBe(false)
    expect(pageVisible({ [page.id]:true }, page.id)).toBe(true)
  }
  expect(pageVisible({ cfg:false }, 'tools')).toBe(true)
})
it('rejects unknown pages, admin/home switches and non-boolean values', () => {
  for (const value of [null, [], 'all', { admin:false }, { home:false }, { unknown:true }, { cfg:'false' }, { tools:0 }, { notes:null }]) expect(() => assertPageVisibility(value)).toThrow('页面显示')
  expect(() => assertPageVisibility({ cfg:false, notes:true })).not.toThrow()
})
it('previews only the site draft, keeps all data/resources and validates the public snapshot before restoration', async () => {
  const {source} = await publicFixture()
  const state = await mkdtemp(join(tmpdir(), 'devos-page-display-')); temporary.push(state)
  const draft = await prepareDrafts(source, state)
  const original = await readFile(join(source, 'src/data/site.json'))
  const baseline = await publicSnapshot(source, draft)
  const visibility = Object.fromEntries(DISPLAY_PAGES.map(page => [page.id,false]))
  await writeFile(join(draft, 'src/data/site.json'), JSON.stringify({ ...JSON.parse(original), pageVisibility:visibility }))
  const preview = await draftPreview(source, draft)
  expect(preview.publishing).toBe(false)
  expect(preview.changes).toEqual([{ path:'src/data/site.json', action:'replace' }])
  const snapshot = await publicSnapshot(source, draft)
  expect(snapshot.files.filter(file => file.path !== 'src/data/site.json')).toEqual(baseline.files.filter(file => file.path !== 'src/data/site.json'))
  const publishedSite = JSON.parse(Buffer.from(snapshot.files.find(file => file.path === 'src/data/site.json').content,'base64').toString('utf8'))
  expect(publishedSite.pageVisibility).toEqual(visibility)
  await validatePublicSnapshot(source, snapshot, join(state,'validation'))
  expect(await readFile(join(source, 'src/data/site.json'))).toEqual(original)
  await writeFile(join(draft, 'src/data/site.json'), JSON.stringify({ ...JSON.parse(original), pageVisibility:{ cfg:false, admin:false } }))
  await expect(publicSnapshot(source, draft)).rejects.toThrow('页面显示')
  await writeFile(join(draft, 'src/data/site.json'), original)
  expect((await draftPreview(source, draft)).changes).toEqual([])
  expect((await publicSnapshot(source, draft)).files).toEqual(baseline.files)
})


it('includes only the registered hash download path when its display filename differs', async () => {
  const {source,project,asset} = await publicFixture()
  const snapshot=await publicSnapshot(source,source)
  const path='public/downloads/'+project.id+'/'+project.download.sha256+'.exe'
  expect(project.download.filename).not.toBe(project.download.sha256+'.exe')
  expect(snapshot.files.map(file=>file.path)).toContain(path)
  expect(snapshot.files.map(file=>file.path)).not.toContain('public/downloads/'+project.id+'/'+project.download.filename)
  const published=JSON.parse(Buffer.from(snapshot.files.find(file=>file.path==='src/data/projects.json').content,'base64').toString('utf8'))
  expect(published.find(item=>item.id===project.id).download).toEqual(project.download)
  expect(await readFile(asset)).toEqual(Buffer.from(snapshot.files.find(file=>file.path===path).content,'base64'))
})
it('rejects orphan and display-name files rather than broadening the download whitelist', async () => {
  const {source,project,asset,bytes} = await publicFixture()
  const extra=join(dirname(asset),'f'.repeat(64)+'.exe')
  await writeFile(extra,bytes)
  await expect(publicSnapshot(source,source)).rejects.toThrow('未登记下载路径')
  await rm(extra)
  const alias=join(dirname(asset),project.download.filename); await writeFile(alias,bytes)
  await expect(publicSnapshot(source,source)).rejects.toThrow('未登记下载路径')
})
