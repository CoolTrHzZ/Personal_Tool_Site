import type { DisplayMode, ResolvedTool, ToolDisplay, ToolManifest, ToolPermissions, ToolRuntime } from '../types'

const RUNTIMES: ToolRuntime[] = ['react', 'static', 'iframe']
const FORMATS: ResolvedTool['format'][] = ['react-package', 'single-html', 'html-bundle', 'webapp-build', 'wasm', 'external-url']
const MODES: DisplayMode[] = ['embedded', 'workspace', 'fullscreen']

export const DEFAULT_PERMISSIONS: ToolPermissions = {
  clipboard: true,
  storage: true,
  network: false,
  notifications: false,
  modals: false,
  download: false,
  externalLinks: false,
  sameOrigin: false,
  popups: false,
}

export const DEFAULT_DISPLAY: ToolDisplay = { mode: 'embedded', height: 'auto' }

/** 旧 schema（type: react/html/iframe）→ v2（runtime/format/display/permissions），与 scripts/tool-manifest.mjs 保持一致 */
export function migrateManifest(manifest: ToolManifest): ResolvedTool {
  const runtime = RUNTIMES.includes(manifest.runtime as ToolRuntime)
    ? manifest.runtime as ToolRuntime
    : manifest.type === 'react' ? 'react' : manifest.type === 'iframe' ? 'iframe' : 'static'
  const format = FORMATS.includes(manifest.format as ResolvedTool['format'])
    ? manifest.format as ResolvedTool['format']
    : runtime === 'react' ? 'react-package' : runtime === 'iframe' ? 'external-url' : 'html-bundle'
  const mode = MODES.includes(manifest.display?.mode as DisplayMode) ? manifest.display!.mode as DisplayMode : DEFAULT_DISPLAY.mode
  const rawHeight = manifest.display?.height
  const height = rawHeight === 'auto' || rawHeight === undefined || rawHeight === null
    ? 'auto'
    : Number.isFinite(Number(rawHeight)) && Number(rawHeight) > 0 ? Math.min(5000, Math.round(Number(rawHeight))) : 'auto'
  return {
    ...manifest,
    runtime,
    format,
    display: { mode, height },
    permissions: { ...DEFAULT_PERMISSIONS, ...manifest.permissions },
  }
}

/** 由 permissions 构造 iframe sandbox（与 admin 预览共用规则） */
export function buildSandbox(permissions: ToolPermissions): string {
  const flags = ['allow-scripts']
  if (permissions.modals) flags.push('allow-modals')
  if (permissions.download) flags.push('allow-downloads')
  if (permissions.externalLinks || permissions.popups) flags.push('allow-popups', 'allow-popups-to-escape-sandbox')
  if (permissions.sameOrigin) flags.push('allow-same-origin')
  flags.push('allow-forms')
  return flags.join(' ')
}
