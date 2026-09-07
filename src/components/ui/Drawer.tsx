import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDialog, useExitPresence } from './Modal'

export default function Drawer({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const present = useExitPresence(open)
  const panel = useDialog<HTMLElement>(present, () => { if (open) onClose() })
  const titleId = useId()
  const content = useRef({ title, children, footer })
  if (open) content.current = { title, children, footer }
  if (!present) return null
  return createPortal(
    <div className={`ui-drawer-backdrop${open ? '' : ' is-closing'}`} onClick={() => { if (open) onClose() }} role="presentation">
      <aside ref={panel} className="ui-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onClick={event => event.stopPropagation()} onClickCapture={event => { if (!open) { event.preventDefault(); event.stopPropagation() } }} onKeyDownCapture={event => { if (!open && event.key !== 'Tab') { event.preventDefault(); event.stopPropagation() } }}>
        <div className="ui-drawer-head"><h2 id={titleId}>{content.current.title}</h2><button type="button" className="ui-button ui-button-ghost ui-button-sm" onClick={onClose}>关闭</button></div>
        <div className="ui-drawer-body">{content.current.children}</div>
        {content.current.footer && <div className="ui-drawer-foot">{content.current.footer}</div>}
      </aside>
    </div>,
    document.body,
  )
}
