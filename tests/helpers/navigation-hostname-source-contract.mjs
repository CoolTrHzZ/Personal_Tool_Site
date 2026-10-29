import assert from 'node:assert/strict'

// Source-contract checks; these do not render React or calculate CSS layout.
export function hostnameFromSource(card, url) {
  const expression = card.match(/<em>\{([^}]+)\}<\/em>/)?.[1]
  assert.ok([
    'new URL(item.url).hostname',
    "new URL(item.url).hostname.replace(/^www\\./, '')",
  ].includes(expression), 'inspect the actual hostname expression before evaluating it')
  return Function('item', 'URL', `return (${expression})`)({ url }, URL)
}

export function navigationHostnameSourceChecks({ card, css }) {
  const hostname = url => hostnameFromSource(card, url)
  return [
    ['retains www as part of the hostname identity', () => {
      assert.equal(hostname('https://www.example.com/docs'), 'www.example.com')
      assert.equal(hostname('https://example.com/docs'), 'example.com')
    }],
    ['keeps different domains distinct without changing URL targets', () => {
      assert.deepEqual(['https://alpha.example/docs', 'https://beta.example/docs'].map(hostname), ['alpha.example', 'beta.example'])
      assert.match(card, /href=\{item\.url\}/)
      assert.match(card, /target="_blank" rel="noopener noreferrer"/)
    }],
    ['preserves the complete long hostname', () => {
      const host = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.example`
      assert.equal(hostname(`https://${host}/path`), host)
      assert.equal(hostname(`https://${host}:8443/path`), host)
    }],
    ['uses platform hostname serialization for Unicode and IPv6', () => {
      assert.equal(hostname('https://例え.テスト/路径?q=%3Cscript%3E'), 'xn--r8jz45g.xn--zckzah')
      assert.equal(hostname('https://[2001:db8::1]:8443/path'), '[2001:db8::1]')
      assert.equal(hostname('https://EXAMPLE.com/%3Cimg%3E'), 'example.com')
    }],
    ['declares the exact untruncated P05-only hostname presentation', () => {
      const matches = [...css.matchAll(/\.nav-page\s+\.nav-card-text\s*>\s*em\s*\{([^}]+)\}/g)]
      assert.equal(matches.length, 1, 'one P05 hostname rule')
      const declarations = matches[0][1].split(';').map(x => x.trim()).filter(Boolean)
      assert.deepEqual(declarations, [
        'display: block', 'overflow-wrap: anywhere', 'white-space: normal',
        'font-style: normal', 'font-size: 12px', 'color: var(--text-secondary)',
      ])
      assert.match(css, /\.nav-card em \{ display: none; \}/)
      assert.match(css, /min-height: 72px/)
      assert.match(css, /\.nav-card-text \{[^}]*min-width: 0;/)
      assert.match(css, /\.card-arrow \{ margin-left: auto; color: var\(--text-faint\); \}/)
    }],
    ['keeps text interpolation and native anchor keyboard markup', () => {
      assert.match(card, /<strong>\{item\.name\}<\/strong><small>\{item\.description\}<\/small><em>\{/)
      assert.match(card, /<MarkTile name=\{item\.name\} url=\{item\.url\} icon=\{item\.icon\} \/>/)
      assert.match(card, /<ExternalLink className="card-arrow" size=\{16\} \/>/)
      assert.doesNotMatch(card, /dangerouslySetInnerHTML|innerHTML|tabIndex|onKeyDown|onClick/)
    }],
  ]
}
