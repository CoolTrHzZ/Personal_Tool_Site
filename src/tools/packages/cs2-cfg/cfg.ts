import { hasUnsupportedCfgControl } from '../../../../shared/cfg-text.js'

export type CfgCommand = { line: number; name: string; args: string[]; raw: string }
export type CfgDiagnostic = { line: number; level: 'error' | 'warning' | 'info'; message: string }
export type CfgBinding = { key: string; command: string; line: number }
export type CfgAlias = { name: string; command: string; line: number }
export type CfgSetting = { name: string; value: string; line: number }

// VT/FF are community-server color codes, not CFG whitespace.
const trimCfgWhitespace = (text: string) => text.replace(/^[ \t]+|[ \t]+$/g, '')

// Static inspection only: no alias execution, exec loading, or game-version validation.
// Separator behavior follows Valve's Source SDK commandbuffer.cpp; Source 2 may differ.
function parse(text: string) {
  const commands: CfgCommand[] = []
  const diagnostics: CfgDiagnostic[] = []
  const invalid = new Set<CfgCommand>()
  text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/).forEach((source, index) => {
    const line = index + 1
    let start = 0
    let quoted = false
    function append(end: number) {
      const raw = trimCfgWhitespace(source.slice(start, end))
      if (!raw) return
      if (quoted) diagnostics.push({ line, level: 'error', message: '双引号未闭合；此条命令未计入静态汇总。' })
      // Quotes delimit tokens; backslashes do not escape quotes in this CFG grammar.
      const tokens = [...raw.matchAll(/"([^"]*)"|([^ \t"]+)/g)].map(match => match[1] ?? match[2])
      if (!tokens.length) return
      const command = { line, name: tokens[0], args: tokens.slice(1), raw }
      commands.push(command)
      if (quoted) invalid.add(command)
      if (hasUnsupportedCfgControl(raw)) {
        diagnostics.push({ line, level: 'error', message: '命令包含不支持的控制字符；此条命令未计入静态汇总。' })
        invalid.add(command)
      }
    }
    for (let index = 0; index < source.length; index++) {
      const character = source[index]
      if (character === '"') quoted = !quoted
      if (!quoted && character === '/' && source[index + 1] === '/') {
        append(index)
        return
      }
      if (!quoted && character === ';') {
        append(index)
        start = index + 1
      }
    }
    append(source.length)
  })
  return { commands, diagnostics, invalid }
}

// Deliberately limited to familiar cvars, never infer that arbitrary commands are settings.
const settingsNames = new Set([
  'sensitivity', 'volume', 'm_yaw', 'm_pitch', 'zoom_sensitivity_ratio', 'fps_max', 'fps_max_ui',
  'cl_crosshairstyle', 'cl_crosshairsize', 'cl_crosshairthickness', 'cl_crosshairgap',
  'cl_crosshairdot', 'cl_crosshaircolor', 'cl_crosshaircolor_r', 'cl_crosshaircolor_g',
  'cl_crosshaircolor_b', 'cl_crosshairalpha', 'cl_crosshairusealpha', 'cl_crosshair_t',
  'cl_crosshair_drawoutline', 'cl_crosshair_outlinethickness', 'cl_crosshairgap_useweaponvalue',
  'cl_crosshair_recoil', 'cl_crosshair_sniper_width', 'viewmodel_fov', 'viewmodel_offset_x',
  'viewmodel_offset_y', 'viewmodel_offset_z', 'viewmodel_presetpos', 'cl_radar_scale',
  'cl_radar_always_centered', 'cl_radar_rotate', 'cl_hud_radar_scale', 'hud_scaling',
])

export function analyzeCfg(text: string): {
  commands: CfgCommand[]; diagnostics: CfgDiagnostic[]; bindings: CfgBinding[];
  aliases: CfgAlias[]; settings: CfgSetting[];
} {
  const { commands, diagnostics, invalid } = parse(text)
  const bindings = new Map<string, CfgBinding>()
  const aliases = new Map<string, CfgAlias>()
  const settings = new Map<string, CfgSetting>()
  for (const command of commands) {
    if (invalid.has(command)) continue
    const { line, args } = command
    const name = command.name.toLowerCase()
    if (name === 'bind' && args.length >= 2) {
      const key = args[0].toUpperCase()
      if (!key || /[ \t]/.test(key)) {
        diagnostics.push({ line, level: 'error', message: 'bind 的按键名称为空或包含空白。' })
        continue
      }
      const previous = bindings.get(key)
      if (previous) diagnostics.push({ line, level: 'warning', message: `按键 ${key} 覆盖了第 ${previous.line} 行的绑定。` })
      const value = args.slice(1).join(' ')
      if (value) bindings.set(key, { key, command: value, line })
      else bindings.delete(key)
    } else if (name === 'unbind' && args.length === 1) {
      bindings.delete(args[0].toUpperCase())
    } else if (name === 'unbindall' && args.length === 0) {
      bindings.clear()
      diagnostics.push({ line, level: 'warning', message: 'unbindall 会清除所有按键绑定；请确认后续配置包含需要的按键。' })
    } else if (name === 'alias' && args.length >= 1) {
      const aliasName = args[0].toLowerCase()
      if (!aliasName || /[ \t]/.test(aliasName)) {
        diagnostics.push({ line, level: 'error', message: 'alias 名称为空或包含空白。' })
        continue
      }
      const previous = aliases.get(aliasName)
      if (previous) diagnostics.push({ line, level: 'warning', message: `alias ${args[0]} 覆盖了第 ${previous.line} 行的定义。` })
      aliases.set(aliasName, { name: args[0], command: args.slice(1).join(' '), line })
    } else if (name === 'exec' || name === 'execifexists') {
      diagnostics.push({ line, level: args.length ? 'info' : 'error', message: args.length
        ? `依赖外部 CFG：${args.join(' ')}。未加载或执行该文件，其修改不包含在汇总中。`
        : `${name} 缺少 CFG 文件名。` })
    } else if (settingsNames.has(name) && args.length > 0) {
      const previous = settings.get(name)
      if (previous) diagnostics.push({ line, level: 'warning', message: `${name} 覆盖了第 ${previous.line} 行的设置。` })
      settings.set(name, { name, value: args.join(' '), line })
    }
  }

  // Inspect literal alias calls only. Dynamic redefinitions and game execution are out of scope.
  const edges = new Map([...aliases].map(([name, alias]) => [name,
    parse(alias.command).commands.map(command => command.name.toLowerCase()).filter(name => aliases.has(name)),
  ]))
  const state = new Map<string, 'active' | 'done'>()
  for (const name of aliases.keys()) {
    if (state.has(name)) continue
    const stack = [{ name, next: 0 }]
    state.set(name, 'active')
    while (stack.length) {
      const node = stack[stack.length - 1]
      const targets = edges.get(node.name) ?? []
      if (node.next >= targets.length) {
        state.set(node.name, 'done')
        stack.pop()
        continue
      }
      const target = targets[node.next++]
      if (state.get(target) === 'active') {
        const cycle = [...stack.slice(stack.findIndex(node => node.name === target)).map(node => node.name), target]
        diagnostics.push({ line: aliases.get(node.name)!.line, level: 'warning', message: `alias 可能循环调用：${cycle.join(' → ')}。请在游戏中确认；本工具不会执行。` })
      } else if (!state.has(target)) {
        state.set(target, 'active')
        stack.push({ name: target, next: 0 })
      }
    }
  }
  diagnostics.sort((a, b) => a.line - b.line)
  return { commands, diagnostics, bindings: [...bindings.values()], aliases: [...aliases.values()], settings: [...settings.values()] }
}

/** Append a final binding; retain the original source, comments and newline convention. */
export function upsertBinding(text: string, key: string, command: string): string {
  if (/[\r\n\u2028\u2029]/.test(key)) throw new Error('按键名称不能包含换行。')
  key = trimCfgWhitespace(key)
  if (!/^[A-Za-z0-9_]+$/.test(key) && !(key.length === 1 && "-=[],'./`+".includes(key))) {
    throw new Error('按键请使用字母、数字、下划线或常见单字符标点；分号键请填写 SEMICOLON。')
  }
  command = trimCfgWhitespace(command)
  if (!command || /["\r\n\u2028\u2029]/.test(command) || hasUnsupportedCfgControl(command)) {
    throw new Error('绑定命令不能为空，且不能包含双引号、换行或不支持的控制字符；支持社区服颜色控制码，多条命令可以用分号连接。')
  }
  const newline = text.includes('\r\n') ? '\r\n' : text.includes('\r') && !text.includes('\n') ? '\r' : '\n'
  return `${text}${text && !/[\r\n]$/.test(text) ? newline : ''}bind "${key}" "${command}"${newline}`
}
