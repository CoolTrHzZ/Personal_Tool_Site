import { cloneElement, useId, type AriaAttributes, type ReactElement } from 'react'

type FieldControlProps = AriaAttributes & { id?: string; required?: boolean }

export default function FormField({ label, description, error, required, children }: { label: string; description?: string; error?: string; required?: boolean; children: ReactElement<FieldControlProps> }) {
  const generatedId = useId()
  const controlId = children.props.id || `${generatedId}-control`
  const hintId = `${generatedId}-hint`
  const errorId = `${generatedId}-error`
  const isRequired = required ?? children.props.required
  const describedBy = [children.props['aria-describedby'], description && hintId, error && errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className="ui-field">
      <label className="ui-field-label" htmlFor={controlId}>{label}{isRequired && <span className="ui-field-required" aria-hidden="true"> *</span>}</label>
      {cloneElement(children, { id: controlId, required: isRequired, 'aria-describedby': describedBy, 'aria-invalid': error ? true : children.props['aria-invalid'] })}
      {description && <span id={hintId} className="ui-field-hint">{description}</span>}
      {error && <span id={errorId} className="ui-field-error" role="alert">{error}</span>}
    </div>
  )
}
