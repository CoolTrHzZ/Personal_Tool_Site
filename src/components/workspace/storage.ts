export type Todo = { id: string; text: string; done: boolean }
export type FocusTimer = { phase: 'focus' | 'break'; minutes: number; remainingMs: number; deadline: number | null; completed: boolean }
export const MINUTE = 60_000
export const initialTimer: FocusTimer = { phase: 'focus', minutes: 25, remainingMs: 25 * MINUTE, deadline: null, completed: false }
export const emptyTodos: Todo[] = []
export const isWorkspaceNote = (value: unknown): value is string => typeof value === 'string' && value.length <= 10_000

export function isTodoList(value: unknown): value is Todo[] {
  return Array.isArray(value) && value.length <= 1000 && value.every(item => item && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 160 && typeof item.text === 'string' && item.text.trim().length > 0 && item.text.length <= 160 && typeof item.done === 'boolean') && new Set(value.map(item => item.id)).size === value.length
}

export function isTimer(value: unknown): value is FocusTimer {
  if (!value || typeof value !== 'object') return false
  const timer = value as FocusTimer
  const duration = (timer.phase === 'focus' ? timer.minutes : 5) * MINUTE
  return ['focus', 'break'].includes(timer.phase) && [25, 45, 60].includes(timer.minutes) && Number.isFinite(timer.remainingMs) && timer.remainingMs >= 0 && timer.remainingMs <= duration && (timer.deadline === null || (Number.isSafeInteger(timer.deadline) && timer.deadline > 0)) && typeof timer.completed === 'boolean' && timer.completed === (timer.remainingMs === 0) && !(timer.completed && timer.deadline !== null)
}
