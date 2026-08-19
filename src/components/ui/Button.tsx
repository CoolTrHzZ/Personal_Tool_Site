import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; icon?: ReactNode; iconOnly?: boolean; loading?: boolean }

export default function Button({ variant = 'ghost', size = 'md', className = '', icon, iconOnly = false, loading = false, children, disabled, ...props }: ButtonProps) {
  return (
    <button className={`ui-button ui-button-${variant} ui-button-${size} ${iconOnly ? 'ui-button-icon' : ''} ${className}`.trim()} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {icon}{iconOnly ? <span className="sr-only">{children}</span> : <>{loading ? '… ' : ''}{children}</>}
    </button>
  )
}
