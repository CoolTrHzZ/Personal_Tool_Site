import { useState } from 'react'
import ToolShell from '../../components/tools/ToolShell'

export default function Cs2ColorText() {
  const [text, setText] = useState('Hello, CS2!')
  const [color, setColor] = useState('#d6ff3f')
  const [copied, setCopied] = useState(false)
  const output = `\x07${color.slice(1)}${text}`
  const copy = async () => { await navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 1200) }
  return <ToolShell title="CS2 彩色字体生成器" description="生成包含真实控制字符的 CS2 社区服务器彩色聊天文本"><label>输入文本<textarea value={text} onChange={e => setText(e.target.value)} rows={5} /></label><div className="inline-fields"><label>颜色<input type="color" value={color} onChange={e => setColor(e.target.value)} /></label><span className="color-preview" style={{ color }}>预览：{text || '你的文本'}</span></div><label>输出（含不可见控制字符）<textarea readOnly value={output} rows={4} /></label><button className="primary" onClick={copy}>{copied ? '已复制真实字符' : '复制输出'}</button><p className="hint">颜色格式使用 CS2 的 <code>\x07</code> + 6 位 RGB 十六进制控制序列；复制到剪贴板的是实际控制字符。</p></ToolShell>
}
