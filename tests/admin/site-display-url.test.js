// @vitest-environment node
import { expect, it } from 'vitest'
import { parseSiteDisplayUrl } from '../../shared/site-display-url.js'

it('accepts ordinary HTTP(S) display URLs and optional empty legacy URLs', () => {
  expect(parseSiteDisplayUrl('https://example.invalid:2087/admin/').href).toBe('https://example.invalid:2087/admin/')
  expect(parseSiteDisplayUrl('http://127.0.0.1:4174/admin/').href).toBe('http://127.0.0.1:4174/admin/')
  expect(parseSiteDisplayUrl('')).toBeNull()
})

it.each(['javascript:alert(1)','data:text/html,test','ftp://example.invalid','https://user:synthetic@example.invalid/',42,null])('rejects unsafe display URL %s without returning a link', value => {
  expect(() => parseSiteDisplayUrl(value)).toThrow()
})
