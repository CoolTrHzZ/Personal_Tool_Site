import { useMemo, useState } from 'react'
import ToolShell, { CopyButton } from '../../../components/tools/ToolShell'
import { buildCs2Output, buildCs2Segments, type Cs2ColorMode } from './colors'

const modeLabels: Record<Cs2ColorMode, string> = { single: '单色', gradient: '渐变', rainbow: '彩虹', custom: '自定义颜色序列' }

export default function Cs2ColorText() {
  const [text, setText] = useState('Hello, CS2!')
  const [mode, setMode] = useState<Cs2ColorMode>('single')
  const [color, setColor] = useState('#d6ff3f')
  const [gradientStart, setGradientStart] = useState('#ff3f81')
  const [gradientEnd, setGradientEnd] = useState('#3fd6ff')
  const [custom, setCustom] = useState('#ff3f81, #d6ff3f, #3fd6ff')
  const output = useMemo(() => buildCs2Output(text, mode, color, gradientStart, gradientEnd, custom), [text, mode, color, gradientStart, gradientEnd, custom])
  const preview = useMemo(() => buildCs2Segments(text, mode, color, gradientStart, gradientEnd, custom), [text, mode, color, gradientStart, gradientEnd, custom])
  return <ToolShell title="CS2 彩色字体生成器" category="game" description="生成包含真实控制字符的 CS2 社区服务器彩色聊天文本"><label>输入文本<textarea value={text} onChange={e => setText(e.target.value)} rows={5} /></label><label>模式<select value={mode} onChange={e => setMode(e.target.value as Cs2ColorMode)}>{Object.entries(modeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{mode === 'single' && <label>颜色<input type="color" value={color} onChange={e => setColor(e.target.value)} /></label>}{mode === 'gradient' && <div className="inline-fields"><label>起始颜色<input type="color" value={gradientStart} onChange={e => setGradientStart(e.target.value)} /></label><label>结束颜色<input type="color" value={gradientEnd} onChange={e => setGradientEnd(e.target.value)} /></label></div>}{mode === 'custom' && <label>颜色序列（逗号或空格分隔）<input value={custom} onChange={e => setCustom(e.target.value)} placeholder="#ff3f81, #d6ff3f, #3fd6ff" /></label>}<p className="color-preview" style={{ whiteSpace: 'pre-wrap' }}>预览：{preview.length ? preview.map((item, index) => <span key={index} style={{ color: item.color || undefined }}>{item.text}</span>) : '你的文本'}</p><label>输出（含不可见控制字符）<textarea readOnly value={output} rows={5} /></label><div className="button-row"><CopyButton value={output} label="复制输出" /><button onClick={() => setText('')}>清空</button></div><p className="hint">复制内容包含实际 U+0007 控制字符与 RGB 编码；需社区服务器插件支持，具体颜色以服务器效果为准。</p></ToolShell>
}
