import { expect, it } from 'vitest'
import { sortJsonKeys } from '../src/tools/packages/json/sort'

it.each([null, true, false, 0, -0, 1.25, -42, '', '汉字 👋'])('preserves the primitive value %j', value => {
  expect(Object.is(sortJsonKeys(value), value)).toBe(true)
})

it('recurses into objects inside arrays without moving any array element', () => {
  const value = JSON.parse('{"z":false,"a":[3,{"z":null,"a":[{"b":true,"a":"str"}]},1]}')
  const result = sortJsonKeys(value)
  expect(JSON.stringify(result)).toBe('{"a":[3,{"a":[{"a":"str","b":true}],"z":null},1],"z":false}')
  expect(result).toEqual(value)
})

it('emits integer indices first numerically and other numeric-looking keys by UTF-16 order', () => {
  const value = JSON.parse('{"4294967295":0,"10":0,"2":0,"01":0,"-1":0,"0":0,"1e0":0,"4294967294":0,"-0":0,"00":0}')
  expect(JSON.stringify(sortJsonKeys(value))).toBe('{"0":0,"2":0,"10":0,"4294967294":0,"-0":0,"-1":0,"00":0,"01":0,"1e0":0,"4294967295":0}')
})

it('uses case-sensitive UTF-16 code units without locale comparison or Unicode normalization', () => {
  const value = JSON.parse('{"\uE000":0,"😀":0,"中":0,"é":0,"ä":0,"z":0,"é":0,"a":0,"A":0}')
  expect(Object.keys(sortJsonKeys(value))).toEqual(['A', 'a', 'e\u0301', 'z', 'ä', 'é', '中', '😀', '\uE000'])
})

it('retains special JSON keys as own data properties without prototype changes or field loss', () => {
  const value = JSON.parse('{"toString":"text","constructor":{"prototype":{"z":1,"a":2}},"__proto__":{"polluted":true,"a":null}}')
  const result = sortJsonKeys(value)
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  expect(Object.hasOwn(result, '__proto__')).toBe(true)
  expect(Object.hasOwn(result, 'constructor')).toBe(true)
  expect(Object.hasOwn(result, 'toString')).toBe(true)
  expect(Object.getOwnPropertyDescriptor(result, '__proto__').value).toEqual({ a: null, polluted: true })
  expect({}.polluted).toBeUndefined()
  expect(JSON.stringify(result)).toBe('{"__proto__":{"a":null,"polluted":true},"constructor":{"prototype":{"a":2,"z":1}},"toString":"text"}')
  expect(JSON.parse(JSON.stringify(result))).toEqual(value)
})

it('does not mutate the input and produces identical bytes on repeated sorting', () => {
  const value = JSON.parse('{"z":{"z":1,"a":2},"a":[{"b":3,"a":4}]}')
  const original = JSON.stringify(value)
  Object.freeze(value.z); Object.freeze(value.a[0]); Object.freeze(value.a); Object.freeze(value)
  const sorted = sortJsonKeys(value)
  expect(JSON.stringify(value)).toBe(original)
  expect(sorted).not.toBe(value)
  expect(sorted.a).not.toBe(value.a)
  expect(JSON.stringify(sortJsonKeys(sorted), null, 2)).toBe(JSON.stringify(sorted, null, 2))
})

it.each(['{}', '[]'])('retains empty %s', raw => {
  expect(JSON.stringify(sortJsonKeys(JSON.parse(raw)))).toBe(raw)
})
