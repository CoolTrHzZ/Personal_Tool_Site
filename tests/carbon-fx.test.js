import { expect, it, vi } from 'vitest'
import { onCarbonPointer } from '../src/utils/carbon-fx.ts'

it('tracks mouse position but leaves the background stationary for touch and reduced motion', () => {
  const node = document.createElement('div')
  node.getBoundingClientRect = () => ({ left: 0, top: -100, width: 200, height: 400 })
  const event = { currentTarget: node, clientX: 50, clientY: 100, pointerType: 'mouse' }
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  try {
    onCarbonPointer(event)
    expect(node.style.getPropertyValue('--mx')).toBe('25%')
    expect(node.style.getPropertyValue('--my')).toBe('50%')
    onCarbonPointer({ ...event, clientX: 150, pointerType: 'touch' })
    expect(node.style.getPropertyValue('--mx')).toBe('25%')
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    onCarbonPointer({ ...event, clientX: 150 })
    expect(node.style.getPropertyValue('--mx')).toBe('25%')
  } finally { vi.unstubAllGlobals() }
})
