import { lazy } from 'react'
import { Code2, Globe2, Palette, Wrench } from 'lucide-react'
import type { ToolDefinition } from './tool-types'

const Cs2ColorText = lazy(() => import('./tool-pages').then(module => ({ default: module.Cs2ColorText })))
const JsonTool = lazy(() => import('./tool-pages').then(module => ({ default: module.JsonTool })))
const TimestampTool = lazy(() => import('./tool-pages').then(module => ({ default: module.TimestampTool })))
const Base64Tool = lazy(() => import('./tool-pages').then(module => ({ default: module.Base64Tool })))
const UrlTool = lazy(() => import('./tool-pages').then(module => ({ default: module.UrlTool })))

export const tools: ToolDefinition[] = [
  { id: 'cs2-color-text', name: 'CS2 彩色字体', description: '生成社区服务器彩色文本', path: '/tools/cs2-color-text', Icon: Palette, component: Cs2ColorText },
  { id: 'json', name: 'JSON 格式化', description: '格式化与校验 JSON', path: '/tools/json', Icon: Code2, component: JsonTool },
  { id: 'timestamp', name: '时间戳转换', description: 'Unix 时间戳互转', path: '/tools/timestamp', Icon: Wrench, component: TimestampTool },
  { id: 'base64', name: 'Base64', description: '文本 Base64 编解码', path: '/tools/base64', Icon: Code2, component: Base64Tool },
  { id: 'url', name: 'URL 编解码', description: '处理 URL 编码内容', path: '/tools/url', Icon: Globe2, component: UrlTool },
]
