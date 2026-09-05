export type CfgDocument = { name: string; content: string }
export const MAX_CFG_BYTES = 256 * 1024
export const MAX_SHARE_LENGTH = 16000

export function isCfgDocument(value: unknown): value is CfgDocument {
  if (!value || typeof value !== 'object') return false
  const item = value as CfgDocument
  return typeof item.name === 'string' && item.name.length > 0 && item.name.length <= 80 &&
    typeof item.content === 'string' && item.content.length <= MAX_CFG_BYTES && new TextEncoder().encode(item.content).length <= MAX_CFG_BYTES
}

async function readLimited(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.length
      if (length > limit) throw new Error('分享内容过大，请改用 CFG 文件传输。')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}

export async function encodeSharedCfg(document: CfgDocument): Promise<string> {
  if (!isCfgDocument(document)) throw new Error('名称或 CFG 内容超出限制。')
  const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, ...document }))
  if (bytes.length > MAX_CFG_BYTES * 2 + 1024) throw new Error('分享内容过大，请改用 CFG 文件传输。')
  const compressed = typeof CompressionStream !== 'undefined'
  const encoded = compressed ? await readLimited(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')), MAX_SHARE_LENGTH) : bytes
  const payload = `${compressed ? 'z1' : 'p1'}.${btoa(Array.from(encoded, byte => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
  if (payload.length > MAX_SHARE_LENGTH) throw new Error('分享链接超过 16,000 字符，请下载 CFG 文件后传输。')
  return payload
}

export async function decodeSharedCfg(payload: string): Promise<CfgDocument> {
  if (payload.length > MAX_SHARE_LENGTH || !/^(z1|p1)\.[A-Za-z0-9_-]+$/.test(payload)) throw new Error('CFG 分享链接无效或版本不受支持。')
  try {
    const [format, encoded] = payload.split('.')
    const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0))
    if (format === 'z1' && typeof DecompressionStream === 'undefined') throw new Error('此浏览器不支持解压分享链接，请使用新版浏览器。')
    const decoded = format === 'z1' ? await readLimited(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')), MAX_CFG_BYTES * 2 + 1024) : bytes
    const result: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded))
    if (!isCfgDocument(result) || (result as { version?: number }).version !== 1) throw new Error('分享内容格式不正确。')
    return { name: result.name, content: result.content }
  } catch (error) {
    throw new Error(error instanceof Error && /此浏览器|过大/.test(error.message) ? error.message : '分享内容已损坏或格式不正确，请重新生成链接。')
  }
}

export function cfgFilename(name: string) {
  const base = name.trim().replace(/[\\/:*?"<>|]/g, '_').replace(/\p{Cc}/gu, '_').replace(/\.cfg$/i, '').slice(0, 76) || 'autoexec'
  return `${base}.cfg`
}
