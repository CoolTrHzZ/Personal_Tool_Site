// Missing settings preserve every existing component page. These switches control display only.
export const DISPLAY_PAGES = Object.freeze([
  { id:'projects', label:'桌面工具', path:'/projects' },
  { id:'ai', label:'AI Hub', path:'/ai' },
  { id:'tools', label:'工具', path:'/tools' },
  { id:'cfg', label:'CFG 库', path:'/cfg' },
  { id:'nav', label:'导航', path:'/nav' },
  { id:'library', label:'收藏', path:'/library' },
  { id:'notes', label:'笔记', path:'/notes' },
])
export function assertPageVisibility(value) {
  if (value === undefined) return
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.entries(value).some(([key, visible]) => !DISPLAY_PAGES.some(page => page.id === key) || typeof visible !== 'boolean')) throw new Error('页面显示设置必须仅包含组件页名称和布尔开关')
}
export const pageVisible = (visibility, page) => visibility?.[page] !== false
