import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'
import BootLayer from './BootLayer'
import CommandPalette from '../search/CommandPalette'
import { onCarbonPointer, sceneFromPath } from '../../utils/carbon-fx'

export type SearchState = { query: string; setQuery: (query: string) => void; openPalette: () => void }
export const SearchContext = createContext<SearchState>({ query: '', setQuery: () => undefined, openPalette: () => undefined })

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [query, setQuery] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const value = useMemo(() => ({ query, setQuery, openPalette: () => setPaletteOpen(true) }), [query])
  return (
    <SearchContext.Provider value={value}>
      <div className="app-shell carbon-fx" data-scene={sceneFromPath(pathname)} onPointerMove={onCarbonPointer}>
        <BootLayer />
        <Header />
        <div className="route-stage" key={pathname}>{children}</div>
        <Footer />
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </div>
    </SearchContext.Provider>
  )
}
