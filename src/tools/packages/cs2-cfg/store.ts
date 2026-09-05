import { isCfgDocument, type CfgDocument } from './share'

export const CFG_STORAGE_KEY = 'devos.cfg.workbench.v1'
export const MAX_VERSIONS = 20
export type CfgVersion = CfgDocument & { id: string; savedAt: string }
export type CfgStore = { draft: CfgDocument; versions: CfgVersion[] }
export const emptyCfgStore: CfgStore = { draft: { name: 'autoexec', content: '' }, versions: [] }

export function isCfgStore(value: unknown): value is CfgStore {
  if (!value || typeof value !== 'object') return false
  const data = value as CfgStore
  return isCfgDocument(data.draft) && Array.isArray(data.versions) && data.versions.length <= MAX_VERSIONS &&
    data.versions.every(item => isCfgDocument(item) && typeof item.id === 'string' && item.id.length > 0 && typeof item.savedAt === 'string' && Number.isFinite(Date.parse(item.savedAt))) &&
    new Set(data.versions.map(item => item.id)).size === data.versions.length
}

export function readCfgStore() {
  try {
    const raw = localStorage.getItem(CFG_STORAGE_KEY)
    if (raw === null) return { data: emptyCfgStore, raw, error: '' }
    const data: unknown = JSON.parse(raw)
    if (!isCfgStore(data)) throw new Error('invalid')
    return { data, raw, error: '' }
  } catch { return { data: emptyCfgStore, raw: null, error: '本地 CFG 记录无法读取，已暂停自动保存并保留原记录。' } }
}
