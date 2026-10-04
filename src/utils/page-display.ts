import site from '../data/site.json'
import type { SiteConfig } from '../types'
import { DISPLAY_PAGES, pageVisible, type DisplayPage } from '../../shared/page-display.js'

export const visiblePage = (page: DisplayPage) => pageVisible((site as SiteConfig).pageVisibility, page)
export const visiblePath = (path: string) => {
  const page = DISPLAY_PAGES.find(page => path === page.path || path.startsWith(page.path + '/'))
  return !page || visiblePage(page.id)
}
