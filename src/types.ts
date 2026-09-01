export type Category = { id: string; name: string; icon: string; order: number }
export type NavigationItem = {
  id: string; name: string; url: string; description: string; category: string
  icon: string; tags: string[]; enabled: boolean; order: number
}
export type LibraryKind = 'repo' | 'skill'
export type LibraryItem = {
  id: string; name: string; kind: LibraryKind; url: string; description: string
  language: string; tags: string[]; enabled: boolean; order: number
}
export type NoteItem = {
  id: string; title: string; summary: string; tags: string[]
  enabled: boolean; order: number; updated: string; body: string
}
export type AIResourceKind = 'skill' | 'agent' | 'prompt' | 'model' | 'app'
export type AIResource = {
  id: string; kind: AIResourceKind; name: string; description: string
  install: string
  content: string; url: string; tags: string[]; enabled: boolean; order: number; updated: string
}
export type SiteConfig = {
  name: string
  tagline: string
  title: string
  description: string
  github: string
  footer: string
  logo: string
  adminUrl: string
  publicUrl: string
  basePath: string
  todayContinueLimit: number
}
