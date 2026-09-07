import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Button from './Button'

const dialogs: HTMLElement[] = []
const isolated = new Map<HTMLElement, string | null>()
let previousOverflow = ''
const focusable = 'button, [href], input, select, textarea, [tabindex], [contenteditable="true"]'

function isVisible(node: HTMLElement) {
  if (node.closest('[hidden], [inert]')) return false
  for (let parent: HTMLElement | null = node; parent; parent = parent.parentElement) {
    const style = window.getComputedStyle(parent)
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
  }
  return true
}

function isolateBackground() {
  for (const [node, value] of isolated) {
    if (value === null) node.removeAttribute('inert')
    else node.setAttribute('inert', value)
  }
  isolated.clear()
  const top = dialogs[dialogs.length - 1]
  if (!top) return
  for (const node of document.body.children) {
    if (!(node instanceof HTMLElement) || node.contains(top) || node.matches('script, style')) continue
    isolated.set(node, node.getAttribute('inert'))
    node.setAttribute('inert', '')
  }
}

// Keep the element mounted, including focus protection, until its CSS exit finishes.
export function useExitPresence(open: boolean) {
  const [present, setPresent] = useState(open)
  useEffect(() => {
    if (open) { setPresent(true); return }
    const reduced = document.documentElement.dataset.motion === 'off' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => setPresent(false), reduced ? 0 : 180)
    return () => window.clearTimeout(timer)
  }, [open])
  return open || present
}

export function useDialog<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const dialogRef = useRef<T>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    const previous = document.activeElement as HTMLElement | null
    const route = () => window.location.pathname + window.location.hash.split('?')[0]
    const previousRoute = route()
    if (!dialogs.length) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden' }
    dialogs.push(dialog)
    isolateBackground()
    const header = document.querySelector('.topbar')
    const setInset = () => dialog.parentElement?.style.setProperty('--dialog-header-bottom', `${Math.max(0, header?.getBoundingClientRect().bottom || 0)}px`)
    setInset()
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(setInset)
    if (header) resize?.observe(header)
    window.addEventListener('resize', setInset)
    const topmost = () => dialogs[dialogs.length - 1] === dialog
    const nodes = () => [...dialog.querySelectorAll<HTMLElement>(focusable)].filter(node => node.tabIndex >= 0 && !node.matches(':disabled, input[type="hidden"]') && isVisible(node))
    const onFocus = (event: FocusEvent) => {
      if (topmost() && !dialog.contains(event.target as Node)) (nodes()[0] || dialog).focus({ preventScroll: true })
    }
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
    document.addEventListener('focusin', onFocus)
    const frame = requestAnimationFrame(() => {
      if (topmost() && !dialog.contains(document.activeElement)) (nodes()[0] || dialog).focus({ preventScroll: true })
    })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', onFocus)
      window.removeEventListener('resize', setInset)
      resize?.disconnect()
      const wasTopmost = topmost()
      dialogs.splice(dialogs.indexOf(dialog), 1)
      isolateBackground()
      if (!dialogs.length) document.body.style.overflow = previousOverflow
      if (wasTopmost) {
        const canRestore = previousRoute === route() && previous?.isConnected && previous !== document.body && previous !== document.documentElement && !previous.matches(':disabled') && isVisible(previous)
        const target = canRestore ? previous : dialogs[dialogs.length - 1] || document.getElementById('main-content')
        target?.focus({ preventScroll: true })
      }
    }
  }, [open])
  return dialogRef
}

export default function Modal({ open, title, onClose, children, className = '', hideActions = false }: { open: boolean; title: string; onClose: () => void; children: ReactNode; className?: string; hideActions?: boolean }) {
  const present = useExitPresence(open)
  const dialogRef = useDialog<HTMLDivElement>(present, () => { if (open) onClose() })
  const titleId = useId()
  const content = useRef({ title, children, className, hideActions })
  if (open) content.current = { title, children, className, hideActions }
  if (!present) return null
  return createPortal(
    <div className={`ui-modal-backdrop${open ? '' : ' is-closing'}`} onClick={() => { if (open) onClose() }} role="presentation">
      <div ref={dialogRef} className={`ui-modal ui-card ${content.current.className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onClick={event => event.stopPropagation()} onClickCapture={event => { if (!open) { event.preventDefault(); event.stopPropagation() } }} onKeyDownCapture={event => { if (!open && event.key !== 'Tab') { event.preventDefault(); event.stopPropagation() } }}>
        <h2 id={titleId}>{content.current.title}</h2>
        <div>{content.current.children}</div>
        {!content.current.hideActions && <div className="ui-modal-actions"><Button onClick={onClose}>关闭</Button></div>}
      </div>
    </div>,
    document.body,
  )
}
