import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { ToolShellProps } from '../../tools/types'
import Button from '../ui/Button'

export function CopyButton({ value, label = '复制结果' }: { value: string; label?: string }) {
  const [message, setMessage] = useState('')
  useEffect(() => { setMessage('') }, [value])
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setMessage('已复制') }
    catch { setMessage('复制失败，请手动选择结果复制') }
  }
  return <><Button type="button" onClick={copy} disabled={!value}>{label}</Button>{message && <span role={message === '已复制' ? 'status' : 'alert'}>{message}</span>}</>
}

export default function ToolShell({ title = 'Developer Tool', description = '', version = '1.0.0', category = 'tool', children }: ToolShellProps) {
  return (
    <main className="page tool-native">
      <aside className="tool-meta-sidebar">
        <Link className="back-link" to="/tools">← 工具中心</Link>
        <h1>{title}</h1>
        <p>{description}</p>
        <dl>
          <div><dt>version</dt><dd>{version}</dd></div>
          <div><dt>分类</dt><dd>{category}</dd></div>
          <div><dt>运行环境</dt><dd>Native React</dd></div>
        </dl>
      </aside>
      <div className="tool-native-workspace"><div className="tool-panel">{children}</div></div>
    </main>
  )
}
