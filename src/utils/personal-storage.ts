// Keep failed writes available for retry and backup until this browser tab is closed.
const pending = new Map<string, string | null>()

export function readPersonalRaw(key: string): string | null {
  return pending.has(key) ? pending.get(key)! : localStorage.getItem(key)
}

export function writePersonalRaw(key: string, raw: string) {
  try { localStorage.setItem(key, raw); pending.delete(key) }
  catch (error) { pending.set(key, raw); throw error }
}

export const hasPersonalPending = (key: string) => pending.has(key)
export const rememberPersonalPending = (key: string, raw: string | null) => { pending.set(key, raw) }
export const clearPersonalPending = (key: string) => { pending.delete(key) }
