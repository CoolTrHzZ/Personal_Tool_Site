// @vitest-environment node
import { afterEach, expect, it } from 'vitest'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createPublisher, runPublishGit } from '../../scripts/admin-publish.mjs'
import { prepareDrafts } from '../../scripts/admin-state.mjs'
import { normalizeManifest } from '../../scripts/tool-manifest.mjs'

const directories = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'devos-publish-preview-')); directories.push(root)
  const seed = join(root, 'seed'), state = join(root, 'private'), remote = join(root, 'remote.git')
  const source = fileURLToPath(new URL('../../', import.meta.url))
  for (const directory of ['src/data', 'src/tools/manifests', 'public/cfgs', 'public/downloads', 'public/tools/synthetic-tool']) await mkdir(join(seed, directory), { recursive: true })
  for (const directory of ['scripts', 'shared']) await cp(join(source, directory), join(seed, directory), { recursive: true })
  await writeFile(join(seed, 'package.json'), '{"type":"module"}')
  await writeFile(join(seed, 'src/tools/registry.ts'), "export const tools = [{ id: 'synthetic', path: '/tools/synthetic' }]\n")
  for (const name of ['navigation', 'categories', 'notes', 'library', 'ai-resources', 'tags', 'cfgs', 'projects', 'ai-workflows']) await writeFile(join(seed, 'src/data', name + '.json'), '[]\n')
  const site = { name: 'Synthetic', title: 'Synthetic', description: 'Synthetic publication fixture', toolsDescription: '', navigationDescription: '', libraryDescription: '', aiHubDescription: '', notesDescription: '', github: 'https://example.invalid/', footer: '', logo: '', publicUrl: 'https://example.invalid/', todayContinueLimit: 3 }
  await writeFile(join(seed, 'src/data/site.json'), JSON.stringify(site))
  const manifest = normalizeManifest({ id: 'synthetic-tool', name: 'Synthetic tool', type: 'html', runtime: 'static', format: 'single-html', entry: 'index.html', version: '1.0.0', updated: '2026-10-05' }, 10)
  await writeFile(join(seed, 'src/tools/manifests/core.json'), '[]\n')
  await writeFile(join(seed, 'public/tools-manifests.json'), JSON.stringify([manifest]))
  await writeFile(join(seed, 'public/tools/synthetic-tool/manifest.json'), JSON.stringify(manifest))
  await writeFile(join(seed, 'public/tools/synthetic-tool/index.html'), '<!doctype html><title>Synthetic</title>\n')
  await runPublishGit(seed, ['init', '--initial-branch=main'])
  await runPublishGit(seed, ['add', '--all'])
  await runPublishGit(seed, ['-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '-m', 'Synthetic baseline'])
  await runPublishGit(root, ['clone', '--bare', '--', seed, remote])
  await mkdir(state, { mode: 0o700 })
  const draft = await prepareDrafts(seed, state)
  return { root, seed, state, remote, draft }
}

it('prepares a large text tool with a bounded UTF-8 preview and complete file metadata', async () => {
  const { root, seed, state, remote, draft } = await fixture()
  const path = 'public/tools/synthetic-tool/index.html'
  const content = '<!doctype html><title>Synthetic large tool</title>\n' + '<!-- 合成文本 -->\n'.repeat(300000)
  expect(Buffer.byteLength(content)).toBeGreaterThan(4 * 1024 * 1024)
  await writeFile(join(draft, path), content)
  const base = await runPublishGit(root, ['--git-dir=' + remote, 'rev-parse', 'main'])
  const calls = []
  const publisher = createPublisher({ codeRoot: seed, stateDir: state, draftRoot: draft, source: remote,
    git: (cwd, args, options) => { calls.push(args); return runPublishGit(cwd, args, options) },
    pages: async () => { throw new Error('Prepare must not query Pages') },
  })
  const { job } = await publisher.prepare()
  expect(job.stage).toBe('prepared')
  expect(job.commit).toBeNull()
  expect(job.truncated).toBe(true)
  expect(Buffer.byteLength(job.patch)).toBeLessThanOrEqual(65536)
  expect(job.patch).not.toContain('\uFFFD')
  expect(job.files).toEqual([{ path, action: 'M', bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') }])
  expect(await readFile(join(state, 'publisher/repo', path), 'utf8')).toBe(content)
  expect(await readFile(join(draft, path), 'utf8')).toBe(content)
  expect(await runPublishGit(root, ['--git-dir=' + remote, 'rev-parse', 'main'])).toBe(base)
  expect(calls.some(args => ['push', 'update-ref', 'hash-object'].includes(args[0]))).toBe(false)
}, 20000)

it('still rejects a nonzero Git exit after bounded preview output', async () => {
  const { seed } = await fixture()
  await expect(runPublishGit(seed, ['diff', '--no-index', '--', '/dev/null', 'public/tools/synthetic-tool/index.html'], { maxOutputBytes: 8 })).rejects.toThrow('Git 操作未完成')
})
