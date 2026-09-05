export function onCarbonPointer(event: { currentTarget: EventTarget & HTMLElement; clientX: number; clientY: number }) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const node = event.currentTarget
  const box = node.getBoundingClientRect()
  if (!box.width || !box.height) return
  node.style.setProperty('--mx', `${((event.clientX - box.left) / box.width) * 100}%`)
  node.style.setProperty('--my', `${((event.clientY - box.top) / box.height) * 100}%`)
}

export function sceneFromPath(path: string) {
  if (path.startsWith('/tools/') && path !== '/tools/') return 'runtime'
  if (path.startsWith('/tools')) return 'tools'
  if (path.startsWith('/ai')) return 'tools'
  if (path === '/cfg' || path.startsWith('/cfg/')) return 'nav'
  if (path.startsWith('/nav') || path.startsWith('/library')) return 'nav'
  if (path.startsWith('/notes')) return 'cms'
  return 'home'
}

export const adminScene = {
  dashboard: 'dash',
  websites: 'nav',
  library: 'nav',
  notes: 'cms',
  'note-editor': 'cms',
  tools: 'tools',
  marketplace: 'market',
  categories: 'nav',
  tags: 'cms',
  settings: 'form',
  validate: 'cms',
  import: 'form',
}
