import ToolShell from '../../components/tools/ToolShell'
import type { ToolDefinition } from '../types'

export default function HtmlToolPage({ tool }: { tool: ToolDefinition }) {
  const source = `${import.meta.env.BASE_URL}tools/${encodeURIComponent(tool.id)}/${tool.entry}`
  return <ToolShell title={tool.name} description={tool.description} version={tool.version} category={tool.category}><iframe className="tool-frame" src={source} sandbox="allow-scripts" title={tool.name} /></ToolShell>
}
