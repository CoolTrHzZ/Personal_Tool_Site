import { useState } from 'react'
import ToolShell from '../../../components/tools/ToolShell'

const localDate = (time: number) => {
  const date = new Date(time)
  const pad = (value: number, width = 2) => String(value).padStart(width, '0')
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

export default function TimestampTool() {
  const [unit, setUnit] = useState<'seconds' | 'milliseconds'>('seconds')
  const [value, setValue] = useState(() => String(Math.floor(Date.now() / 1000)))
  const [date, setDate] = useState(() => localDate(Number(value) * 1000))
  const [error, setError] = useState('')
  const timestampToDate = () => {
    const n = Number(value)
    const result = new Date(unit === 'seconds' ? Math.round(n * 1000) : n)
    if (!value.trim() || !Number.isFinite(n) || Number.isNaN(result.getTime()) || result.getFullYear() < 1 || result.getFullYear() > 9999) return setError('请输入有效时间戳（本地年份 0001–9999）')
    setDate(localDate(result.getTime())); setError('')
  }
  const dateToTimestamp = () => { const time = new Date(date).getTime(); if (Number.isNaN(time)) return setError('请选择有效时间'); setValue(String(unit === 'seconds' ? time / 1000 : time)); setError('') }
  const now = () => { const time = Date.now(); setValue(String(unit === 'seconds' ? time / 1000 : time)); setDate(localDate(time)); setError('') }
  const changeUnit = (next: 'seconds' | 'milliseconds') => {
    if (next !== unit && value.trim() && Number.isFinite(Number(value))) setValue(String(next === 'seconds' ? Number(value) / 1000 : Math.round(Number(value) * 1000)))
    setUnit(next)
  }
  return <ToolShell title="时间戳转换" category="development" description="Unix 时间戳与本地时间互转，保留秒和毫秒精度"><div className="inline-fields"><label>单位<select value={unit} onChange={e => changeUnit(e.target.value as 'seconds' | 'milliseconds')}><option value="seconds">秒</option><option value="milliseconds">毫秒</option></select></label><button onClick={now}>当前时间</button></div><label>时间戳<input inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} /></label><button className="primary" onClick={timestampToDate}>时间戳转时间</button><label>本地时间<input type="datetime-local" step="0.001" min="0001-01-01T00:00" max="9999-12-31T23:59:59.999" value={date} onChange={e => setDate(e.target.value)} /></label><button onClick={dateToTimestamp}>时间转时间戳</button>{error && <p className="error" role="alert">{error}</p>}<div className="result">{date ? new Date(date).toLocaleString() : '选择时间后转换'}</div></ToolShell>
}
