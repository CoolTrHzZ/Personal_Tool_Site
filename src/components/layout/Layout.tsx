import { createContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { LazyMotion, domAnimation, m, MotionConfig, useReducedMotion } from 'motion/react'
import Header from './Header'
import Footer from './Footer'
import BootLayer from './BootLayer'
import CommandPalette from '../search/CommandPalette'
import { onCarbonPointer, sceneFromPath } from '../../utils/carbon-fx'
import { mountTechField } from '../../../shared/tech-field.js'

export type SearchState = { query: string; setQuery: (query: string) => void; openPalette: () => void }
export const SearchContext = createContext<SearchState>({ query: '', setQuery: () => undefined, openPalette: () => undefined })
export const MotionContext = createContext({ enabled: true, toggle: () => {} })

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [query, setQuery] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [motionEnabled, setMotionEnabled] = useState(() => { try { return localStorage.getItem('devos-motion') !== 'off' } catch { return true } })
  const reducedMotion = useReducedMotion()
  const shellRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    document.documentElement.dataset.motion = motionEnabled ? 'on' : 'off'
    try { localStorage.setItem('devos-motion', motionEnabled ? 'on' : 'off') } catch { /* Preference still works for this session. */ }
    if (motionEnabled) return mountTechField(shellRef.current)
  }, [motionEnabled])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [pathname])
  const value = useMemo(() => ({ query, setQuery, openPalette: () => setPaletteOpen(true) }), [query])
  const motionValue = useMemo(() => ({ enabled: motionEnabled, toggle: () => setMotionEnabled(value => !value) }), [motionEnabled])
  return (
    <SearchContext.Provider value={value}>
      <MotionContext.Provider value={motionValue}>
      <LazyMotion features={domAnimation} strict><MotionConfig reducedMotion={!motionEnabled ? 'always' : 'user'} transition={{ duration: !motionEnabled || reducedMotion ? 0 : .35, ease: 'easeOut' }}>
      <div ref={shellRef} className="app-shell carbon-fx" data-scene={sceneFromPath(pathname)} onPointerMove={motionEnabled ? onCarbonPointer : undefined}>
        <BootLayer />
        <Header />
        <m.div className="route-stage" key={pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{children}</m.div>
        <Footer />
        {paletteOpen && <CommandPalette open onClose={() => setPaletteOpen(false)} />}
      </div>
      </MotionConfig></LazyMotion>
      </MotionContext.Provider>
    </SearchContext.Provider>
  )
}
