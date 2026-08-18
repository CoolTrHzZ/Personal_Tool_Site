import type { ComponentType, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export type ToolShellProps = { title?: string; description?: string; version?: string; category?: string; children: ReactNode }
export type ToolStatus = 'active' | 'beta' | 'disabled'

// ---- Universal Import Model：runtime / format / display / permissions ----
/** 宿主如何执行工具：react = 站内组件；static = 本站静态包（iframe）；iframe = 外部 URL */
export type ToolRuntime = 'react' | 'static' | 'iframe'
/** 工具包形态：HTML / HTML Bundle / React/Vue/Svelte build / WASM 全部归一为 Static Tool */
export type ToolFormat = 'react-package' | 'single-html' | 'html-bundle' | 'webapp-build' | 'wasm' | 'external-url'
export type DisplayMode = 'embedded' | 'workspace' | 'fullscreen'
export type ToolDisplay = { mode: DisplayMode; height: 'auto' | number }
export type ToolPermissions = {
  clipboard: boolean
  storage: boolean
  network: boolean
  notifications: boolean
  modals: boolean
  download: boolean
  externalLinks: boolean
  sameOrigin: boolean
  popups: boolean
}

export type ToolManifest = {
  id: string
  name: string
  description: string
  /** legacy 字段，与 runtime 双向兼容：react→react；html→static；iframe→iframe */
  type: 'react' | 'html' | 'iframe'
  entry: string
  category: string
  version: string
  enabled: boolean
  icon: string
  keywords: string[]
  favorite?: boolean
  order: number
  author?: string
  updated?: string
  tags?: string[]
  status?: ToolStatus
  readme?: string
  license?: string
  runtime?: ToolRuntime
  format?: ToolFormat
  display?: Partial<ToolDisplay>
  permissions?: Partial<ToolPermissions>
}

/** 迁移补全后的 manifest（runtime/format/display/permissions 一定存在） */
export type ResolvedTool = ToolManifest & {
  runtime: ToolRuntime
  format: ToolFormat
  display: ToolDisplay
  permissions: ToolPermissions
}

export type ToolDefinition = ResolvedTool & {
  path: string
  iconComponent?: LucideIcon
  component?: ComponentType
}
