import { tools } from '../tools/registry'
import ToolCard from '../components/tools/ToolCard'

export default function ToolsPage() {
  return <main className="page"><section className="page-heading"><p className="eyebrow">TOOLS</p><h1>工具中心</h1><p>无需离开浏览器，完成日常开发中的小事。</p></section><div className="tool-grid tool-grid-large">{tools.filter(tool => tool.enabled).sort((a, b) => a.order - b.order).map(tool => <ToolCard key={tool.id} tool={tool} />)}</div></main>
}
