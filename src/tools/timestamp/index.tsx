import { useState } from 'react'
import ToolShell from '../../components/tools/ToolShell'

export default function TimestampTool() {
  const [unit, setUnit] = useState<'seconds' | 'milliseconds'>('seconds')
  const [value, setValue] = useState(() => String(Math.floor(Date.now() / 1000)))
  const [date, setDate] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16))
  const [error, setError] = useState('')
  const timestampToDate = () => { const n = Number(value); const result = new Date(unit === 'seconds' ? n * 1000 : n); if (!Number.isFinite(n) || Number.isNaN(result.getTime())) return setError('请输入有效时间戳'); setDate(new Date(result.getTime() - result.getTimezoneOffset() * 60000).toISOString().slice(0, 16)); setError('') }
  const dateToTimestamp = () => { const time = new Date(date).getTime(); if (Number.isNaN(time)) return setError('请选择有效时间'); setValue(String(unit === 'seconds' ? Math.floor(time / 1000) : time)); setError('') }
  const now = () => { const time = Date.now(); setValue(String(unit === 'seconds' ? Math.floor(time / 1000) : time)); setDate(new Date(time - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)); setError('') }
  return <ToolShell title="时间戳转换" description="Unix 时间戳与本地时间互转，支持秒和毫秒"><div className="inline-fields"><label>单位<select value={unit} onChange={e => setUnit(e.target.value as 'seconds' | 'milliseconds')}><option value="seconds">秒</option><option value="milliseconds">毫秒</option></select></label><button onClick={now}>当前时间</button></div><label>时间戳<input value={value} onChange={e => setValue(e.target.value)} /></label><button className="primary" onClick={timestampToDate}>时间戳转时间</button><label>本地时间<input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} /></label><button onClick={dateToTimestamp}>时间转时间戳</button>{error && <p className="error">{error}</p>}<div className="result">{date ? new Date(date).toLocaleString() : '选择时间后转换'}</div></ToolShell>
}
