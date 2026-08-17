import { Link } from 'react-router-dom'
import type { ToolShellProps } from '../../tools/types'

export default function ToolShell({ title, description, children }: ToolShellProps) {
  return <main className="page tool-page"><Link className="back-link" to="/tools">← 返回工具中心</Link><section className="page-heading"><p className="eyebrow">WEB TOOL</p><h1>{title}</h1><p>{description}</p></section><div className="tool-panel">{children}</div></main>
}
