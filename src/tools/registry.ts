import { lazy } from 'react'
import { Code2, Globe2, Palette, Wrench } from 'lucide-react'
import type { ToolDefinition } from './types'

export const tools: ToolDefinition[] = [
  { id: 'cs2-color-text', name: 'CS2 彩色字体', description: '生成社区服务器彩色文本', category: 'development', keywords: ['cs2', '颜色', '字体', '聊天'], path: '/tools/cs2-color-text', icon: Palette, component: lazy(() => import('./cs2-color')), enabled: true, order: 10 },
  { id: 'json', name: 'JSON 格式化', description: '格式化与校验 JSON', category: 'development', keywords: ['json', '格式化', '校验'], path: '/tools/json', icon: Code2, component: lazy(() => import('./json')), enabled: true, order: 20 },
  { id: 'timestamp', name: '时间戳转换', description: 'Unix 时间戳互转', category: 'development', keywords: ['时间戳', 'unix', 'date'], path: '/tools/timestamp', icon: Wrench, component: lazy(() => import('./timestamp')), enabled: true, order: 30 },
  { id: 'base64', name: 'Base64', description: '文本 Base64 编解码', category: 'development', keywords: ['base64', '编码', '解码'], path: '/tools/base64', icon: Code2, component: lazy(() => import('./base64')), enabled: true, order: 40 },
  { id: 'url', name: 'URL 编解码', description: '处理 URL 编码内容', category: 'development', keywords: ['url', 'encode', 'decode'], path: '/tools/url', icon: Globe2, component: lazy(() => import('./url')), enabled: true, order: 50 },
]
