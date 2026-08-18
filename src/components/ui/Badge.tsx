import type { HTMLAttributes } from 'react'

type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'accent' | 'success' }

export default function Badge({ tone = 'neutral', className = '', ...props }: BadgeProps) {
  return <span className={`ui-badge ui-badge-${tone} ${className}`.trim()} {...props} />
}
