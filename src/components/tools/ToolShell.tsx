import { Link } from 'react-router-dom'
import type { ToolShellProps } from '../../tools/types'

export default function ToolShell({ title = 'Developer Tool', description = '', version = '1.0.0', category = 'tool', children }: ToolShellProps) {
  return <main className="page tool-page"><Link className="back-link" to="/tools">← 返回工具中心</Link><section className="page-heading"><p className="eyebrow">{category.toUpperCase()} / TOOL</p><h1>{title}</h1><p>{description}</p><div className="tool-meta"><span>v{version}</span><span>{category}</span></div></section><div className="tool-panel">{children}</div><section className="tool-docs"><h2>Documentation</h2><p>在浏览器中完成操作；输入数据默认只保存在当前页面，不会上传到服务器。</p></section></main>
}
