import { afterEach, expect, it, vi } from 'vitest'
import { inspectLocalDate, localDate, readTimestamp, utcOffset } from '../src/tools/packages/timestamp/local-time'

afterEach(() => vi.unstubAllEnvs())
const zone = value => vi.stubEnv('TZ', value)

it('finds both New York folds with exact milliseconds and different offsets', () => {
  zone('America/New_York')
  const { times, error } = inspectLocalDate('2026-11-01T01:30:00.123')
  expect(error).toBe('')
  expect(times).toEqual([1793511000123, 1793514600123])
  expect(times.map(utcOffset)).toEqual(['UTC-04:00', 'UTC-05:00'])
  expect(times.map(localDate)).toEqual(['2026-11-01T01:30:00.123', '2026-11-01T01:30:00.123'])
})

it.each([
  ['America/New_York', '2026-03-08T02:30'],
  ['Australia/Lord_Howe', '2026-10-04T02:15'],
  ['Pacific/Apia', '2011-12-30T12:00'],
])('rejects nonexistent time in %s: %s', (name, value) => {
  zone(name)
  expect(inspectLocalDate(value)).toEqual({ times: [], error: expect.stringContaining('不存在') })
})

it('finds a half-hour fold rather than assuming every fold lasts one hour', () => {
  zone('Australia/Lord_Howe')
  const { times } = inspectLocalDate('2026-04-05T01:45:00.001')
  expect(times.map(time => new Date(time).toISOString())).toEqual(['2026-04-04T14:45:00.001Z', '2026-04-04T15:15:00.001Z'])
  expect(times.map(utcOffset)).toEqual(['UTC+11:00', 'UTC+10:30'])
})

it.each([
  ['America/New_York', '2026-07-01T12:34:56.007', '2026-07-01T16:34:56.007Z', 'UTC-04:00'],
  ['America/New_York', '2026-01-01T12:34', '2026-01-01T17:34:00.000Z', 'UTC-05:00'],
  ['UTC', '2026-11-01T01:30:00.1', '2026-11-01T01:30:00.100Z', 'UTC+00:00'],
  ['Asia/Kathmandu', '2026-07-01T12:00:00.123', '2026-07-01T06:15:00.123Z', 'UTC+05:45'],
  ['UTC', '0001-01-01T00:00', '0001-01-01T00:00:00.000Z', 'UTC+00:00'],
  ['UTC', '0099-12-31T23:59:59.999', '0099-12-31T23:59:59.999Z', 'UTC+00:00'],
  ['UTC', '9999-12-31T23:59:59.999', '9999-12-31T23:59:59.999Z', 'UTC+00:00'],
])('resolves normal date in %s: %s', (name, value, iso, offset) => {
  zone(name)
  expect(inspectLocalDate(value)).toEqual({ times: [Date.parse(iso)], error: '' })
  expect(utcOffset(Date.parse(iso))).toBe(offset)
})

it.each(['', '2026-02-30T12:00', '2026-13-01T12:00', '2026-01-01T24:00', '2026-01-01T12:60', '2026-01-01T12:00:60', '0000-01-01T00:00', '2026-01-01T12:00Z', '2026-01-01T12:00:00.1234'])('rejects invalid local syntax/calendar fields: %j', value => {
  zone('UTC')
  expect(inspectLocalDate(value)).toEqual({ times: [], error: '请选择有效时间' })
})

it('preserves existing timestamp rounding, units and range checks', () => {
  zone('UTC')
  expect(readTimestamp('1793514600.123', 'seconds')).toBe(1793514600123)
  expect(readTimestamp('1793514600123', 'milliseconds')).toBe(1793514600123)
  expect(readTimestamp('1.001', 'seconds')).toBe(1001)
  expect(readTimestamp('-1.001', 'seconds')).toBe(-1001)
  for (const value of ['', ' ', 'Infinity', 'NaN', '1e100', '253402300800000']) expect(readTimestamp(value, 'milliseconds')).toBeNull()
})
