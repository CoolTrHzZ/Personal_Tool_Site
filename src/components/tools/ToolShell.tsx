import { Link } from 'react-router-dom'
import type { ToolShellProps } from '../../tools/types'

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
