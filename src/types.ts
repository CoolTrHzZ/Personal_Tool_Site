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
  kind?: 'note' | 'deploy' | 'incident' | 'rollback'; projectId?: string; cfgIds?: string[]
}
export type ProjectItem = {
  id: string; name: string; kind: 'project' | 'service'; description: string; body: string
  repository: string; docs: string; url: string; status: 'active' | 'paused' | 'archived'
  tags: string[]; cfgIds: string[]; enabled: boolean; order: number; updated: string
}
export type CfgRevision = { id: string; version: number; filename: string; updated: string; changelog: string }
export type CfgEntry = {
  id: string; name: string; filename: string; description: string; category: string
  tags: string[]; updated: string; order: number
  version?: number; changelog?: string; history?: CfgRevision[]
}
export type AIWorkflow = {
  id: string; name: string; description: string; category: 'code-review' | 'requirements' | 'incident'
  tags: string[]; steps: { title: string; description: string; resourceId: string }[]
  enabled: boolean; order: number; updated: string
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
  toolsDescription: string
  navigationDescription: string
  libraryDescription: string
  aiHubDescription: string
  notesDescription: string
  github: string
  footer: string
  logo: string
  adminUrl: string
  publicUrl: string
  basePath: string
  todayContinueLimit: number
}
