const read = (key: string) => { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [] } catch { return [] } }
const write = (key: string, value: string[]) => localStorage.setItem(key, JSON.stringify(value))

export function ensureFavoriteTools(ids: string[]) { if (!localStorage.getItem('favoriteTools')) write('favoriteTools', ids) }
export const favoriteTools = () => read('favoriteTools')
export const recentTools = () => read('recentTools')
export const addRecentTool = (id: string) => write('recentTools', [id, ...recentTools().filter(item => item !== id)].slice(0, 8))
export const saveSearch = (value: string) => { const query = value.trim(); if (query) write('searchHistory', [query, ...read('searchHistory').filter(item => item !== query)].slice(0, 8)) }
