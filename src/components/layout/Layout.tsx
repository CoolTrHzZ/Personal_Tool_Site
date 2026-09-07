import { createContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
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
  const { pathname, search } = useLocation()
  const navigationType = useNavigationType()
  const [query, setQuery] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [motionEnabled, setMotionEnabled] = useState(() => { try { return localStorage.getItem('devos-motion') !== 'off' } catch { return true } })
  const reducedMotion = useReducedMotion()
  const shellRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollPositions = useRef(new Map<string, number>())
  const previousPath = useRef(pathname)
  const firstPage = useRef(true)
  const rememberScroll = () => scrollPositions.current.set(`${pathname}${search}`, window.scrollY)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === 'devos-motion' || event.key === null)) setMotionEnabled(localStorage.getItem('devos-motion') !== 'off')
    }
    window.addEventListener('storage', sync)
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => { window.removeEventListener('storage', sync); window.history.scrollRestoration = previous }
  }, [])
  useEffect(() => {
    document.documentElement.dataset.motion = motionEnabled ? 'on' : 'off'
    if (motionEnabled) return mountTechField(shellRef.current)
  }, [motionEnabled])
  useLayoutEffect(() => {
    const key = `${pathname}${search}`
    const changed = previousPath.current !== pathname
    const returningToList = previousPath.current.startsWith(`${pathname}/`)
    const initial = firstPage.current
    previousPath.current = pathname
    firstPage.current = false
    const remember = () => {
      scrollPositions.current.set(key, window.scrollY)
      if (scrollPositions.current.size > 100) scrollPositions.current.delete(scrollPositions.current.keys().next().value!)
    }
    const frame = requestAnimationFrame(() => {
      if (changed || initial || navigationType === 'POP') {
        const top = navigationType === 'POP' || returningToList ? scrollPositions.current.get(key) || 0 : 0
        window.scrollTo({ top, behavior: 'instant' })
        if (changed && !document.querySelector('[aria-modal="true"]')) contentRef.current?.focus({ preventScroll: true })
      }
      remember()
      window.addEventListener('scroll', remember, { passive: true })
    })
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', remember) }
  }, [pathname, search, navigationType])
  const value = useMemo(() => ({ query, setQuery, openPalette: () => setPaletteOpen(true) }), [query])
  const motionValue = useMemo(() => ({ enabled: motionEnabled, toggle: () => {
    const next = !motionEnabled
    setMotionEnabled(next)
    try { localStorage.setItem('devos-motion', next ? 'on' : 'off') } catch { /* Preference still works for this session. */ }
  } }), [motionEnabled])
  return (
    <SearchContext.Provider value={value}>
      <MotionContext.Provider value={motionValue}>
      <LazyMotion features={domAnimation} strict><MotionConfig reducedMotion={!motionEnabled ? 'always' : 'user'} transition={{ duration: !motionEnabled || reducedMotion ? 0 : .35, ease: 'easeOut' }}>
      <div ref={shellRef} className="app-shell carbon-fx" data-scene={sceneFromPath(pathname)} onPointerMove={motionEnabled ? onCarbonPointer : undefined} onClickCapture={rememberScroll} onKeyDownCapture={rememberScroll}>
        <BootLayer />
        <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); contentRef.current?.focus({ preventScroll: true }); contentRef.current?.scrollIntoView({ behavior: 'instant' }) }}>跳到主要内容</a>
        <Header />
        <m.div ref={contentRef} id="main-content" tabIndex={-1} className="route-stage" key={pathname} initial={!motionEnabled || reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }}>{children}</m.div>
        <Footer />
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </div>
      </MotionConfig></LazyMotion>
      </MotionContext.Provider>
    </SearchContext.Provider>
  )
}
