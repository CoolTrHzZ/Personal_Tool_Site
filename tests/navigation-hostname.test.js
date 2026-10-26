import { afterEach, describe, expect, it } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import NavigationCard from '../src/components/navigation/NavigationCard'
import { navigationHostnameSourceChecks } from './helpers/navigation-hostname-source-contract.mjs'

const card = readFileSync(new URL('../src/components/navigation/NavigationCard.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles/pages/navigation.css', import.meta.url), 'utf8')
const item = (id, url, overrides = {}) => ({ id, url, name: 'Portal', description: '', category: 'dev', icon: 'letter', tags: [], enabled: true, order: 1, ...overrides })
let host, root, previousActEnvironment
function render(items) {
  previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('main')
  host.className = 'nav-page'
  document.body.append(host)
  root = createRoot(host)
  act(() => root.render(React.createElement(React.Fragment, null, ...items.map(value => React.createElement(NavigationCard, { key: value.id, item: value })))))
  return [...host.querySelectorAll('a.nav-card')]
}
afterEach(() => {
  if (root) act(() => root.unmount())
  host?.remove()
  if (root) {
    if (previousActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT
    else globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
  }
  root = host = undefined
})

describe('P05 navigation hostname source contract', () => {
  for (const [name, check] of navigationHostnameSourceChecks({ card, css })) it(name, check)
})

describe('NavigationCard synthetic ReactDOM contract', () => {
  it('shows distinct identities and exact destinations for equal names without descriptions', () => {
    const values = [item('alpha', 'https://alpha.example/docs'), item('beta', 'https://beta.example/docs')]
    const links = render(values)
    expect(links.map(link => link.querySelector('strong').textContent)).toEqual(['Portal', 'Portal'])
    expect(links.map(link => link.querySelector('em').textContent)).toEqual(['alpha.example', 'beta.example'])
    expect(links.map(link => link.getAttribute('href'))).toEqual(values.map(value => value.url))
  })
  it('retains www and non-www identities with equal descriptions', () => {
    const links = render([item('www', 'https://www.example.com', { description: 'Same description' }), item('bare', 'https://example.com', { description: 'Same description' })])
    expect(links.map(link => link.querySelector('em').textContent)).toEqual(['www.example.com', 'example.com'])
    expect(links.map(link => link.querySelector('small').textContent)).toEqual(['Same description', 'Same description'])
  })
  it('keeps the full long hostname as one text value', () => {
    const domain = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.example`
    const [link] = render([item('long', `https://${domain}:8443/path` )])
    expect(link.querySelector('em').textContent).toBe(domain)
    expect(link.getAttribute('href')).toBe(`https://${domain}:8443/path`)
  })
  it('shows normalized Unicode hostname while preserving the supplied href', () => {
    const url = 'https://例え.テスト/路径?q=%3Cscript%3E#片段'
    const [link] = render([item('unicode', url)])
    expect(link.querySelector('em').textContent).toBe('xn--r8jz45g.xn--zckzah')
    expect(link.getAttribute('href')).toBe(url)
  })
  it('renders label and description metacharacters as text, not markup', () => {
    const name = '<script>alert(1)</script>'
    const description = '<img src=x onerror=alert(1)> & "quoted"'
    const [link] = render([item('escaped', 'https://example.com/?q=%3Cimg%3E', { name, description })])
    expect(link.querySelector('strong').textContent).toBe(name)
    expect(link.querySelector('small').textContent).toBe(description)
    expect(link.querySelector('em').textContent).toBe('example.com')
    expect(link.querySelectorAll('script, img').length).toBe(0)
    expect(link.querySelector('em').children.length).toBe(0)
  })
  it('retains an explicit native anchor and synthetic focus without activating it', () => {
    const [link] = render([item('focus', 'https://example.com/docs')])
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link.hasAttribute('tabindex')).toBe(false)
    expect(link.tabIndex).toBe(0)
    expect(link.querySelectorAll('a, button, input, [tabindex]').length).toBe(0)
    link.focus()
    expect(document.activeElement).toBe(link)
  })
})
