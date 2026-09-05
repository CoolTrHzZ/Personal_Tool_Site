// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest'
import { Buffer, File } from 'node:buffer'
import { cfgFilename, decodeSharedCfg, encodeSharedCfg, isCfgDocument, MAX_CFG_BYTES } from '../src/tools/packages/cs2-cfg/share'
import { isCfgStore } from '../src/tools/packages/cs2-cfg/store'
import { readTextFile } from '../src/utils/tool-files'

afterEach(() => vi.unstubAllGlobals())

test('CFG 分享压缩和纯文本回退均保留 Unicode、BOM、CRLF 与脚本样文本', async () => {
  const document = { name: '我的社区服', content: '\ufeff// 中文🎯\r\nbind "SPACE" "+jump"\r\nbind x say \u0006社区\u0007ffffff彩字\u000b保留\u000e原文\u0010\r\necho "<script>alert(1)</script>"\r\n' }
  const compressed = await encodeSharedCfg(document)
  expect(compressed.startsWith('z1.')).toBe(true)
  expect(await decodeSharedCfg(compressed)).toEqual(document)
  vi.stubGlobal('CompressionStream', undefined)
  const plain = await encodeSharedCfg(document)
  expect(plain.startsWith('p1.')).toBe(true)
  expect(await decodeSharedCfg(plain)).toEqual(document)
})

test('拒绝损坏链接、未知格式、超限文件和解压膨胀', async () => {
  for (const invalid of ['z1.%', 'z2.abc', 'z1.aaaa', 'p1.aaaa', 'p1.' + 'a'.repeat(16001)]) await expect(decodeSharedCfg(invalid)).rejects.toThrow()
  expect(isCfgDocument({ name: 'test', content: '中'.repeat(MAX_CFG_BYTES / 2) })).toBe(false)
  await expect(encodeSharedCfg({ name: '', content: '' })).rejects.toThrow()
  const expanded = JSON.stringify({ version: 1, name: 'bomb', content: 'x'.repeat(MAX_CFG_BYTES * 3) })
  const bytes = new Uint8Array(await new globalThis.Response(new Blob([expanded]).stream().pipeThrough(new globalThis.CompressionStream('gzip'))).arrayBuffer())
  const payload = 'z1.' + Buffer.from(bytes).toString('base64url')
  await expect(decodeSharedCfg(payload)).rejects.toThrow(/过大/)
  await expect(encodeSharedCfg({ name: 'control', content: '\u0001'.repeat(MAX_CFG_BYTES) })).rejects.toThrow(/过大/)
})

test('本机版本验证拒绝重复ID/无效时间，下载文件名不含路径', () => {
  const draft = { name: 'autoexec', content: 'echo ok' }
  const version = { ...draft, id: 'one', savedAt: new Date().toISOString() }
  expect(isCfgStore({ draft, versions: [version] })).toBe(true)
  expect(isCfgStore({ draft, versions: [version, version] })).toBe(false)
  expect(isCfgStore({ draft, versions: [{ ...version, savedAt: 'oops' }] })).toBe(false)
  expect(cfgFilename('../配置.cfg')).toBe('.._配置.cfg')
  expect(cfgFilename('autoexec.CFG')).toBe('autoexec.cfg')
})

test('文本文件导入严格校验大小和UTF8，保留BOM和换行', async () => {
  const source = '\ufeff// 原文\r\nbind "f" "+lookatweapon"\r\n'
  await expect(readTextFile(new File([source], 'config.cfg'))).resolves.toBe(source)
  await expect(readTextFile(new File([new Uint8Array([255, 254, 0, 1])], 'bad.cfg'))).rejects.toThrow(/UTF-8/)
  await expect(readTextFile(new File(['a\0b'], 'binary.txt'))).rejects.toThrow(/二进制/)
  await expect(readTextFile(new File(['12345'], 'large.txt'), 4)).rejects.toThrow(/限制/)
})

test('CFG 导入保留颜色控制符，普通文本导入和非法控制符仍拒绝', async () => {
  const source = `\ufeffbind x say ${Array.from({ length: 16 }, (_, index) => String.fromCharCode(index + 1)).join('')}社区\r\n`
  const file = new File([source], 'colors.cfg')
  await expect(readTextFile(file, undefined, 'cfg')).resolves.toBe(source)
  await expect(readTextFile(file)).rejects.toThrow(/控制字符/)
  for (const code of [0, 17, 31, 127, 159]) await expect(readTextFile(new File([`echo ${String.fromCharCode(code)}`], 'bad.cfg'), undefined, 'cfg')).rejects.toThrow(/控制字符/)
})
