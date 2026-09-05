import { analyzeCfg } from '../tools/packages/cs2-cfg/cfg'

export type CfgPackageFile = { filename: string; content: string }
export type CfgDependency = { filename: string; line: number; target: string; optional: boolean }
export const MAX_CFG_PACKAGE_FILES = 20
const encoder = new TextEncoder()
const normalizedName = (name: string) => name.normalize('NFC').toLocaleLowerCase('en-US')

export function missingCfgDependencies(files: CfgPackageFile[]): CfgDependency[] {
  const names = new Set(files.map(file => normalizedName(file.filename)))
  return files.flatMap(file => analyzeCfg(file.content).commands.flatMap(command => {
    if (!['exec', 'execifexists'].includes(command.name.toLowerCase()) || !command.args[0]) return []
    const target = /\.cfg$/i.test(command.args[0]) ? command.args[0] : `${command.args[0]}.cfg`
    return names.has(normalizedName(target)) ? [] : [{ filename: file.filename, line: command.line, target, optional: command.name.toLowerCase() === 'execifexists' }]
  }))
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** A small standard ZIP with stored UTF-8 entries; preserves every CFG byte, including BOM/CRLF. */
export function createCfgZip(files: CfgPackageFile[]): Uint8Array {
  if (!files.length || files.length > MAX_CFG_PACKAGE_FILES) throw new Error(`每个配置包请选择 1–${MAX_CFG_PACKAGE_FILES} 个 CFG。`)
  const seen = new Set<string>()
  const entries = files.map(file => {
    if (!file.filename || file.filename.length > 120 || !/\.cfg$/i.test(file.filename) || file.filename.startsWith('.') || /[\\/:*?"<>|\p{Cc}]/u.test(file.filename)) throw new Error('配置包文件名无效，不能包含路径或特殊字符。')
    const key = normalizedName(file.filename)
    if (seen.has(key)) throw new Error(`存在同名文件 ${file.filename}，请取消其中一份，避免解压时覆盖。`)
    seen.add(key)
    const name = encoder.encode(file.filename), bytes = encoder.encode(file.content)
    if (bytes.length > 256 * 1024) throw new Error(`${file.filename} 超过 256 KiB。`)
    return { name, bytes, crc: crc32(bytes), offset: 0 }
  })
  const size = entries.reduce((total, item) => total + 30 + item.name.length + item.bytes.length + 46 + item.name.length, 22)
  const output = new Uint8Array(size), view = new DataView(output.buffer)
  let offset = 0
  const u16 = (value: number) => { view.setUint16(offset, value, true); offset += 2 }
  const u32 = (value: number) => { view.setUint32(offset, value, true); offset += 4 }
  const bytes = (value: Uint8Array) => { output.set(value, offset); offset += value.length }
  for (const item of entries) {
    item.offset = offset
    u32(0x04034b50); u16(20); u16(0x0800); u16(0); u16(0); u16(33)
    u32(item.crc); u32(item.bytes.length); u32(item.bytes.length); u16(item.name.length); u16(0)
    bytes(item.name); bytes(item.bytes)
  }
  const centralStart = offset
  for (const item of entries) {
    u32(0x02014b50); u16(20); u16(20); u16(0x0800); u16(0); u16(0); u16(33)
    u32(item.crc); u32(item.bytes.length); u32(item.bytes.length); u16(item.name.length)
    u16(0); u16(0); u16(0); u16(0); u32(0); u32(item.offset); bytes(item.name)
  }
  const centralSize = offset - centralStart
  u32(0x06054b50); u16(0); u16(0); u16(entries.length); u16(entries.length); u32(centralSize); u32(centralStart); u16(0)
  return output
}

export function downloadCfgZip(files: CfgPackageFile[]) {
  const url = URL.createObjectURL(new Blob([createCfgZip(files)], { type: 'application/zip' }))
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = 'cs2-config-package.zip'
  document.body.append(anchor); anchor.click(); anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
