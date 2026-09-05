/// <reference lib="es2022.intl" />

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

export function buildCs2Segments(text: string, mode: Cs2ColorMode, color: string, gradientStart: string, gradientEnd: string, custom: string) {
  if (!text) return []
  if (mode === 'single') return [{ text, color: normalizeHex(color) }]
  const chars = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), item => item.segment)
  const total = chars.filter(char => !/^[\r\n]+$/.test(char)).length
  const palette = customColors(custom, normalizeHex(color))
  let index = 0
  return chars.map(char => {
    if (/^[\r\n]+$/.test(char)) return { text: char, color: '' }
    const ratio = index / Math.max(total - 1, 1)
    const current = mode === 'gradient' ? gradientColor(gradientStart, gradientEnd, ratio) : mode === 'rainbow' ? rainbowColor(index, total) : palette[index % palette.length]
    index += 1
    return { text: char, color: current }
  })
}

export function buildCs2Output(text: string, mode: Cs2ColorMode, color: string, gradientStart: string, gradientEnd: string, custom: string) {
  return buildCs2Segments(text, mode, color, gradientStart, gradientEnd, custom).map(item => `${item.color ? `\x07${item.color.slice(1)}` : ''}${item.text}`).join('')
}
