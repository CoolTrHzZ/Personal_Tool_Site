import type { ReactNode } from 'react'

export default function FormField({ label, description, error, required, children }: { label: string; description?: string; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="ui-field">
      <span className="ui-field-label">{label}{required ? ' *' : ''}</span>
      {children}
      {description && <span className="ui-field-hint">{description}</span>}
      {error && <span className="ui-field-error">{error}</span>}
    </label>
  )
}
