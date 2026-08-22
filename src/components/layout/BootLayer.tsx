import { useEffect, useState } from 'react'
import site from '../../data/site.json'
import type { SiteConfig } from '../../types'

const siteConfig = site as SiteConfig
const KEY = 'devos-boot'

export default function BootLayer() {
  const [open, setOpen] = useState(() => {
    try { return sessionStorage.getItem(KEY) !== '1' } catch { return false }
  })
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (!open) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const hold = reduce ? 40 : 920
    const fade = reduce ? 0 : 280
    let fadeTimer = 0
    const start = window.setTimeout(() => {
      setLeaving(true)
      fadeTimer = window.setTimeout(() => {
        try { sessionStorage.setItem(KEY, '1') } catch { /* ignore quota */ }
        setOpen(false)
      }, fade)
    }, hold)
    return () => { window.clearTimeout(start); window.clearTimeout(fadeTimer) }
  }, [open])
  if (!open) return null
  return (
    <div className={`boot-layer${leaving ? ' is-leaving' : ''}`} data-testid="boot-layer" role="status" aria-live="polite" aria-busy="true">
      <div className="boot-panel">
        <span className="boot-mark">{siteConfig.logo}</span>
        <div className="boot-ring" aria-hidden="true" />
        <p>载入工作区</p>
        <div className="boot-meter"><span /></div>
        <div className="boot-skeleton" aria-hidden="true">
          <i /><i /><i />
        </div>
      </div>
    </div>
  )
}
