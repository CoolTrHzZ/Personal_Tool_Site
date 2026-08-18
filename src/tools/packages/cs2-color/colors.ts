export type Cs2ColorMode = 'single' | 'gradient' | 'rainbow' | 'custom'

const HEX = /^#?[0-9a-f]{6}$/i

export function normalizeHex(value: string, fallback = '#d6ff3f') {
  return HEX.test(value) ? `#${value.replace('#', '').toLowerCase()}` : fallback
}

function hexToRgb(value: string) {
  const hex = normalizeHex(value).slice(1)
  return [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16))
}

function rgbToHex(rgb: number[]) {
  return `#${rgb.map(value => Math.round(value).toString(16).padStart(2, '0')).join('')}`
}

function gradientColor(start: string, end: string, ratio: number) {
  const a = hexToRgb(start)
  const b = hexToRgb(end)
  return rgbToHex(a.map((value, index) => value + (b[index] - value) * ratio))
}

function rainbowColor(index: number, total: number) {
  const hue = (index / Math.max(total, 1)) * 360
  const chroma = 1
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1))
  const rgb = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x]
  return rgbToHex(rgb.map(value => value * 255))
}

function customColors(value: string, fallback: string) {
  const colors = value.split(/[\s,]+/).map(item => normalizeHex(item, '')).filter(Boolean)
  return colors.length ? colors : [fallback]
}

export function buildCs2Output(text: string, mode: Cs2ColorMode, color: string, gradientStart: string, gradientEnd: string, custom: string) {
  if (!text) return ''
  if (mode === 'single') return `\x07${normalizeHex(color).slice(1)}${text}`
  const chars = Array.from(text)
  const palette = customColors(custom, normalizeHex(color))
  return chars.map((char, index) => {
    if (char === '\n' || char === '\r') return char
    const ratio = index / Math.max(chars.length - 1, 1)
    const current = mode === 'gradient' ? gradientColor(gradientStart, gradientEnd, ratio) : mode === 'rainbow' ? rainbowColor(index, chars.length) : palette[index % palette.length]
    return `\x07${current.slice(1)}${char}`
  }).join('')
}

if (import.meta.env.DEV) {
  const sample = buildCs2Output('ok', 'single', '#112233', '#112233', '#445566', '#112233')
  if (sample.charCodeAt(0) !== 7 || sample.includes('\\x07')) throw new Error('CS2 control character self-check failed')
}
