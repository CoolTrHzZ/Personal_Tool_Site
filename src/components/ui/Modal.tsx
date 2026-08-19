import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import Button from './Button'

export default function Modal({ open, title, onClose, children, className = '', hideActions = false }: { open: boolean; title: string; onClose: () => void; children: ReactNode; className?: string; hideActions?: boolean }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previous = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open) return
    previous.current = document.activeElement as HTMLElement
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !dialogRef.current) return
      const nodes = [...dialogRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(node => !node.hasAttribute('disabled'))
      if (!nodes.length) return
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      first?.focus()
    })
    return () => { window.removeEventListener('keydown', onKey); previous.current?.focus() }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="ui-modal-backdrop" onClick={onClose} role="presentation">
      <div ref={dialogRef} className={`ui-modal ui-card ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby="ui-modal-title" onClick={event => event.stopPropagation()}>
        <h2 id="ui-modal-title">{title}</h2>
        <div>{children}</div>
        {!hideActions && <div className="ui-modal-actions"><Button onClick={onClose}>关闭</Button></div>}
      </div>
    </div>
  )
}
