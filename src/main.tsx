import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './app/App'
import './styles.css'

createRoot(document.getElementById('root')!).render(<HashRouter><App /></HashRouter>)
