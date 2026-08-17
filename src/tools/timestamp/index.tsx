import { useState } from 'react'
import ToolShell from '../../components/tools/ToolShell'

export default function TimestampTool() {
  const [value, setValue] = useState(() => String(Math.floor(Date.now() / 1000)))
  const [date, setDate] = useState('')
  const convert = () => { const n = Number(value); if (Number.isFinite(n)) setDate(new Date(value.length <= 10 ? n * 1000 : n).toLocaleString()) }
  return <ToolShell title="时间戳转换" description="Unix 时间戳与本地时间互转"><label>时间戳（秒或毫秒）<input value={value} onChange={e => setValue(e.target.value)} /></label><button className="primary" onClick={convert}>转换</button><div className="result">{date || '点击转换查看本地时间'}</div></ToolShell>
}
