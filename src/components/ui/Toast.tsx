import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useExitPresence } from './Modal'

const ToastContext = createContext<(message: string) => void>(() => undefined)
export const useToast = () => useContext(ToastContext)

export function ToastMessage({ message, onRemove, className = '' }: { message: string; onRemove: () => void; className?: string }) {
  const [open, setOpen] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const paused = hovered || focused
  const present = useExitPresence(open)
  const item = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (paused || !open) return
    const timer = window.setTimeout(() => setOpen(false), 4000)
    return () => window.clearTimeout(timer)
  }, [paused, open])
  useEffect(() => { if (!present) onRemove() }, [present, onRemove])
  const dismiss = () => {
    if (item.current?.contains(document.activeElement)) {
      const target = item.current.closest('.tool-fullscreen')?.querySelector<HTMLElement>('button') || document.getElementById('main-content')
      target?.focus({ preventScroll: true })
    }
    setOpen(false)
  }
  if (!present) return null
  return <div ref={item} className={`ui-toast ${className}${open ? '' : ' is-closing'}`.trim()} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
    <span>{message}</span><button type="button" className="ui-toast-close" aria-label={`关闭提示：${message}`} onClick={dismiss}>×</button>
  </div>
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; message: string }[]>([])
  const sequence = useRef(0)
  const push = useCallback((message: string) => {
    const id = ++sequence.current
    setItems(current => [...current, { id, message }])
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="ui-toast-stack" aria-live="polite" aria-relevant="additions">{items.map(item => <ToastMessage key={item.id} message={item.message} onRemove={() => setItems(current => current.filter(value => value.id !== item.id))} />)}</div>
    </ToastContext.Provider>
  )
}
