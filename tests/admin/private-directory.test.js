// @vitest-environment node
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { privateDirectory } from '../../scripts/admin-auth.mjs'
import { updateCode, rollbackCode } from '../../scripts/admin-maintain.mjs'
import { runPublishGit } from '../../scripts/admin-publish.mjs'

const roots = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

it('pins safe parent aliases to the real directory and rejects direct or project/public symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'devos-private-directory-')); roots.push(root)
  const code = join(root, 'code'), state = join(root, 'private')
  await mkdir(join(code, 'public'), { recursive: true }); await mkdir(state, { mode: 0o700 })
  await symlink(root, join(root, 'alias'))
  expect(await privateDirectory(join(root, 'alias/private'), code)).toBe(await realpath(state))
  await symlink(state, join(root, 'direct'))
  await expect(privateDirectory(join(root, 'direct'), code)).rejects.toThrow('符号链接')
  await symlink(join(code, 'public'), join(root, 'public-alias'))
  await expect(privateDirectory(join(root, 'public-alias/private'), code)).rejects.toThrow('项目或 public')
})

it('installs, updates and rolls back through a safe parent alias while preserving the private state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'devos-maintenance-alias-')); roots.push(root)
  const source = join(root, 'source'), state = join(root, 'private'), alias = join(root, 'alias')
  await mkdir(source); await mkdir(state, { mode: 0o700 }); await symlink(root, alias)
  const commit = async value => {
    await writeFile(join(source, 'code.txt'), value)
    await runPublishGit(source, ['add', 'code.txt'])
    await runPublishGit(source, ['-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid','commit','-m',value])
  }
  await runPublishGit(source, ['init', '--initial-branch=main']); await commit('one')
  const options = { source, projectDir:join(alias, 'code'), stateDir:join(alias, 'private'), validate:async () => {} }
  await updateCode(options); await writeFile(join(state, 'auth.json'), 'synthetic private marker', { mode:0o600 })
  await commit('two'); await updateCode(options)
  expect(await readFile(join(root, 'code/code.txt'), 'utf8')).toBe('two')
  await rollbackCode(options)
  expect(await readFile(join(root, 'code/code.txt'), 'utf8')).toBe('one')
  expect(await readFile(join(state, 'auth.json'), 'utf8')).toBe('synthetic private marker')
  await symlink(join(root, 'code'), join(root, 'direct-code'))
  await expect(updateCode({ ...options, projectDir:join(root, 'direct-code') })).rejects.toThrow('符号链接')
})
