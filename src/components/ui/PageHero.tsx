import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import '../../styles/components/page-hero.css'

type PageHeroProps = {
  eyebrow: string
  title: string
  subtitle: string
  description?: string
  stats: { value: number | string; label: string }[]
  icon: LucideIcon
  code: string
  caption: string
  note?: ReactNode
}

export default function PageHero({ eyebrow, title, subtitle, description, stats, icon: Icon, code, caption, note }: PageHeroProps) {
  return (
    <section className="page-hero" aria-label={`${title}概览`}>
      <div className="page-hero-copy">
        <p className="atlas-kicker">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-hero-subtitle">{subtitle}</p>
        {description && <p className="page-hero-description">{description}</p>}
        <div className="page-hero-summary">
          <dl className="page-hero-stats">{stats.map(({ value, label }) => <div key={label}><dt>{label}</dt><dd>{typeof value === 'number' ? String(value).padStart(2, '0') : value}</dd></div>)}</dl>
          {note && <div className="page-hero-note">{note}</div>}
        </div>
      </div>
      <div className="page-hero-emblem" aria-hidden="true">
        <Icon size={70} strokeWidth={1} />
        <span>{code}</span>
        <small>{caption}</small>
      </div>
    </section>
  )
}
