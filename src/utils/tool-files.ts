import { hasUnsupportedCfgControl } from '../../shared/cfg-text.js'

export async function readTextFile(file: File, maxBytes = 256 * 1024, format: 'text' | 'cfg' = 'text'): Promise<string> {
  if (file.size > maxBytes) throw new Error(`文件超过 ${Math.ceil(maxBytes / 1024)} KB 限制，请选择较小的文本文件。`)
  const bytes = await file.arrayBuffer()
  let content: string
  try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) }
  catch { throw new Error('无法读取此文件，请先转换为 UTF-8 文本。') }
  const invalid = format === 'cfg' ? hasUnsupportedCfgControl(content) : [...content].some(char => { const code = char.charCodeAt(0); return code < 32 && ![9, 10, 13].includes(code) })
  if (invalid) throw new Error(format === 'cfg' ? '检测到二进制或不支持的控制字符；CFG 彩色字体控制符可以保留。' : '检测到二进制或控制字符，请选择文本文件。')
  return content
}

export function downloadText(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.replace(/[\\/:*?"<>|]/g, '_').replace(/\p{Cc}/gu, '_').slice(0, 160) || 'download.txt'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
