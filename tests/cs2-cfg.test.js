import { describe, expect, it } from 'vitest'
import { analyzeCfg, upsertBinding } from '../src/tools/packages/cs2-cfg/cfg.ts'

describe('CFG static inspection', () => {
  it('retains Unicode, quoted semicolons and comments, BOM, CRLF and original line numbers', () => {
    const result = analyzeCfg('\uFEFF// 我的配置\r\n\r\nbind "F4" "say 你好; echo https://example.com"; volume 0.4 // 注释; bind x bad\r\necho "// ; 保留"')
    expect(result.commands).toEqual([
      { line: 3, name: 'bind', args: ['F4', 'say 你好; echo https://example.com'], raw: 'bind "F4" "say 你好; echo https://example.com"' },
      { line: 3, name: 'volume', args: ['0.4'], raw: 'volume 0.4' },
      { line: 4, name: 'echo', args: ['// ; 保留'], raw: 'echo "// ; 保留"' },
    ])
    expect(result.bindings).toEqual([{ key: 'F4', command: 'say 你好; echo https://example.com', line: 3 }])
    expect(result.diagnostics).toEqual([])
  })

  it('reports an unclosed quote without consuming following lines or treating it as effective', () => {
    const result = analyzeCfg('bind x "broken; volume 0\nvolume 0.5\nbind y "+use"')
    expect(result.diagnostics).toEqual([{ line: 1, level: 'error', message: expect.stringContaining('双引号未闭合') }])
    expect(result.settings).toEqual([{ name: 'volume', value: '0.5', line: 2 }])
    expect(result.bindings).toEqual([{ key: 'Y', command: '+use', line: 3 }])
  })

  it('applies duplicate binds, queries, unbind and unbindall in source order', () => {
    const result = analyzeCfg('bind x +use\nbind X +jump\nbind x\nunbind x\nbind y +attack\nunbindall\nbind z +duck\nbind k +use\nbind k ""')
    expect(result.bindings).toEqual([{ key: 'Z', command: '+duck', line: 7 }])
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      { line: 2, level: 'warning', message: expect.stringContaining('第 1 行') },
      { line: 6, level: 'warning', message: expect.stringContaining('unbindall') },
    ]))
    expect(result.diagnostics.some(item => item.line === 3)).toBe(false)
  })

  it('checks literal alias cycles and overwrites while preserving unknown commands', () => {
    const result = analyzeCfg('alias loop "loop"\nalias a "echo hi; b"\nalias b "a"\nalias replace "replace"\nalias replace "echo ok"\nunknown_community_command 1\nexec "other cfg"')
    expect(result.aliases.find(alias => alias.name === 'replace').command).toBe('echo ok')
    expect(result.commands.some(command => command.name === 'unknown_community_command')).toBe(true)
    expect(result.diagnostics.filter(item => item.message.includes('循环调用'))).toHaveLength(2)
    expect(result.diagnostics.some(item => item.message.includes('a → b → a'))).toBe(true)
    expect(result.diagnostics.some(item => item.line === 6)).toBe(false)
    expect(result.diagnostics).toContainEqual({ line: 7, level: 'info', message: expect.stringContaining('other cfg') })
  })

  it('does not call queries, echo, log or arbitrary commands cvar writes', () => {
    const result = analyzeCfg('sensitivity 1.2\nsensitivity\necho first\necho second\nlog on\nlog off\nvolume 0.2\nvolume 0.4\ncl_crosshairsize 3')
    expect(result.settings).toEqual([
      { name: 'sensitivity', value: '1.2', line: 1 },
      { name: 'volume', value: '0.4', line: 8 },
      { name: 'cl_crosshairsize', value: '3', line: 9 },
    ])
    expect(result.diagnostics).toEqual([{ line: 8, level: 'warning', message: expect.stringContaining('第 7 行') }])
    expect(analyzeCfg(' \n// empty\n;')).toEqual({ commands: [], diagnostics: [], bindings: [], aliases: [], settings: [] })
  })

  it('handles a long alias graph without recursive JavaScript stack growth', () => {
    const source = Array.from({ length: 6000 }, (_, index) => `alias a${index} "a${index + 1}"`).join('\n')
    expect(analyzeCfg(source).aliases).toHaveLength(6000)
  })

  it('preserves community colors in quoted and unquoted binds and aliases, including trailing VT/FF', () => {
    const colors = Array.from({ length: 16 }, (_, index) => String.fromCharCode(index + 1))
      .filter(character => !['\t', '\n', '\r'].includes(character)).join('')
    const quoted = `say ${colors}彩色字体\u000B`
    const unquoted = 'say \u0006绿色\u0007红色\u000B蓝色\u000E紫色\u0010橙色\u000C'
    const source = `bind "F4" "${quoted}"\r\n\tbind F5 ${unquoted}\t \r\nalias colors ${unquoted}\r\nalias "quoted" "${quoted}"`
    const result = analyzeCfg(source)
    expect(result.commands[0].args).toEqual(['F4', quoted])
    expect(result.commands[1]).toEqual({ line: 2, name: 'bind', args: ['F5', 'say', unquoted.slice(4)], raw: `bind F5 ${unquoted}` })
    expect(result.bindings).toEqual([
      { key: 'F4', command: quoted, line: 1 },
      { key: 'F5', command: unquoted, line: 2 },
    ])
    expect(result.aliases).toEqual([
      { name: 'colors', command: unquoted, line: 3 },
      { name: 'quoted', command: quoted, line: 4 },
    ])
    expect(result.diagnostics).toEqual([])
  })

  it('preserves appended color bytes and rejects unsupported controls and command injection', () => {
    const source = '\uFEFF// preserve\r\nbind F4 say \u0006原文\u000B'
    for (const ending of ['\u000B', '\u000C']) {
      const command = `say\t\u0007彩色${ending}`
      const output = upsertBinding(source, ' F5\t', `\t${command}  `)
      expect(output).toBe(`${source}\r\nbind "F5" "${command}"\r\n`)
      expect(analyzeCfg(output).bindings[1].command).toBe(command)
    }
    for (const code of [0, ...Array.from({ length: 15 }, (_, index) => index + 17), ...Array.from({ length: 33 }, (_, index) => index + 127)]) {
      const command = `say bad${String.fromCharCode(code)}`
      const result = analyzeCfg(`bind F4 "${command}"`)
      expect(result.bindings).toEqual([])
      expect(result.diagnostics).toContainEqual({ line: 1, level: 'error', message: expect.stringContaining('不支持的控制字符') })
      expect(() => upsertBinding('', 'F4', command)).toThrow()
    }
    for (const command of ['say "quoted"', 'say\nnext', 'say\rnext', 'say\u2028next', 'say\u2029next']) {
      expect(() => upsertBinding('', 'F4', command)).toThrow()
    }
    expect(() => upsertBinding('', '\u000BF4', '+use')).toThrow()
  })

  it('appends a safe binding without rewriting original text or CRLF and rejects injection', () => {
    const source = '// preserve\r\nbind f +use // preserve too'
    const result = upsertBinding(source, 'f', 'say 你好; +jump')
    expect(result).toBe(`${source}\r\nbind "f" "say 你好; +jump"\r\n`)
    expect(analyzeCfg(result).bindings).toEqual([{ key: 'F', command: 'say 你好; +jump', line: 3 }])
    expect(upsertBinding('', '=', '+use')).toBe('bind "=" "+use"\n')
    for (const key of ['', 'x"', 'x;quit', 'x\nquit', 'x y']) expect(() => upsertBinding('', key, '+use')).toThrow()
    for (const command of ['', '  ', 'say "oops"', 'quit\nbind x +use', 'say\u0000bad', 'say\u2028bad']) expect(() => upsertBinding('', 'x', command)).toThrow()
  })
})
