import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import Header from './Header'
import CommandPalette from '../search/CommandPalette'

export type SearchState = { query: string; setQuery: (query: string) => void; openPalette: () => void }
export const SearchContext = createContext<SearchState>({ query: '', setQuery: () => undefined, openPalette: () => undefined })

export default function Layout({ children }: { children: ReactNode }) {
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
      <Header />
      {children}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </SearchContext.Provider>
  )
}
