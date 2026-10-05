export type DisplayPage = 'projects' | 'ai' | 'tools' | 'cfg' | 'nav' | 'library' | 'notes'
export type PageVisibility = Partial<Record<DisplayPage, boolean>>
export type PageCopy = { title?: string; subtitle?: string; eyebrow?: string; description?: string; caption?: string }
export type PageCopies = Partial<Record<DisplayPage | 'home', PageCopy>>
export const PAGE_COPY_FIELDS: readonly ['title', 'subtitle', 'eyebrow', 'description', 'caption']
export function assertPageCopy(value: unknown, headerLabel?: unknown): void
export const DISPLAY_PAGES: readonly { id: DisplayPage; label: string; path: string }[]
export function assertPageVisibility(value: unknown): void
export function pageVisible(visibility: PageVisibility | undefined, page: DisplayPage): boolean
