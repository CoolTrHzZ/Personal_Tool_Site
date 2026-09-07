// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Buffer } from 'node:buffer'
import { gunzipSync } from 'node:zlib'
import { prepareProject } from '../deploy.mjs'

const exec = promisify(execFile)
const source = fileURLToPath(new URL('../', import.meta.url))
const cfgPath = 'public/cfgs/test.cfg'
const exePath = 'public/downloads/test/test.exe'
const cfg = Buffer.from('\ufeff// 社区服配置\r\necho "\u0006颜色\u0007文本\u000b保持\u0010不变"\r\n')
const exe = Buffer.from([0x4d, 0x5a, 0, 255, 128, 1, 10, 13])
let root, repository, directory

const git = async (cwd, ...args) => (await exec('git', args, { cwd })).stdout.trim()
const put = async (cwd, path, content) => {
  await mkdir(dirname(join(cwd, path)), { recursive: true })
  await writeFile(join(cwd, path), content)
}
const commit = async cwd => {
  await git(cwd, 'add', '.')
  await git(cwd, '-c', 'user.name=Deploy Test', '-c', 'user.email=deploy@example.invalid', '-c', 'commit.gpgSign=false', 'commit', '-m', 'fixture')
}
const install = () => prepareProject({ directory, repository })
const update = () => prepareProject({ directory, repository, update: true })
const advance = async () => { await put(repository, 'README.md', 'Remote update\n'); await commit(repository) }

async function files(cwd) {
  const result = {}
  async function walk(path = '') {
    for (const entry of await readdir(join(cwd, path), { withFileTypes: true })) {
      if (entry.name === '.git') continue
      const relative = path ? `${path}/${entry.name}` : entry.name
      if (entry.isDirectory()) await walk(relative)
      else result[relative] = (await readFile(join(cwd, relative))).toString('base64')
    }
  }
  await walk()
  return result
}

async function refusesWithoutChangingProject() {
  const before = await files(directory)
  const head = await git(directory, 'rev-parse', 'HEAD')
  const branch = await git(directory, 'branch', '--show-current')
  const status = await git(directory, 'status', '--porcelain')
  await expect(update()).rejects.toThrow()
  expect(await files(directory)).toEqual(before)
  expect(await git(directory, 'rev-parse', 'HEAD')).toBe(head)
  expect(await git(directory, 'branch', '--show-current')).toBe(branch)
  expect(await git(directory, 'status', '--porcelain')).toBe(status)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'devos-deploy-test-'))
  repository = join(root, 'origin')
  directory = join(root, '我的 本地工作站')
  await mkdir(repository)
  await git(repository, 'init', '-b', 'main')
  await git(repository, 'config', 'core.autocrlf', 'false')
  await git(repository, 'config', 'core.hooksPath', join(root, 'no-hooks'))
  await put(repository, 'package.json', JSON.stringify({ name: 'personal-tool-site', type: 'module', version: '4.0.0' }))
  await put(repository, 'scripts/admin-server.mjs', '// fixture only: never started\n')
  await put(repository, 'scripts/validate-data.mjs', '// fixture validates successfully\n')
  for (const file of ['site-backup.mjs', 'tool-manifest.mjs']) await cp(join(source, 'scripts', file), join(repository, 'scripts', file))
  for (const key of ['navigation', 'categories', 'library', 'notes', 'tags', 'ai-resources', 'ai-workflows', 'cfgs', 'projects']) await put(repository, `src/data/${key}.json`, '[]\n')
  await put(repository, 'src/data/site.json', '{}\n')
  await put(repository, 'src/tools/manifests/core.json', '[]\n')
  await put(repository, 'public/tools-manifests.json', '[]\n')
  await put(repository, 'public/tools/fixture/index.html', '<!doctype html><title>Fixture</title>')
  await put(repository, cfgPath, cfg)
  await put(repository, exePath, exe)
  await put(repository, 'README.md', 'Initial version\n')
  await commit(repository)
})

afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }) })

it('runs the downloaded CLI through a symlinked temporary directory', async () => {
  const actual = join(root, 'downloaded'), alias = join(root, 'temporary-link')
  await mkdir(actual)
  await cp(join(source, 'deploy.mjs'), join(actual, 'deploy.mjs'))
  await symlink(actual, alias, 'junction')
  const { stdout } = await exec(process.execPath, [join(alias, 'deploy.mjs'), '--help'])
  expect(stdout).toContain('DevOS 本地一键部署')
  expect(stdout).toContain('update')
})

it('downloads into a path containing spaces and Chinese, and reuses an existing checkout without erasing local edits', async () => {
  await install()
  expect(await git(directory, 'remote', 'get-url', 'origin')).toBe(repository)
  expect(await git(directory, 'rev-parse', 'HEAD')).toBe(await git(repository, 'rev-parse', 'HEAD'))
  expect((await readFile(join(directory, cfgPath))).equals(cfg)).toBe(true)
  expect((await readFile(join(directory, exePath))).equals(exe)).toBe(true)
  await put(directory, 'src/data/notes.json', '[{"title":"本地笔记"}]\n')
  const before = await files(directory)
  await install()
  expect(await files(directory)).toEqual(before)
})

it('fast-forwards main after backing up the original CFG control bytes and EXE outside the checkout', async () => {
  await install()
  await advance()
  await update()
  expect(await readFile(join(directory, 'README.md'), 'utf8')).toBe('Remote update\n')
  expect(await git(directory, 'rev-parse', 'HEAD')).toBe(await git(repository, 'rev-parse', 'HEAD'))
  expect(await git(directory, 'status', '--porcelain')).toBe('')
  const backups = (await readdir(`${directory}-backups`)).filter(name => name.endsWith('.gz'))
  expect(backups).toHaveLength(1)
  const archive = JSON.parse(gunzipSync(await readFile(join(`${directory}-backups`, backups[0]))).toString('utf8'))
  expect(archive.format).toBe('devos-site-backup')
  for (const [path, bytes] of [[cfgPath, cfg], [exePath, exe]]) {
    expect(Buffer.from(archive.files.find(file => file.path === path).content, 'base64').equals(bytes)).toBe(true)
    expect((await readFile(join(directory, path))).equals(bytes)).toBe(true)
  }
})

it.each(['tracked', 'untracked'])('refuses an update with %s local work and preserves every file', async kind => {
  await install()
  await advance()
  await put(directory, kind === 'tracked' ? cfgPath : '我的未提交配置.cfg', cfg)
  if (kind === 'tracked') await put(directory, cfgPath, Buffer.concat([cfg, Buffer.from('echo local\r\n')]))
  await refusesWithoutChangingProject()
})

it('refuses divergent history without merging or resetting local commits', async () => {
  await install()
  await put(directory, 'README.md', 'Local committed change\n')
  await commit(directory)
  await advance()
  await refusesWithoutChangingProject()
})

it('refuses updating a non-main branch', async () => {
  await install()
  await git(directory, 'checkout', '-b', 'my-work')
  await advance()
  await refusesWithoutChangingProject()
})

it('refuses an unexpected origin without replacing it', async () => {
  await install()
  const other = join(root, 'unrelated-origin')
  await git(directory, 'remote', 'set-url', 'origin', other)
  await refusesWithoutChangingProject()
  expect(await git(directory, 'remote', 'get-url', 'origin')).toBe(other)
})

it('refuses an existing non-project directory instead of overwriting its files', async () => {
  await put(directory, 'keep.txt', 'Unrelated personal files\n')
  const before = await files(directory)
  await expect(install()).rejects.toThrow()
  expect(await files(directory)).toEqual(before)
})
