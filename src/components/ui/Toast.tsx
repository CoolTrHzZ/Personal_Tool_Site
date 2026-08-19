import { createContext, useContext, useState, type ReactNode } from 'react'

const ToastContext = createContext<(message: string) => void>(() => undefined)
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; message: string }[]>([])
  const push = (message: string) => {
    const id = Date.now()
    setItems(current => [...current, { id, message }])
    setTimeout(() => setItems(current => current.filter(item => item.id !== id)), 3000)
  }
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="ui-toast-stack" aria-live="polite">{items.map(item => <div key={item.id} className="ui-toast">{item.message}</div>)}</div>
    </ToastContext.Provider>
  )
}
