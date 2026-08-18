import { forwardRef, type InputHTMLAttributes } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement> & { glass?: boolean }

const Input = forwardRef<HTMLInputElement, InputProps>(({ className = '', glass = false, ...props }, ref) => (
  <input ref={ref} className={`ui-input ${glass ? 'ui-input-glass' : ''} ${className}`.trim()} {...props} />
))
Input.displayName = 'Input'
export default Input
