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
export const PAGE_COPY_FIELDS = Object.freeze(['title', 'subtitle', 'eyebrow', 'description', 'caption'])
export function assertPageCopy(value, headerLabel) {
  if (headerLabel !== undefined && (typeof headerLabel !== 'string' || headerLabel.length > 80 || [...headerLabel].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) throw new Error('品牌小标签必须为不超过 80 字符的文字')
  if (value === undefined) return
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('页面文案必须为对象')
  for (const [page, fields] of Object.entries(value)) {
    if (!['home', ...DISPLAY_PAGES.map(item => item.id)].includes(page) || !fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('页面文案只能设置首页和现有组件页')
    for (const [key, text] of Object.entries(fields)) if (!PAGE_COPY_FIELDS.includes(key) || typeof text !== 'string' || text.length > (key === 'description' ? 1000 : 160) || [...text].some(char => (char.charCodeAt(0) < 32 && ![9, 10, 13].includes(char.charCodeAt(0))) || char.charCodeAt(0) === 127) || (key === 'title' && !text.trim())) throw new Error('页面文案字段或长度无效')
  }
}
