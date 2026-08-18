import { forwardRef, type InputHTMLAttributes } from 'react'

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className = '', ...props }, ref) => <input ref={ref} className={`ui-input ${className}`.trim()} {...props} />)
Input.displayName = 'Input'
export default Input
