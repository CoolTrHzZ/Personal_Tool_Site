import { useEffect, useRef, type ReactNode } from 'react'

export default function Drawer({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const panel = useRef<HTMLElement>(null)
  const previous = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open) return
    previous.current = document.activeElement as HTMLElement
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !panel.current) return
      const nodes = [...panel.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(node => !node.hasAttribute('disabled'))
      if (!nodes.length) return
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus())
    return () => { window.removeEventListener('keydown', onKey); previous.current?.focus() }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="ui-drawer-backdrop" onClick={onClose} role="presentation">
      <aside ref={panel} className="ui-drawer" role="dialog" aria-modal="true" aria-labelledby="ui-drawer-title" onClick={event => event.stopPropagation()}>
        <div className="ui-drawer-head"><h2 id="ui-drawer-title">{title}</h2><button type="button" className="ui-button ui-button-ghost ui-button-sm" onClick={onClose}>关闭</button></div>
        <div className="ui-drawer-body">{children}</div>
        {footer && <div className="ui-drawer-foot">{footer}</div>}
      </aside>
    </div>
  )
}
