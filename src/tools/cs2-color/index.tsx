import { useMemo, useState } from 'react'
import ToolShell from '../../components/tools/ToolShell'
import { buildCs2Output, type Cs2ColorMode, normalizeHex } from './colors'

const modeLabels: Record<Cs2ColorMode, string> = { single: '单色', gradient: '渐变', rainbow: '彩虹', custom: '自定义颜色序列' }

export default function Cs2ColorText() {
  const [text, setText] = useState('Hello, CS2!')
  const [mode, setMode] = useState<Cs2ColorMode>('single')
  const [color, setColor] = useState('#d6ff3f')
  const [gradientStart, setGradientStart] = useState('#ff3f81')
  const [gradientEnd, setGradientEnd] = useState('#3fd6ff')
  const [custom, setCustom] = useState('#ff3f81, #d6ff3f, #3fd6ff')
  const [copied, setCopied] = useState(false)
  const output = useMemo(() => buildCs2Output(text, mode, color, gradientStart, gradientEnd, custom), [text, mode, color, gradientStart, gradientEnd, custom])
  const copy = async () => { await navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 1200) }
  const previewColor = mode === 'single' ? color : mode === 'gradient' ? gradientStart : mode === 'custom' ? normalizeHex(custom.split(/[\s,]+/)[0], color) : '#ff3f81'
  return <ToolShell title="CS2 彩色字体生成器" description="生成包含真实控制字符的 CS2 社区服务器彩色聊天文本"><label>输入文本<textarea value={text} onChange={e => setText(e.target.value)} rows={5} /></label><label>模式<select value={mode} onChange={e => setMode(e.target.value as Cs2ColorMode)}>{Object.entries(modeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{mode === 'single' && <label>颜色<input type="color" value={color} onChange={e => setColor(e.target.value)} /></label>}{mode === 'gradient' && <div className="inline-fields"><label>起始颜色<input type="color" value={gradientStart} onChange={e => setGradientStart(e.target.value)} /></label><label>结束颜色<input type="color" value={gradientEnd} onChange={e => setGradientEnd(e.target.value)} /></label></div>}{mode === 'custom' && <label>颜色序列（逗号或空格分隔）<input value={custom} onChange={e => setCustom(e.target.value)} placeholder="#ff3f81, #d6ff3f, #3fd6ff" /></label>}<p className="color-preview" style={{ color: previewColor }}>预览：{text || '你的文本'}</p><label>输出（含不可见控制字符）<textarea readOnly value={output} rows={5} /></label><div className="button-row"><button className="primary" onClick={copy} disabled={!output}>{copied ? '已复制真实字符' : '复制输出'}</button><button onClick={() => { setText(''); setCopied(false) }}>清空</button></div><p className="hint">复制到剪贴板的是实际 U+0007 控制字符 + RGB 颜色编码，可直接粘贴到 CS2 社区服务器聊天。</p></ToolShell>
}
