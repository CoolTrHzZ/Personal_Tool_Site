import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Button from './Button'

const dialogs: HTMLElement[] = []
let previousOverflow = ''
const focusable = 'button, [href], input, select, textarea, [tabindex]'

export function useDialog<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const dialogRef = useRef<T>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    const previous = document.activeElement as HTMLElement | null
    if (!dialogs.length) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden' }
    dialogs.push(dialog)
    const topmost = () => dialogs[dialogs.length - 1] === dialog
    const nodes = () => [...dialog.querySelectorAll<HTMLElement>(focusable)].filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[hidden], [inert]') && window.getComputedStyle(node).display !== 'none' && window.getComputedStyle(node).visibility !== 'hidden')
    const onKey = (event: KeyboardEvent) => {
      if (!topmost() || event.isComposing) return
      if (event.key === 'Escape') { event.preventDefault(); close.current(); return }
      if (event.key !== 'Tab') return
      const available = nodes()
      const first = available[0], last = available[available.length - 1]
      if (!first) { event.preventDefault(); dialog.focus(); return }
      if (!dialog.contains(document.activeElement) || document.activeElement === dialog) { event.preventDefault(); (event.shiftKey ? last : first).focus() }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    const frame = requestAnimationFrame(() => {
      if (topmost() && !dialog.contains(document.activeElement)) (nodes()[0] || dialog).focus()
    })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey)
      const wasTopmost = topmost()
      dialogs.splice(dialogs.indexOf(dialog), 1)
      if (!dialogs.length) document.body.style.overflow = previousOverflow
      if (wasTopmost && previous?.isConnected) previous.focus()
    }
  }, [open])
  return dialogRef
}

export default function Modal({ open, title, onClose, children, className = '', hideActions = false }: { open: boolean; title: string; onClose: () => void; children: ReactNode; className?: string; hideActions?: boolean }) {
  const dialogRef = useDialog<HTMLDivElement>(open, onClose)
  const titleId = useId()
  if (!open) return null
  return createPortal(
    <div className="ui-modal-backdrop" onClick={onClose} role="presentation">
      <div ref={dialogRef} className={`ui-modal ui-card ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onClick={event => event.stopPropagation()}>
        <h2 id={titleId}>{title}</h2>
        <div>{children}</div>
        {!hideActions && <div className="ui-modal-actions"><Button onClick={onClose}>关闭</Button></div>}
      </div>
    </div>,
    document.body,
  )
}
