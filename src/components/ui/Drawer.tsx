import { useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDialog } from './Modal'

export default function Drawer({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const panel = useDialog<HTMLElement>(open, onClose)
  const titleId = useId()
  if (!open) return null
  return createPortal(
    <div className="ui-drawer-backdrop" onClick={onClose} role="presentation">
      <aside ref={panel} className="ui-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onClick={event => event.stopPropagation()}>
        <div className="ui-drawer-head"><h2 id={titleId}>{title}</h2><button type="button" className="ui-button ui-button-ghost ui-button-sm" onClick={onClose}>关闭</button></div>
        <div className="ui-drawer-body">{children}</div>
        {footer && <div className="ui-drawer-foot">{footer}</div>}
      </aside>
    </div>,
    document.body,
  )
}
