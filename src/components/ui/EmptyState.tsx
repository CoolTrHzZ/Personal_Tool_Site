import type { ReactNode } from 'react'

export default function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="ui-empty"><h2>{title}</h2>{children}</div>
}
