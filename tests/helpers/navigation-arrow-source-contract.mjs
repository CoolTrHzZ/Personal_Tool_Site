import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

// Source preservation checks only; no React rendering or browser geometry.
export const navigationArrowRule = '.nav-page .nav-card > .card-arrow { flex-shrink: 0; }\n'
const parentCssSHA256 = '85eb5dc27453c9c602310a6cdbb858d63ae78783d6ba6ea09e505bf393725244'
const parentCardSHA256 = 'e4333e4a8d66f7fe651fe8855b7152b47b1b3933504c15f825bc36f096b65dc4'
const sha256 = value => createHash('sha256').update(value).digest('hex')

export function assertNavigationArrowSource({ card, css }) {
  const rules = [...css.matchAll(/\.nav-page\s+\.nav-card\s*>\s*\.card-arrow\s*\{([^}]*)\}/g)]
  assert.equal(rules.length, 1, 'exactly one P05 direct-child arrow rule')
  assert.deepEqual(rules[0][1].split(';').map(x => x.trim()).filter(Boolean), ['flex-shrink: 0'])
  assert.ok(css.endsWith(navigationArrowRule), 'append the exact scoped rule once')
  assert.equal(css.split(navigationArrowRule).length - 1, 1)
  assert.equal(sha256(css.slice(0, -navigationArrowRule.length)), parentCssSHA256, 'all previous CSS bytes remain unchanged')
  assert.equal(sha256(card), parentCardSHA256, 'all NavigationCard bytes remain unchanged')
  assert.match(card, /return <a className="nav-card"[^>]*>.*<\/span><ExternalLink className="card-arrow" size=\{16\} \/><\/a>/)
}

export function navigationArrowSourceCases(source) {
  const { card, css } = source
  const rejectCss = value => assert.throws(() => assertNavigationArrowSource({ card, css: value }))
  return [
    ['adds only the exact scoped shrink declaration and preserves the direct-child 16px source contract', () => assertNavigationArrowSource(source)],
    ['rejects the 117c CSS without the new rule', () => {
      assert.ok(css.endsWith(navigationArrowRule))
      rejectCss(css.slice(0, -navigationArrowRule.length))
    }],
    ['rejects shared, global SVG and broader selectors', () => {
      for (const selector of ['.card-arrow', 'svg', '.nav-page .card-arrow', '.nav-page .nav-card svg']) {
        rejectCss(css.replace('.nav-page .nav-card > .card-arrow {', `${selector} {`))
      }
    }],
    ['rejects duplicate rules', () => rejectCss(css + navigationArrowRule)],
    ['rejects extra dimensions or changed shrink values', () => {
      for (const declaration of ['flex-shrink: 1;', 'flex-shrink: 0; width: 16px;', 'flex-shrink: 0; min-width: 16px;', 'flex-shrink: 0; flex-basis: 16px;']) {
        rejectCss(css.replace('flex-shrink: 0;', declaration))
      }
    }],
    ['rejects unrelated CSS changes including hostname truncation and shared-arrow changes', () => {
      for (const value of [css.replace('overflow-wrap: anywhere', 'overflow-wrap: normal'), css.replace('white-space: normal', 'white-space: nowrap'), css.replace('margin-left: auto;', 'margin-left: auto; flex-shrink: 0;'), css + 'body { min-width: 0; }\n']) rejectCss(value)
    }],
    ['rejects component, link target and arrow structure changes', () => {
      for (const value of [card.replace('size={16}', 'size={15}'), card.replace('href={item.url}', 'href="#"'), card.replace('target="_blank"', 'target="_self"'), card.replace('<ExternalLink', '<span><ExternalLink').replace('size={16} /></a>', 'size={16} /></span></a>')]) {
        assert.throws(() => assertNavigationArrowSource({ card: value, css }))
      }
    }],
  ]
}
