import type { SelectHTMLAttributes, ReactNode } from 'react'

export default function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return <select className={`ui-select ${className}`.trim()} {...props}>{children}</select>
}
