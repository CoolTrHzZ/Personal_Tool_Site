import type { ReactNode } from 'react'
import Button from './Button'

export default function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="ui-modal-backdrop" onClick={onClose} role="presentation">
      <div className="ui-modal ui-card" role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}>
        <h2>{title}</h2>
        <div>{children}</div>
        <div className="ui-modal-actions"><Button onClick={onClose}>关闭</Button></div>
      </div>
    </div>
  )
}
