import { createContext, useState, type ReactNode } from 'react'
import Header from './Header'

export type SearchState = { query: string; setQuery: (query: string) => void }
export const SearchContext = createContext<SearchState>({ query: '', setQuery: () => undefined })

export default function Layout({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('')
  return <SearchContext.Provider value={{ query, setQuery }}><Header />{children}</SearchContext.Provider>
}
