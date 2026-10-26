// Executes each page's complete, unmodified inline script in Node VM.
// DOM elements, event lifetime, clipboard outcomes and timers below are synthetic.
// This is not React, native-browser, clipboard-permission or displayed-command validation.
// The only filesystem operation is reading the selected HTML source; there are no
// network, process-launch, install, real clipboard or filesystem-write capabilities.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { TextEncoder } from 'node:util'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const pagePaths = {
  rainbow: 'public/tools/community-rainbow-chat-generator-v4-unicode-fix/index.html',
  adcp: 'public/tools/adcp-v3-overview/index.html',
}
const encoder = new TextEncoder()
const colors = [
  [0x07, '#ff4b4b'], [0x10, '#ff9b42'], [0x09, '#ffe15a'],
  [0x06, '#85ef54'], [0x04, '#45d67a'], [0x0b, '#62a7ff'],
  [0x0c, '#6480ff'], [0x0e, '#c36cff'], [0x0f, '#ff79a8'],
]
const hex = bytes => Array.from(bytes, n => n.toString(16).toUpperCase().padStart(2, '0')).join(' ')
const escapeHTML = text => text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[ch])
// Only the ADCP page's fixed span-wrapped snippet format is modeled.
const snippetText = html => html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

function readPage(kind, options) {
  // Normal tests need no external fixture. These overrides let an external runner
  // apply exactly these cases to an independently pinned source as a negative control.
  const sourcePath = options.sourcePath || resolve(options.sourceRoot || process.env.STATIC_HTML_SOURCE_ROOT || projectRoot, pagePaths[kind])
  const source = readFileSync(sourcePath, 'utf8')
  const scripts = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  assert.equal(scripts.length, 1, 'one whole inline script is required')
  assert.equal(scripts[0][1].trim(), '', 'the selected script must be inline and unmodified')
  return { source, sourcePath, script: scripts[0][2] }
}

class Element {
  constructor(tag = 'div', text = '') {
    this.tag = tag
    this.value = ''
    this.checked = false
    this.dataset = {}
    this.style = {}
    this.listeners = new Map()
    this.classes = new Set()
    this._html = ''
    this._text = text
    this.classList = {
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name),
      contains: name => this.classes.has(name),
    }
  }
  set innerHTML(value) { this._html = String(value); this._text = '' }
  get innerHTML() { return this._html }
  set textContent(value) { this._text = String(value); this._html = '' }
  get textContent() { return this._text }
  get innerText() { return this._html ? snippetText(this._html) : this._text }
  addEventListener(type, fn) {
    const listeners = this.listeners.get(type) || []
    listeners.push(fn)
    this.listeners.set(type, listeners)
  }
  dispatch(type) {
    const event = { target: this, currentTarget: this }
    this.lastEvent = event
    let result
    try {
      result = this[`on${type}`]?.(event)
      for (const fn of this.listeners.get(type) || []) result = fn(event)
      return result
    } finally {
      // Deliberately clear immediately after synchronous dispatch, before any
      // awaited clipboard operation resumes. No persistent-target control stub.
      event.currentTarget = null
    }
  }
  closest(selector) { return selector === '#palette' && this.inPalette ? this.parent : null }
  focus() { this.focused = true }
  select() { this.selected = true }
  remove() { this.removed = true }
}

function deferred() {
  let resolvePromise, rejectPromise
  const promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject })
  return { promise, resolve: resolvePromise, reject: rejectPromise }
}

function syntheticClipboard(mode = 'resolved') {
  const writes = [], pending = [], navigator = {}
  assert.ok(['resolved', 'rejected', 'pending', 'absent', 'throw'].includes(mode))
  if (mode !== 'absent') navigator.clipboard = {
    writeText(text) {
      writes.push(text)
      if (mode === 'throw') throw new Error('synthetic synchronous clipboard failure')
      if (mode === 'rejected') return Promise.reject(new Error('synthetic clipboard rejection'))
      if (mode === 'pending') {
        const operation = deferred()
        pending.push(operation)
        return operation.promise
      }
      return Promise.resolve()
    },
  }
  return { navigator, writes, pending }
}

function syntheticTimers() {
  const timers = new Map()
  let nextId = 0
  return {
    timers,
    setTimeout(fn, ms) { const id = ++nextId; timers.set(id, { fn, ms }); return id },
    clearTimeout(id) { timers.delete(id) },
    runTimer(id = timers.keys().next().value) {
      assert.ok(timers.has(id), 'a scheduled synthetic timer must exist')
      const timer = timers.get(id)
      timers.delete(id)
      timer.fn()
    },
    runTimers() {
      for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn() }
    },
  }
}

// A fixed microtask drain, not a wall-clock wait, polling loop or retry.
export async function settle() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

export function createRainbowHarness(options = {}) {
  const page = readPage('rainbow', options)
  const elements = new Map()
  for (const match of page.source.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const [, tag, attrs, id] = match
    const element = new Element(tag)
    element.id = id
    element.value = attrs.match(/\bvalue="([^"]*)"/)?.[1] || ''
    element.checked = /\bchecked\b/.test(attrs)
    if (tag === 'textarea') element.value = page.source.slice(match.index + match[0].length).split('</textarea>')[0]
    elements.set(id, element)
  }
  const palette = elements.get('palette')
  assert.ok(palette)
  let paletteInputs = []
  Object.defineProperty(palette, 'innerHTML', {
    get() { return this._html },
    set(value) {
      this._html = String(value)
      paletteInputs = [...this._html.matchAll(/<input\b([^>]*)>/g)].map(match => {
        const element = new Element('input')
        element.dataset.i = match[1].match(/data-i="([^"]+)"/)[1]
        element.checked = /\bchecked\b/.test(match[1])
        element.inPalette = true
        element.parent = palette
        return element
      })
    },
  })
  const clipboard = syntheticClipboard(options.clipboardMode)
  const timers = syntheticTimers()
  const created = [], appended = [], execs = []
  const document = {
    getElementById(id) { assert.ok(elements.has(id), `known element ${id}`); return elements.get(id) },
    querySelectorAll(selector) {
      if (selector === '#palette input[type=checkbox]') return paletteInputs
      if (selector === 'textarea,input,select') return [...elements.values()].filter(el => ['textarea', 'input', 'select'].includes(el.tag)).concat(paletteInputs)
      throw new Error(`unmodeled selector: ${selector}`)
    },
    createElement(tag) { assert.equal(tag, 'textarea'); const el = new Element(tag); created.push(el); return el },
    body: { appendChild(el) { appended.push(el) } },
    execCommand(command) { assert.equal(command, 'copy'); execs.push(command); return options.execResult ?? true },
  }
  const context = vm.createContext({
    document, navigator: clipboard.navigator, TextEncoder,
    Intl: options.fallbackIntl ? {} : Intl,
    window: {}, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
  }, { codeGeneration: { strings: false, wasm: false } })
  new vm.Script(page.script, { filename: page.sourcePath }).runInContext(context, { timeout: 1000 })
  const evaluate = code => vm.runInContext(code, context, { timeout: 1000 })
  const harness = {
    sourcePath: page.sourcePath,
    el(id) { assert.ok(elements.has(id), `known element ${id}`); return elements.get(id) },
    writes: clipboard.writes, pending: clipboard.pending,
    created, appended, execs, ...timers, settle,
    raw: () => evaluate('rawText'),
    graphemes(text) { context.fixtureText = text; return Array.from(evaluate('splitGraphemes(fixtureText)')) },
    rebuild(raw, generatedControls) {
      context.fixtureRaw = raw
      context.fixtureControls = generatedControls
      return evaluate('rebuildPlain(fixtureRaw, fixtureControls)')
    },
    setText(text, event = 'input') {
      assert.ok(event === 'input' || event === 'change')
      elements.get('text').value = text
      elements.get('text').dispatch(event)
    },
    setOption(id, value, event = 'change') {
      assert.ok(event === 'input' || event === 'change')
      const el = this.el(id)
      if (typeof value === 'boolean') el.checked = value
      else el.value = String(value)
      el.dispatch(event)
    },
    toggleColor(index, enabled) {
      assert.ok(paletteInputs[index], 'known palette index')
      paletteInputs[index].checked = enabled
      paletteInputs[index].dispatch('change')
    },
    click(id) { return this.el(id).dispatch('click') },
    snapshot() { return collectRainbowSnapshot(this) },
  }
  return harness
}

export async function collectRainbowSnapshot(harness) {
  const raw = harness.raw()
  const start = harness.writes.length
  for (const button of ['copyCommand', 'copyText', 'copyRedTest', 'copyHex']) {
    harness.click(button)
    await settle()
  }
  assert.equal(harness.writes.length - start, 4, 'one clipboard write per copy button')
  return {
    // integrity is deliberately separate for candidate/base output comparisons.
    integrity: harness.el('integrity').textContent,
    outputs: {
      raw,
      rawCodepoints: Array.from(raw, cp => cp.codePointAt(0)),
      utf8: Array.from(encoder.encode(raw)),
      utf8Hex: hex(encoder.encode(raw)),
      previewHTML: harness.el('preview').innerHTML,
      previewText: harness.el('preview').textContent,
      debug: harness.el('debug').textContent,
      commandDebug: harness.el('commandDebug').textContent,
      hexDebug: harness.el('hexDebug').textContent,
      counts: Object.fromEntries(['chars', 'codepoints', 'controls', 'bytes'].map(id => [id, harness.el(id).textContent])),
      copyPayloads: harness.writes.slice(start),
    },
  }
}

export function createAdcpHarness(options = {}) {
  const page = readPage('adcp', options)
  const term = new Element('pre'), copy = new Element('button', 'COPY')
  const tabs = [...page.source.matchAll(/<button class="tab( active)?" data-tab="([^"]+)">([^<]*)<\/button>/g)].map(match => {
    const element = new Element('button', match[3])
    element.dataset.tab = match[2]
    if (match[1]) element.classes.add('active')
    return element
  })
  const clipboard = syntheticClipboard(options.clipboardMode)
  const timers = syntheticTimers()
  const document = {
    getElementById(id) {
      if (id === 'termContent') return term
      if (id === 'copyCode') return copy
      throw new Error(`unmodeled element: ${id}`)
    },
    querySelectorAll(selector) { assert.equal(selector, '.tab'); return tabs },
  }
  const context = vm.createContext({ document, navigator: clipboard.navigator, setTimeout: timers.setTimeout }, { codeGeneration: { strings: false, wasm: false } })
  new vm.Script(page.script, { filename: page.sourcePath }).runInContext(context, { timeout: 1000 })
  return {
    sourcePath: page.sourcePath, term, copy, tabs,
    writes: clipboard.writes, pending: clipboard.pending, ...timers, settle,
    snippets: () => JSON.parse(vm.runInContext('JSON.stringify(snippets)', context, { timeout: 1000 })),
    clickTab(key) { const tab = tabs.find(el => el.dataset.tab === key); assert.ok(tab, 'known tab'); return tab.dispatch('click') },
    clickCopy() { return copy.dispatch('click') },
  }
}

// Explicit fixture segments specify the required control before each original
// segment. They do not reproduce the production color-selection algorithm.
export const rainbowCompatibilityFixtures = [
  { group: 'tabs', name: 'leading TAB', text: '\tA', count: 2, segments: [[null, '\t'], [0, 'A']] },
  { group: 'tabs', name: 'trailing TAB', text: 'A\t', count: 2, segments: [[0, 'A'], [null, '\t']] },
  { group: 'tabs', name: 'consecutive TABs via change', text: '\t\tA\t\tB\t', event: 'change', count: 7, segments: [[null, '\t\t'], [0, 'A'], [null, '\t\t'], [1, 'B'], [null, '\t']] },
  { group: 'controls', name: 'every original palette character', text: '\x07\x10\t\x06\x04\x0b\x0c\x0e\x0f', count: 9, segments: [[0, '\x07'], [1, '\x10'], [null, '\t'], [2, '\x06'], [3, '\x04'], [null, '\x0b\x0c'], [5, '\x0e'], [7, '\x0f']] },
  { group: 'whitespace', name: 'LF CR CRLF NBSP EM SPACE', text: 'A\nB\rC\r\nD\u00a0E\u2003F', count: 11, segments: [[0, 'A'], [null, '\n'], [1, 'B'], [null, '\r'], [2, 'C'], [null, '\r\n'], [3, 'D'], [null, '\u00a0'], [5, 'E'], [null, '\u2003'], [7, 'F']] },
  { group: 'unicode', name: 'combining emoji ZWJ flags variation selector', text: '欢e\u0301👩🏽‍💻🇨🇳✈️', count: 5, segments: [[0, '欢'], [1, 'e\u0301'], [2, '👩🏽‍💻'], [3, '🇨🇳'], [5, '✈️']] },
  { group: 'unicode', name: 'UTF16 offsets after supplementary and combining clusters', text: '👩🏽‍💻\te\u0301🇨🇳\t', count: 5, options: { controlBeforeSpace: true }, segments: [[0, '👩🏽‍💻'], [1, '\t'], [1, 'e\u0301'], [2, '🇨🇳'], [3, '\t']] },
  { group: 'unicode', name: 'combining punctuation with skipPunc', text: '>\u0307A🇨🇳!', count: 4, options: { skipPunc: true }, segments: [[null, '>\u0307'], [0, 'A'], [null, '🇨🇳!']] },
  { group: 'options', name: 'skip spaces only', text: 'A\t! B', count: 5, options: { skipSpace: true, controlBeforeSpace: false, skipPunc: false }, segments: [[0, 'A'], [null, '\t'], [1, '!'], [null, ' '], [2, 'B']] },
  { group: 'options', name: 'skip spaces and punctuation', text: 'A\t! B', count: 5, options: { skipSpace: true, controlBeforeSpace: false, skipPunc: true }, segments: [[0, 'A'], [null, '\t! '], [1, 'B']] },
  { group: 'options', name: 'controls before skipped spaces', text: 'A\t! B', count: 5, options: { skipSpace: true, controlBeforeSpace: true, skipPunc: false }, segments: [[0, 'A'], [1, '\t'], [1, '!'], [2, ' '], [2, 'B']] },
  { group: 'options', name: 'space controls and skipped punctuation', text: 'A\t! B', count: 5, options: { skipSpace: true, controlBeforeSpace: true, skipPunc: true }, segments: [[0, 'A'], [1, '\t'], [null, '!'], [1, ' '], [1, 'B']] },
  { group: 'options', name: 'all consume colors', text: 'A\t! B', count: 5, options: { skipSpace: false, controlBeforeSpace: false, skipPunc: false }, segments: [[0, 'A'], [1, '\t'], [2, '!'], [3, ' '], [5, 'B']] },
  { group: 'options', name: 'space option does not double insert', text: 'A\t! B', count: 5, options: { skipSpace: false, controlBeforeSpace: true, skipPunc: false }, segments: [[0, 'A'], [1, '\t'], [2, '!'], [3, ' '], [5, 'B']] },
  { group: 'options', name: 'skip punctuation with consuming spaces', text: 'A\t! B', count: 5, options: { skipSpace: false, controlBeforeSpace: false, skipPunc: true }, segments: [[0, 'A'], [1, '\t'], [null, '!'], [2, ' '], [3, 'B']] },
  { group: 'options', name: 'both space options with skipped punctuation', text: 'A\t! B', count: 5, options: { skipSpace: false, controlBeforeSpace: true, skipPunc: true }, segments: [[0, 'A'], [1, '\t'], [null, '!'], [2, ' '], [3, 'B']] },
  { group: 'cycle', name: 'negative offset repeat two', text: 'ABCD', count: 4, options: { offset: -1, repeat: 2 }, segments: [[7, 'A'], [7, 'B'], [0, 'C'], [0, 'D']] },
  { group: 'cycle', name: 'wrapped offset repeat zero clamps one', text: 'ABC', count: 3, options: { offset: 7, repeat: 0 }, segments: [[1, 'A'], [2, 'B'], [3, 'C']] },
  { group: 'cycle', name: 'repeat upper clamp', text: 'ABCDEFGHIJKLMNOPQRSTU', count: 21, options: { repeat: 999 }, segments: [...Array.from('ABCDEFGHIJKLMNOPQRST', ch => [0, ch]), [1, 'U']] },
  { group: 'palette', name: 'enable green changes cycle', text: 'ABCDEFG', count: 7, palette: [[4, true]], segments: [[0, 'A'], [1, 'B'], [2, 'C'], [3, 'D'], [4, 'E'], [5, 'F'], [7, 'G']] },
  { group: 'palette', name: 'no colors preserves originals', text: '\t\x07<&"\'🇨🇳', count: 7, noColors: true, segments: [[null, '\t\x07<&"\'🇨🇳']] },
  { group: 'empty', name: 'empty with active colors', text: '', count: 0, segments: [] },
  { group: 'empty', name: 'empty with no colors', text: '', count: 0, noColors: true, segments: [] },
  { group: 'escaping', name: 'HTML escaping and literal command prefix', text: '&<>"\'', count: 5, options: { prefix: 'prefix "<&>" ' }, segments: [[0, '&'], [1, '<'], [2, '>'], [3, '"'], [5, "'"]] },
]

export function applyRainbowFixture(harness, fixture) {
  for (const [id, value] of Object.entries(fixture.options || {})) harness.setOption(id, value)
  for (const [index, enabled] of fixture.palette || []) harness.toggleColor(index, enabled)
  if (fixture.noColors) for (let index = 0; index < colors.length; index++) harness.toggleColor(index, false)
  harness.setText(fixture.text, fixture.event || 'input')
}

async function assertRainbowFixture(fixture, options) {
  const h = createRainbowHarness(options)
  applyRainbowFixture(h, fixture)
  const expectedRaw = fixture.segments.map(([index, text]) => (index === null ? '' : String.fromCharCode(colors[index][0])) + text).join('')
  const expectedDebug = fixture.segments.map(([index, text]) => (index === null ? '' : `[${hex([colors[index][0]])}]`) + text).join('')
  const expectedHTML = fixture.segments.map(([index, text]) => index === null ? escapeHTML(text) : `<span style="color:${colors[index][1]}">${escapeHTML(text)}</span>`).join('')
  const prefix = fixture.options?.prefix ?? 'bind h say '
  const expectedHex = hex(encoder.encode(expectedRaw))
  const expectedControls = fixture.segments.filter(([index]) => index !== null).length
  const snapshot = await collectRainbowSnapshot(h)
  assert.equal(snapshot.integrity, '文本完整性：通过 ✓', fixture.name)
  assert.deepEqual(snapshot.outputs, {
    raw: expectedRaw,
    rawCodepoints: Array.from(expectedRaw, cp => cp.codePointAt(0)),
    utf8: Array.from(encoder.encode(expectedRaw)),
    utf8Hex: expectedHex,
    previewHTML: fixture.noColors ? '' : expectedHTML || '（空）',
    previewText: fixture.noColors ? fixture.text : '',
    debug: expectedDebug || '（空）',
    commandDebug: prefix + expectedDebug,
    hexDebug: expectedHex || '（空）',
    counts: {
      chars: `可见字素：${fixture.count}`,
      codepoints: `Unicode码点：${Array.from(fixture.text).length}`,
      controls: `颜色控制符：${expectedControls}`,
      bytes: `生成后：${encoder.encode(expectedRaw).length} 字节`,
    },
    copyPayloads: [prefix + expectedRaw, expectedRaw, prefix + '\x07红色测试', expectedHex],
  }, fixture.name)
  assert.equal(h.execs.length, 0)
}

const rainbowGroup = (group, options) => Promise.all(rainbowCompatibilityFixtures.filter(fixture => fixture.group === group).map(fixture => assertRainbowFixture(fixture, options)))

export const staticHtmlFeedbackCases = [
  { name: 'Rainbow preserves leading, trailing and consecutive original TABs through input/change', run: options => rainbowGroup('tabs', options) },
  { name: 'Rainbow preserves all nine original palette code characters', run: options => rainbowGroup('controls', options) },
  { name: 'Rainbow preserves LF, CR, CRLF and Unicode whitespace', run: options => rainbowGroup('whitespace', options) },
  { name: 'Rainbow preserves combining, ZWJ and flag clusters with UTF16 insertion offsets', run: options => rainbowGroup('unicode', options) },
  { name: 'Rainbow preserves all eight space/punctuation option combinations', run: options => rainbowGroup('options', options) },
  { name: 'Rainbow preserves offset wrapping and repeat bounds', run: options => rainbowGroup('cycle', options) },
  { name: 'Rainbow preserves changed and disabled palettes', run: options => rainbowGroup('palette', options) },
  { name: 'Rainbow preserves both empty-input paths', run: options => rainbowGroup('empty', options) },
  { name: 'Rainbow escapes preview markup and preserves all four copy payloads', run: options => rainbowGroup('escaping', options) },
  {
    name: 'Rainbow fallback keeps its existing segmentation limits while preserving original text',
    async run(options) {
      const h = createRainbowHarness({ ...options, fallbackIntl: true })
      assert.deepEqual(h.graphemes('e\u0301✈️'), ['e\u0301', '✈️'])
      assert.deepEqual(h.graphemes('👩🏽‍💻🇨🇳'), ['👩', '🏽', '‍', '💻', '🇨', '🇳'])
      h.setText('e\u0301\t👩🏽‍💻🇨🇳')
      assert.equal(h.raw(), '\x07e\u0301\t\x10👩\x09🏽\x06‍\x0b💻\x0e🇨\x07🇳')
      assert.equal(h.el('integrity').textContent, '文本完整性：通过 ✓')
      assert.equal(h.el('chars').textContent, '可见字素：8')
    },
  },
  {
    name: 'Rainbow reconstruction removes only recorded UTF16 positions and preserves matching originals',
    run(options) {
      const h = createRainbowHarness(options)
      const raw = '\x07👩🏽‍💻\t\x10e\u0301\x07'
      assert.equal(h.rebuild(raw, [{ offset: 0, value: '\x07' }, { offset: 9, value: '\x10' }]), '👩🏽‍💻\te\u0301\x07')
      assert.equal(h.rebuild('\x07\t\x0b\x0c', []), '\x07\t\x0b\x0c')
      assert.equal(h.rebuild('', []), '')
      assert.equal(h.rebuild('\x07A\x07', [{ offset: 0, value: '\x07' }]), 'A\x07')
    },
  },
  {
    name: 'Rainbow reconstruction rejects invalid, duplicate, unordered and mismatched records',
    run(options) {
      const h = createRainbowHarness(options)
      const raw = '\x07A\t\x10B'
      const records = [
        [{ offset: -1, value: '\x07' }], [{ offset: 0.5, value: '\x07' }],
        [{ offset: '0', value: '\x07' }], [{ offset: NaN, value: '\x07' }],
        [{ offset: Infinity, value: '\x07' }], [{ offset: 5, value: '\x07' }],
        [{ offset: 999, value: '\x07' }], [{ offset: 1, value: '\x07' }],
        [{ offset: 0, value: '\x10' }], [{ offset: 0, value: '' }],
        [{ offset: 0, value: '\x07A' }], [{ offset: 0, value: 7 }],
        [{ offset: 0, value: '\x07' }, { offset: 0, value: '\x07' }],
        [{ offset: 3, value: '\x10' }, { offset: 0, value: '\x07' }],
      ]
      for (const generatedControls of records) assert.equal(h.rebuild(raw, generatedControls), null)
    },
  },
  {
    name: 'Rainbow reconstruction does not hide missing or modified original characters',
    run(options) {
      const h = createRainbowHarness(options)
      const records = [{ offset: 0, value: '\x07' }, { offset: 3, value: '\x10' }]
      assert.equal(h.rebuild('\x07A\t\x10B', records), 'A\tB')
      assert.equal(h.rebuild('\x07Z\t\x10B', records), 'Z\tB')
      assert.notEqual(h.rebuild('\x07Z\t\x10B', records), 'A\tB')
      assert.equal(h.rebuild('\x07A\t\x10', records), 'A\t')
      assert.notEqual(h.rebuild('\x07A\t\x10', records), 'A\tB')
      assert.equal(h.rebuild('\x07\t\x10B', records), null)
      assert.equal(h.rebuild('\x07A\t\x10B', [{ offset: 0, value: '\x07' }]), 'A\t\x10B')
      assert.notEqual(h.rebuild('\x07A\t\x10B', [{ offset: 0, value: '\x07' }]), 'A\tB')
    },
  },
  {
    name: 'Rainbow pending copy captures text once and existing toast timer resets synthetically',
    async run(options) {
      const h = createRainbowHarness({ ...options, clipboardMode: 'pending' })
      h.setText('A\tB')
      h.click('copyCommand')
      assert.deepEqual(h.writes, ['bind h say \x07A\t\x10B'])
      assert.equal(h.el('toast').textContent, '')
      assert.equal(h.timers.size, 0)
      h.setText('changed')
      h.pending[0].resolve()
      await settle()
      assert.equal(h.writes.length, 1)
      assert.equal(h.el('toast').textContent, '已复制完整彩虹命令')
      assert.equal(h.el('toast').classList.contains('show'), true)
      assert.deepEqual([...h.timers.values()].map(timer => timer.ms), [1800])
      h.runTimers()
      assert.equal(h.el('toast').classList.contains('show'), false)
    },
  },
  {
    name: 'Rainbow synthetic clipboard failure paths preserve text and remove temporary textareas',
    async run(options) {
      for (const [clipboardMode, execResult] of [['rejected', true], ['rejected', false], ['absent', true], ['throw', true]]) {
        const h = createRainbowHarness({ ...options, clipboardMode, execResult })
        h.setText('A\tB')
        h.click('copyText')
        await settle()
        assert.equal(h.writes.length, clipboardMode === 'absent' ? 0 : 1)
        assert.deepEqual(h.execs, ['copy'])
        assert.equal(h.created.length, 1)
        assert.equal(h.created[0].value, '\x07A\t\x10B')
        assert.equal(h.created[0].focused, true)
        assert.equal(h.created[0].selected, true)
        assert.equal(h.created[0].removed, true)
        assert.equal(h.appended[0], h.created[0])
        assert.equal(h.el('toast').textContent, execResult ? '已复制彩虹控制字符文本' : '复制失败，请使用 Chrome/Edge 并允许剪贴板权限')
      }
    },
  },
  {
    name: 'ADCP six local tabs render inert text without clipboard writes or timers',
    run(options) {
      const h = createAdcpHarness(options)
      const keys = ['start', 'module', 'model', 'lifecycle', 'workspace', 'upgrade']
      const snippets = h.snippets()
      assert.deepEqual(h.tabs.map(tab => tab.dataset.tab), keys)
      assert.deepEqual(Object.keys(snippets), keys)
      assert.equal(h.term.innerHTML, snippets.start)
      for (const key of keys) {
        h.clickTab(key)
        assert.equal(h.term.innerHTML, snippets[key])
        assert.deepEqual(h.tabs.filter(tab => tab.classList.contains('active')).map(tab => tab.dataset.tab), [key])
      }
      h.clickTab('module')
      assert.ok(h.term.innerText.includes('agent module explain . <module>'))
      assert.equal(h.term.innerText.includes('<span'), false)
      assert.equal(h.writes.length, 0)
      assert.equal(h.timers.size, 0)
    },
  },
  {
    name: 'ADCP pending success uses captured button after event dispatch and captures text before tab switch',
    async run(options) {
      const h = createAdcpHarness({ ...options, clipboardMode: 'pending' })
      h.clickTab('module')
      const capturedText = h.term.innerText
      const operation = h.clickCopy()
      assert.equal(h.copy.lastEvent.currentTarget, null)
      assert.equal(h.copy.textContent, 'COPY')
      assert.deepEqual(h.writes, [capturedText])
      assert.equal(h.timers.size, 0)
      h.clickTab('upgrade')
      assert.notEqual(h.term.innerText, capturedText)
      h.pending[0].resolve()
      await operation
      assert.equal(h.copy.textContent, 'COPIED')
      assert.deepEqual(h.writes, [capturedText])
      assert.deepEqual([...h.timers.values()].map(timer => timer.ms), [1200])
      h.runTimers()
      assert.equal(h.copy.textContent, 'COPY')
      assert.equal(h.timers.size, 0)
    },
  },
  {
    name: 'ADCP pending rejection gives SELECT after event currentTarget is cleared',
    async run(options) {
      const h = createAdcpHarness({ ...options, clipboardMode: 'pending' })
      const operation = h.clickCopy()
      assert.equal(h.copy.lastEvent.currentTarget, null)
      assert.equal(h.copy.textContent, 'COPY')
      assert.equal(h.writes.length, 1)
      assert.equal(h.timers.size, 0)
      h.pending[0].reject(new Error('synthetic delayed rejection'))
      await operation
      assert.equal(h.copy.textContent, 'SELECT')
      assert.equal(h.writes.length, 1)
      assert.equal(h.timers.size, 0)
    },
  },
  {
    name: 'ADCP already-settled clipboard promises still resume after dispatch',
    async run(options) {
      for (const clipboardMode of ['resolved', 'rejected']) {
        const h = createAdcpHarness({ ...options, clipboardMode })
        const capturedText = h.term.innerText
        const operation = h.clickCopy()
        assert.equal(h.copy.lastEvent.currentTarget, null)
        assert.equal(h.copy.textContent, 'COPY')
        await operation
        assert.deepEqual(h.writes, [capturedText])
        assert.equal(h.copy.textContent, clipboardMode === 'resolved' ? 'COPIED' : 'SELECT')
        assert.equal(h.timers.size, clipboardMode === 'resolved' ? 1 : 0)
        if (clipboardMode === 'resolved') {
          h.runTimers()
          assert.equal(h.copy.textContent, 'COPY')
        }
      }
    },
  },
  {
    name: 'ADCP missing API and synchronous clipboard throw preserve SELECT behavior',
    async run(options) {
      for (const clipboardMode of ['absent', 'throw']) {
        const h = createAdcpHarness({ ...options, clipboardMode })
        const operation = h.clickCopy()
        assert.equal(h.copy.lastEvent.currentTarget, null)
        assert.equal(h.copy.textContent, 'SELECT')
        await operation
        assert.equal(h.copy.textContent, 'SELECT')
        assert.equal(h.writes.length, clipboardMode === 'absent' ? 0 : 1)
        assert.equal(h.timers.size, 0)
      }
    },
  },
  {
    name: 'ADCP repeated pending successes retain per-click text and independent reset timers',
    async run(options) {
      const h = createAdcpHarness({ ...options, clipboardMode: 'pending' })
      const firstText = h.term.innerText
      const first = h.clickCopy()
      h.clickTab('workspace')
      const secondText = h.term.innerText
      const second = h.clickCopy()
      assert.deepEqual(h.writes, [firstText, secondText])
      assert.equal(h.pending.length, 2)
      assert.equal(h.copy.lastEvent.currentTarget, null)
      assert.equal(h.timers.size, 0)
      h.pending[1].resolve()
      await second
      assert.equal(h.copy.textContent, 'COPIED')
      h.pending[0].resolve()
      await first
      assert.equal(h.copy.textContent, 'COPIED')
      assert.deepEqual([...h.timers.values()].map(timer => timer.ms), [1200, 1200])
      h.runTimer()
      assert.equal(h.copy.textContent, 'COPY')
      assert.equal(h.timers.size, 1)
      h.runTimers()
      assert.equal(h.copy.textContent, 'COPY')
      assert.deepEqual(h.writes, [firstText, secondText])
    },
  },
  {
    name: 'ADCP repeated mixed outcomes retain existing success-timer ordering without extra writes',
    async run(options) {
      const h = createAdcpHarness({ ...options, clipboardMode: 'pending' })
      const first = h.clickCopy()
      const second = h.clickCopy()
      assert.equal(h.writes.length, 2)
      h.pending[0].resolve()
      await first
      assert.equal(h.copy.textContent, 'COPIED')
      assert.equal(h.timers.size, 1)
      h.pending[1].reject(new Error('synthetic second-write rejection'))
      await second
      assert.equal(h.copy.textContent, 'SELECT')
      assert.equal(h.timers.size, 1)
      // This existing race is characterized, not redesigned by the target fix.
      h.runTimers()
      assert.equal(h.copy.textContent, 'COPY')
      assert.equal(h.writes.length, 2)
    },
  },
]
