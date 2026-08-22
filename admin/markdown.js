function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inline(value) {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

function renderBlock(src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out = []
  let list = []
  const flushList = () => {
    if (!list.length) return
    out.push(`<ul>${list.join('')}</ul>`)
    list = []
  }
  for (const line of lines) {
    const item = line.match(/^[-*] (.+)$/)
    if (item) { list.push(`<li>${inline(item[1])}</li>`); continue }
    flushList()
    if (!line.trim()) continue
    if (line.startsWith('### ')) out.push(`<h3>${inline(line.slice(4))}</h3>`)
    else if (line.startsWith('## ')) out.push(`<h2>${inline(line.slice(3))}</h2>`)
    else if (line.startsWith('# ')) out.push(`<h1>${inline(line.slice(2))}</h1>`)
    else out.push(`<p>${inline(line)}</p>`)
  }
  flushList()
  return out.join('')
}

export function renderMarkdown(src) {
  return String(src || '').replace(/\r\n/g, '\n').split(/(```[\s\S]*?```)/).map(chunk => {
    const fence = chunk.match(/^```([^\n]*)\n?([\s\S]*?)```$/)
    if (fence) return `<pre><code>${escapeHtml(fence[2].replace(/\n$/, ''))}</code></pre>`
    return renderBlock(chunk)
  }).join('')
}
