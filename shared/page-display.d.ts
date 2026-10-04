export type DisplayPage = 'projects' | 'ai' | 'tools' | 'cfg' | 'nav' | 'library' | 'notes'
export type PageVisibility = Partial<Record<DisplayPage, boolean>>
export const DISPLAY_PAGES: readonly { id: DisplayPage; label: string; path: string }[]
export function assertPageVisibility(value: unknown): void
export function pageVisible(visibility: PageVisibility | undefined, page: DisplayPage): boolean
