import type { ButtonHTMLAttributes, ReactNode } from 'react'
import Button from './Button'

export default function IconButton({ tip, className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tip: string; children: ReactNode }) {
  return <Button icon={children} iconOnly className={`ui-tooltip ${className}`.trim()} data-tip={tip} aria-label={tip} {...props}>{tip}</Button>
}
