const NS = 'http://www.w3.org/2000/svg'

export const ICON_CATALOG = Object.freeze({
  Code2: ['<path d="m18 16 4-4-4-4"/>', '<path d="m6 8-4 4 4 4"/>', '<path d="m14.5 4-5 16"/>'],
  Bot: ['<path d="M12 8V4H8"/>', '<rect width="16" height="12" x="4" y="8" rx="2"/>', '<path d="M2 14h2M20 14h2M15 13v2M9 13v2"/>'],
  Palette: ['<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>', '<circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>', '<circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>', '<circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>', '<path d="M12 2a10 10 0 1 0 0 20h1a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h5.5A4.5 4.5 0 0 0 22 9.5C22 5.36 17.52 2 12 2Z"/>'],
  Server: ['<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/>', '<rect width="20" height="8" x="2" y="14" rx="2" ry="2"/>', '<line x1="6" x2="6.01" y1="6" y2="6"/>', '<line x1="6" x2="6.01" y1="18" y2="18"/>'],
  Globe2: ['<circle cx="12" cy="12" r="10"/>', '<path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/>'],
  Wrench: ['<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94L14.7 6.3Z"/>'],
})

const parsePath = markup => {
  const match = markup.match(/^<(\w+)([^>]*)\/?>(?:<\/\w+>)?$/)
  if (!match) return null
  const node = document.createElementNS(NS, match[1])
  for (const [, key, value] of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) node.setAttribute(key, value)
  return node
}

export function createIconSvg(name, size = 18) {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  for (const markup of ICON_CATALOG[name] || ICON_CATALOG.Globe2) {
    const node = parsePath(markup)
    if (node) svg.append(node)
  }
  return svg
}

export const ICON_NAMES = Object.freeze(Object.keys(ICON_CATALOG))
