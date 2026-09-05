import { afterEach, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { clearPersonalPending } from '../src/utils/personal-storage'
import { addRecentTool, ensureFavoriteTools, favoriteTools, recentTools, retryFavoriteTools, saveSearch, toggleFavoriteTool, useUserTools } from '../src/utils/user-state.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); ['favoriteTools', 'recentTools', 'searchHistory'].forEach(clearPersonalPending) })

it('validates stored IDs, preserves empty favorites and bounds recents/search history', () => {
  localStorage.setItem('favoriteTools', '["json",null,1,"","json"]')
  expect(favoriteTools()).toEqual(['json'])
  localStorage.setItem('favoriteTools', '[]')
  ensureFavoriteTools(['default'])
  expect(favoriteTools()).toEqual([])
  localStorage.setItem('recentTools', '{broken')
  expect(recentTools()).toEqual([])
  for (let index = 0; index < 10; index += 1) addRecentTool(String(index))
  addRecentTool('5')
  addRecentTool(' ')
  expect(recentTools()).toEqual(['5', '9', '8', '7', '6', '4', '3', '2'])
  saveSearch(' json ')
  saveSearch('json')
  saveSearch(' ')
  expect(JSON.parse(localStorage.getItem('searchHistory'))).toEqual(['json'])
})

it('keeps initialization and interactions working when storage access or writes fail', () => {
  const prototype = Object.getPrototypeOf(localStorage)
  const get = vi.spyOn(prototype, 'getItem').mockImplementation(() => { throw new Error('storage denied') })
  const set = vi.spyOn(prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded') })
  expect(() => ensureFavoriteTools(['json'])).not.toThrow()
  toggleFavoriteTool('base64')
  addRecentTool('json')
  saveSearch('json')
  expect(favoriteTools()).toEqual(['json', 'base64'])
  expect(recentTools()).toEqual(['json'])
  get.mockRestore()
  set.mockRestore()
  toggleFavoriteTool('base64')
  addRecentTool('base64')
  saveSearch('next')
  expect(JSON.parse(localStorage.getItem('favoriteTools'))).toEqual(['json'])
  expect(JSON.parse(localStorage.getItem('recentTools'))).toEqual(['base64', 'json'])
})

it('updates mounted consumers for changes in this page and other tabs', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  function Favorites() { return createElement('span', null, useUserTools('favoriteTools').join(',')) }
  try {
    act(() => root.render(createElement(Favorites)))
    act(() => toggleFavoriteTool('json'))
    expect(host.textContent).toBe('json')
    localStorage.setItem('favoriteTools', '["base64"]')
    act(() => window.dispatchEvent(new window.StorageEvent('storage', { key: 'favoriteTools' })))
    expect(host.textContent).toBe('base64')
    localStorage.clear()
    act(() => window.dispatchEvent(new window.StorageEvent('storage', { key: null })))
    expect(host.textContent).toBe('')
  } finally { act(() => root.unmount()); host.remove() }
})

it('preserves failed favorites across storage events and reports retry success', () => {
  const write = vi.spyOn(Object.getPrototypeOf(localStorage), 'setItem').mockImplementation(() => { throw new Error('quota') })
  expect(toggleFavoriteTool('json')).toBe(false)
  write.mockRestore()
  localStorage.setItem('favoriteTools', '["base64"]')
  window.dispatchEvent(new window.StorageEvent('storage', { key: 'favoriteTools' }))
  expect(favoriteTools()).toEqual(['json'])
  expect(retryFavoriteTools()).toBe(true)
  expect(localStorage.getItem('favoriteTools')).toBe('["json"]')
})
