import { useMemo, useState } from 'react'
import ToolShell from '../../../components/tools/ToolShell'
import Button from '../../../components/ui/Button'
import { inspectLocalDate, localDate, readTimestamp, utcOffset, type TimestampUnit } from './local-time'

export default function TimestampTool() {
  const [unit, setUnit] = useState<TimestampUnit>('seconds')
  const [value, setValue] = useState(() => String(Math.floor(Date.now() / 1000)))
  const [date, setDate] = useState(() => localDate(Number(value) * 1000))
  const [original, setOriginal] = useState<{ local: string; time: number } | null>(() => ({ local: date, time: Number(value) * 1000 }))
  const [error, setError] = useState('')
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '系统本地时区'
  const local = useMemo(() => inspectLocalDate(date), [date, zone])
  const time = original?.local === date && local.times.includes(original.time)
    ? original.time : local.times.length === 1 ? local.times[0] : null
  const acceptInstant = (next: number) => {
    const representation = localDate(next)
    setDate(representation); setOriginal({ local: representation, time: next }); setError('')
  }
  const timestampToDate = () => {
    const next = readTimestamp(value, unit)
    if (next === null) return setError('请输入有效时间戳（本地年份 0001–9999）')
    acceptInstant(next)
  }
  const dateToTimestamp = () => {
    if (time === null) return setError(local.error || '该本地时间出现多次，请选择 UTC 偏移以确定时刻。')
    setValue(String(unit === 'seconds' ? time / 1000 : time)); setOriginal({ local: date, time }); setError('')
  }
  const now = () => { const next = Date.now(); setValue(String(unit === 'seconds' ? next / 1000 : next)); acceptInstant(next) }
  const changeUnit = (next: TimestampUnit) => {
    if (next !== unit && value.trim() && Number.isFinite(Number(value))) setValue(String(next === 'seconds' ? Number(value) / 1000 : Math.round(Number(value) * 1000)))
    setUnit(next)
  }
  return <ToolShell title="时间戳转换" category="development" description="Unix 时间戳与本地时间互转，保留秒和毫秒精度">
    <div className="inline-fields"><label>单位<select value={unit} onChange={e => changeUnit(e.target.value as TimestampUnit)}><option value="seconds">秒</option><option value="milliseconds">毫秒</option></select></label><Button onClick={now}>使用当前时间</Button></div>
    <label>时间戳<input inputMode="decimal" value={value} onChange={e => { setValue(e.target.value); setOriginal(null); setError('') }} /></label><Button variant="primary" onClick={timestampToDate}>时间戳转时间</Button>
    <label>本地时间<input type="datetime-local" step="0.001" min="0001-01-01T00:00" max="9999-12-31T23:59:59.999" value={date} onChange={e => { setDate(e.target.value); setOriginal(null); setError('') }} /></label>
    {local.times.length > 1 && <><p>该本地时间出现多次；未编辑时保留原始时刻，编辑后需选择 UTC 偏移。</p><label>重复时间的 UTC 偏移<select value={time ?? ''} onChange={e => { setOriginal(e.target.value ? { local: date, time: Number(e.target.value) } : null); setError('') }}><option value="">请选择时刻</option>{local.times.map(candidate => <option key={candidate} value={candidate}>{utcOffset(candidate)} · {new Date(candidate).toISOString()}</option>)}</select></label></>}
    <Button onClick={dateToTimestamp}>时间转时间戳</Button>{error && <p className="error" role="alert">{error}</p>}
    <div className="result" role="status">时区：{zone}；偏移：{time === null ? '尚未确定' : utcOffset(time)}<br />{time === null ? local.error || '请选择 UTC 偏移以确定时刻' : <>{new Date(time).toLocaleString()} · {new Date(time).toISOString()}</>}</div>
  </ToolShell>
}
