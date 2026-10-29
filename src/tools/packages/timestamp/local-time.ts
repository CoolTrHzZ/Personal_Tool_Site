export type TimestampUnit = 'seconds' | 'milliseconds'
const pad = (value: number, width = 2) => String(value).padStart(width, '0')

export function localDate(time: number) {
  const date = new Date(time)
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

export function readTimestamp(value: string, unit: TimestampUnit): number | null {
  const n = Number(value)
  const date = new Date(unit === 'seconds' ? Math.round(n * 1000) : n)
  if (!value.trim() || !Number.isFinite(n) || Number.isNaN(date.getTime()) || date.getFullYear() < 1 || date.getFullYear() > 9999) return null
  return date.getTime()
}

// UTC construction via setters avoids Date's special treatment of years 00–99.
function wallTime(year: number, month: number, day: number, hour: number, minute: number, second: number, ms: number) {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(hour, minute, second, ms)
  return date
}

function offsetAt(time: number) {
  const date = new Date(time)
  return wallTime(date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()).getTime() - time
}

export function utcOffset(time: number) {
  const seconds = Math.abs(offsetAt(time)) / 1000
  return `UTC${offsetAt(time) < 0 ? '-' : '+'}${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds % 3600 / 60))}${seconds % 60 ? ':' + pad(seconds % 60) : ''}`
}

export function inspectLocalDate(value: string): { times: number[]; error: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value)
  if (!match) return { times: [], error: '请选择有效时间' }
  const [, year, month, day, hour, minute, second = '00', fraction = '0'] = match
  const ms = fraction.padEnd(3, '0')
  const canonical = `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}`
  const wall = wallTime(+year, +month, +day, +hour, +minute, +second, +ms)
  if (+year < 1 || wall.toISOString() !== canonical + 'Z') return { times: [], error: '请选择有效时间' }

  // Discover nearby native timezone offsets, including non-hour and date-line changes.
  // Verify every candidate against ALL local fields; never accept Date's gap normalization.
  const offsets = new Set<number>()
  for (let hours = -48; hours <= 48; hours++) offsets.add(offsetAt(wall.getTime() + hours * 3_600_000))
  const times = [...offsets].map(offset => wall.getTime() - offset)
    .filter(time => localDate(time) === canonical).sort((a, b) => a - b)
  return { times, error: times.length ? '' : '该本地时间在当前时区不存在，请选择其他时间（时钟跳变）。' }
}
