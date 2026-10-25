import { useMemo, useState } from 'react'
import ToolShell from '../../../components/tools/ToolShell'
import Button from '../../../components/ui/Button'
import { inspectLocalDate, localDate, readTimestamp, utcOffset, type TimestampUnit } from './local-time'
import '../../../styles/pages/local-converters.css'

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
    <div className="tool-workbench timestamp-workbench">
      <div className="converter-heading"><p className="hint">本地双向换算 · 秒 / 毫秒</p><Button onClick={now}>使用当前时间</Button></div>
      <div className="workbench-grid">
        <section className="workbench-card" aria-labelledby="timestamp-number-heading">
          <h2 id="timestamp-number-heading">数值转换</h2>
          <div className="timestamp-number-fields">
            <label className="workbench-field" htmlFor="timestamp-value">时间戳<input id="timestamp-value" inputMode="decimal" value={value} onChange={e => { setValue(e.target.value); setOriginal(null); setError('') }} /></label>
            <label className="workbench-field" htmlFor="timestamp-unit">单位<select id="timestamp-unit" value={unit} onChange={e => changeUnit(e.target.value as TimestampUnit)}><option value="seconds">秒</option><option value="milliseconds">毫秒</option></select></label>
          </div>
          <div className="workbench-toolbar"><Button variant="primary" onClick={timestampToDate}>时间戳转时间</Button></div>
        </section>
        <section className="workbench-card" aria-labelledby="timestamp-calendar-heading">
          <h2 id="timestamp-calendar-heading">日历转换</h2>
          <label className="workbench-field" htmlFor="timestamp-date">本地时间<input id="timestamp-date" type="datetime-local" step="0.001" min="0001-01-01T00:00" max="9999-12-31T23:59:59.999" value={date} onChange={e => { setDate(e.target.value); setOriginal(null); setError('') }} /></label>
          {local.times.length > 1 && <div className="workbench-warning"><p>该本地时间出现多次；未编辑时保留原始时刻，编辑后需选择 UTC 偏移。</p><label className="workbench-field" htmlFor="timestamp-offset">重复时间的 UTC 偏移<select id="timestamp-offset" value={time ?? ''} onChange={e => { setOriginal(e.target.value ? { local: date, time: Number(e.target.value) } : null); setError('') }}><option value="">请选择时刻</option>{local.times.map(candidate => <option key={candidate} value={candidate}>{utcOffset(candidate)} · {new Date(candidate).toISOString()}</option>)}</select></label></div>}
          <div className="workbench-toolbar"><Button onClick={dateToTimestamp}>时间转时间戳</Button></div>
        </section>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="workbench-card" aria-labelledby="timestamp-status-heading">
        <h2 id="timestamp-status-heading">时刻信息</h2>
        <div role="status">
          <dl className="timestamp-facts"><div><dt>时区：</dt><dd>{zone}</dd></div><div><dt>偏移：</dt><dd>{time === null ? '尚未确定' : utcOffset(time)}</dd></div></dl>
          <p className="timestamp-instant">{time === null ? local.error || '请选择 UTC 偏移以确定时刻' : <><span>{new Date(time).toLocaleString()}</span><code>{new Date(time).toISOString()}</code></>}</p>
        </div>
      </section>
    </div>
  </ToolShell>
}
