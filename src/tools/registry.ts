import { lazy } from 'react'
import { Code2, Globe2, Palette, Wrench } from 'lucide-react'
import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { ToolManifest } from './types'

/** 站内 React 工具注册表（v2 字段由 loader 的 migrateManifest 统一补全） */
export type ReactToolEntry = ToolManifest & {
  path: string
  iconComponent: LucideIcon
  component: ComponentType
}

export const reactTools: ReactToolEntry[] = [
  { id: 'cs2-color-text', name: 'CS2 彩色字体', description: '生成社区服务器彩色文本', type: 'react', entry: 'react', category: 'game', version: '1.0.0', enabled: true, icon: 'Palette', keywords: ['cs2', '颜色', '字体', '聊天'], favorite: true, order: 10, path: '/tools/cs2-color-text', iconComponent: Palette, component: lazy(() => import('./packages/cs2-color')) },
  { id: 'json', name: 'JSON 格式化', description: '格式化与校验 JSON', type: 'react', entry: 'react', category: 'development', version: '1.0.0', enabled: true, icon: 'Code2', keywords: ['json', '格式化', '校验'], favorite: true, order: 20, path: '/tools/json', iconComponent: Code2, component: lazy(() => import('./packages/json')) },
  { id: 'timestamp', name: '时间戳转换', description: 'Unix 时间戳互转', type: 'react', entry: 'react', category: 'development', version: '1.0.0', enabled: true, icon: 'Wrench', keywords: ['时间戳', 'unix', 'date'], favorite: true, order: 30, path: '/tools/timestamp', iconComponent: Wrench, component: lazy(() => import('./packages/timestamp')) },
  { id: 'base64', name: 'Base64', description: '文本 Base64 编解码', type: 'react', entry: 'react', category: 'development', version: '1.0.0', enabled: true, icon: 'Code2', keywords: ['base64', '编码', '解码'], favorite: true, order: 40, path: '/tools/base64', iconComponent: Code2, component: lazy(() => import('./packages/base64')) },
  { id: 'url', name: 'URL 编解码', description: '处理 URL 编码内容', type: 'react', entry: 'react', category: 'development', version: '1.0.0', enabled: true, icon: 'Globe2', keywords: ['url', 'encode', 'decode'], order: 50, path: '/tools/url', iconComponent: Globe2, component: lazy(() => import('./packages/url')) },
]

export const tools = reactTools
