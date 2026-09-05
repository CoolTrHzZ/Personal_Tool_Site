// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCfgZip, missingCfgDependencies } from '../src/utils/cfg-package.ts'

describe('CFG package', () => {
  it('creates a standard ZIP with exact UTF-8 filenames, BOM and CRLF contents', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cfg-zip-test-'))
    try {
      const content = '\ufeff// 中文\r\nexec training\r\nbind x say \u0006社区\u0007ffffff彩字\u000b保留\u000e原文\u0010\r\n'
      const zip = join(root, 'cfg.zip')
      await writeFile(zip, createCfgZip([{ filename: '我的配置.cfg', content }, { filename: 'training.cfg', content: 'echo train\n' }]))
      // Verify with an independent ZIP reader, including CRC and non-ASCII entry names.
      expect(execFileSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; sys.stdout.buffer.write(z.read("我的配置.cfg"))', zip]).toString('utf8')).toBe(content)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('finds missing literal exec dependencies without splitting quoted semicolons or reading comments', () => {
    const missing = missingCfgDependencies([
      { filename: 'autoexec.cfg', content: '// exec ignored\nexec "training"; exec missing\nexecifexists optional\nbind x "exec later"\n' },
      { filename: 'Training.cfg', content: 'echo ready' },
    ])
    expect(missing).toEqual([{ filename: 'autoexec.cfg', line: 2, target: 'missing.cfg', optional: false }, { filename: 'autoexec.cfg', line: 3, target: 'optional.cfg', optional: true }])
  })
  it('rejects duplicate download names, paths and oversized packages before generating bytes', () => {
    expect(() => createCfgZip([{ filename: 'autoexec.cfg', content: '' }, { filename: 'AUTOEXEC.cfg', content: '' }])).toThrow('同名')
    expect(() => createCfgZip([{ filename: '../autoexec.cfg', content: '' }])).toThrow('路径')
    expect(() => createCfgZip([{ filename: 'autoexec.cfg', content: 'x'.repeat(256 * 1024 + 1) }])).toThrow('256')
    expect(() => createCfgZip([])).toThrow()
    expect(() => createCfgZip(Array.from({ length: 21 }, (_, i) => ({ filename: `${i}.cfg`, content: '' })))).toThrow()
  })
})
