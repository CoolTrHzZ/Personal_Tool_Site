import { useEffect, useState } from 'react'
import { hasPersonalPending, readPersonalRaw, writePersonalRaw } from './personal-storage'

type ToolStateKey = 'favoriteTools' | 'recentTools'
const changed = 'workspace:user-state'
const read = (key: string): string[] => {
  try {
    const value: unknown = JSON.parse(readPersonalRaw(key) || '[]')
    return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())))] : []
  } catch { return [] }
}
const write = (key: string, value: string[]) => {
  let saved = true
  try { writePersonalRaw(key, JSON.stringify(value)) }
  catch { saved = false }
  window.dispatchEvent(new Event(changed))
  return saved
}

export function ensureFavoriteTools(ids: string[]) {
  if (hasPersonalPending('favoriteTools')) return
  try { if (localStorage.getItem('favoriteTools') !== null) return } catch { /* Use the session fallback. */ }
  write('favoriteTools', [...new Set(ids)])
}
export const favoriteTools = () => read('favoriteTools')
export const recentTools = () => read('recentTools')
export const toggleFavoriteTool = (id: string) => {
  const favorites = favoriteTools()
  return write('favoriteTools', favorites.includes(id) ? favorites.filter(item => item !== id) : [...favorites, id])
}
export const retryFavoriteTools = () => write('favoriteTools', favoriteTools())
export const addRecentTool = (id: string) => { if (id.trim()) write('recentTools', [id, ...recentTools().filter(item => item !== id)].slice(0, 8)) }
export const saveSearch = (value: string) => { const query = value.trim(); if (query) write('searchHistory', [query, ...read('searchHistory').filter(item => item !== query)].slice(0, 8)) }

export function useUserTools(key: ToolStateKey) {
  const [ids, setIds] = useState(() => read(key))
  useEffect(() => {
    const update = () => setIds(read(key))
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== key) return
      if (!hasPersonalPending(key)) update()
    }
    update()
    window.addEventListener(changed, update)
    window.addEventListener('storage', onStorage)
    window.addEventListener('devos:personal-data-restored', update)
    return () => { window.removeEventListener(changed, update); window.removeEventListener('storage', onStorage); window.removeEventListener('devos:personal-data-restored', update) }
  }, [key])
  return ids
}
