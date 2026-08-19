import type { ReactNode } from 'react'

export default function Drawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="ui-drawer-backdrop" onClick={onClose} role="presentation">
      <aside className="ui-drawer" role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}>
        <div className="ui-drawer-head"><h2>{title}</h2><button type="button" className="ui-button ui-button-ghost ui-button-sm" onClick={onClose}>关闭</button></div>
        {children}
      </aside>
    </div>
  )
}
