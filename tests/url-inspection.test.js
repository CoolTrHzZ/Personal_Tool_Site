import { expect, it } from 'vitest'
import { inspectUrl, MAX_URL_INPUT_LENGTH, MAX_URL_OUTPUT_LENGTH, MAX_URL_QUERY_ROWS } from '../src/tools/packages/url/inspect'

it('preserves ordered duplicate and empty query entries with form decoding', () => {
  expect(inspectUrl('https://example.test/?a=1&a=2&=empty&empty=&flag&=&plus=a+b&literal=a%2Bb&percent=%2520').query).toEqual([
    ['a', '1'], ['a', '2'], ['', 'empty'], ['empty', ''], ['flag', ''], ['', ''], ['plus', 'a b'], ['literal', 'a+b'], ['percent', '%20'],
  ])
})

it('returns a normalized view without rewriting the original input', () => {
  const input = 'HTTPS://例え.テスト:443/a/../目录?q=中文#片段'
  expect(inspectUrl(input)).toEqual({ normalized: 'https://xn--r8jz45g.xn--zckzah/%E7%9B%AE%E5%BD%95?q=%E4%B8%AD%E6%96%87#%E7%89%87%E6%AE%B5', scheme: 'https', hostname: 'xn--r8jz45g.xn--zckzah', port: '', pathname: '/%E7%9B%AE%E5%BD%95', fragment: '#%E7%89%87%E6%AE%B5', query: [['q', '中文']] })
  expect(input).toBe('HTTPS://例え.テスト:443/a/../目录?q=中文#片段')
})

it('retains non-default ports, IPv6 syntax and encoded pathname/fragment', () => {
  const result = inspectUrl('http://[2001:db8::1]:8080/a%2Fb?emoji=%F0%9F%98%80#x%2By+z')
  expect(result.hostname).toBe('[2001:db8::1]')
  expect(result.port).toBe('8080')
  expect(result.pathname).toBe('/a%2Fb')
  expect(result.fragment).toBe('#x%2By+z')
  expect(result.query).toEqual([['emoji', '😀']])
  expect(inspectUrl('http://example.test:0').port).toBe('0')
  expect(inspectUrl('http://example.test:80').port).toBe('')
})

it('keeps parser semantics for empty delimiters and query strings without parameters', () => {
  const result = inspectUrl('https://example.test/?&&#')
  expect(result.query).toEqual([])
  expect(result.fragment).toBe('')
  expect(result.normalized).toBe('https://example.test/?&&#')
})

it.each(['', '/relative', '//example.test/', 'example.test', 'https:example.test', 'https:///example.test', 'javascript:alert(1)', 'data:text/plain,hi', 'file:///tmp/example', 'ftp://example.test/', 'https://', 'https://[broken/', 'https://example.test:65536/', 'https://example.test/%', 'https://example.test/?x=%ZZ', 'https://example.test/?x=%C3%28', ' https://example.test/', 'https://example.test/a b', 'https://example.test/\n', 'https://example.test\\path'])('rejects unsupported, relative or malformed input %j', input => {
  expect(() => inspectUrl(input)).toThrow()
})

it.each(['https://alice:synthetic-password@example.test/', 'https://alice@example.test/', 'https://:synthetic-password@example.test/', 'https://@example.test/', 'https://%61lice:secret@example.test/'])('rejects userinfo without echoing it: case %#', input => {
  expect(() => inspectUrl(input)).toThrow('不解析含用户信息或密码的 URL')
})

it('allows @ outside authority and retains dangerous-looking text as data', () => {
  const result = inspectUrl('https://example.test/a@b?__proto__=constructor&x=%3Cscript%3E#javascript:alert(1)')
  expect(result.query).toEqual([['__proto__', 'constructor'], ['x', '<script>']])
  expect(result.fragment).toBe('#javascript:alert(1)')
})

it('accepts the input and query limits exactly and rejects overflow without partial data', () => {
  const prefix = 'https://example.test/'
  const input = prefix + 'a'.repeat(MAX_URL_INPUT_LENGTH - prefix.length)
  expect(inspectUrl(input).normalized).toBe(input)
  expect(() => inspectUrl(input + 'a')).toThrow('8192')
  const query = Array.from({ length: MAX_URL_QUERY_ROWS }, () => 'a=').join('&')
  expect(inspectUrl(prefix + '?' + query).query).toHaveLength(100)
  expect(() => inspectUrl(prefix + '?' + query + '&a=')).toThrow('100')
})

it('bounds expanded normalized output and gives identical results on repeat', () => {
  const input = 'https://example.test/' + '中'.repeat(2000)
  expect(input.length).toBeLessThan(MAX_URL_INPUT_LENGTH)
  expect(() => inspectUrl(input)).toThrow(String(MAX_URL_OUTPUT_LENGTH))
  const accepted = 'https://example.test/?a=1&a=&=x#fragment'
  expect(inspectUrl(accepted)).toEqual(inspectUrl(accepted))
})
