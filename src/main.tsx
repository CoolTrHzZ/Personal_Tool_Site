import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './app/App'
import './styles.css'

// Keep URL-driven filters synchronous so consecutive edits use the latest parameters.
createRoot(document.getElementById('root')!).render(<HashRouter useTransitions={false}><App /></HashRouter>)
