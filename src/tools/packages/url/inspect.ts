export const MAX_URL_INPUT_LENGTH = 8192
export const MAX_URL_QUERY_ROWS = 100
export const MAX_URL_OUTPUT_LENGTH = 32768

export interface UrlInspection {
  normalized: string
  scheme: string
  hostname: string
  port: string
  pathname: string
  fragment: string
  query: [string, string][]
}

// Deliberate local inspection only: URL/URLSearchParams do not navigate or fetch.
export function inspectUrl(input: string): UrlInspection {
  if (input.length > MAX_URL_INPUT_LENGTH) throw new Error('URL 输入最多 8192 个 UTF-16 码元，请缩短后重试')
  if (Array.from(input).some(char => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127 || char === '\\')) {
    throw new Error('URL 不接受原始空格、控制字符或反斜杠；空格请使用 %20')
  }
  const authority = /^https?:\/\/([^/?#]+)/i.exec(input)?.[1]
  if (!authority) throw new Error('仅支持以 http:// 或 https:// 开始、包含主机的绝对 URL')
  if (authority.includes('@')) throw new Error('不解析含用户信息或密码的 URL，请先移除凭据')
  try { decodeURI(input) }
  catch { throw new Error('URL 包含无效的百分号编码或 UTF-8 字节序列') }
  let url: URL
  try { url = new URL(input) }
  catch { throw new Error('URL 格式无效，请检查主机、端口及编码') }
  if (url.username || url.password) throw new Error('不解析含用户信息或密码的 URL，请先移除凭据')
  const query: [string, string][] = []
  for (const pair of url.searchParams) {
    if (query.length === MAX_URL_QUERY_ROWS) throw new Error('查询参数最多 100 项；未生成部分解析结果')
    query.push(pair)
  }
  const result = { normalized: url.href, scheme: url.protocol.slice(0, -1), hostname: url.hostname, port: url.port, pathname: url.pathname, fragment: url.hash, query }
  if (JSON.stringify(result).length > MAX_URL_OUTPUT_LENGTH) throw new Error('规范化结果超过 32768 个 UTF-16 码元，请缩短输入；未截断展示')
  return result
}
