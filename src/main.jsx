import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './theme.css'
import './i18n.js'
import App from './App.jsx'
import './forms.css'
import { registerServiceWorker } from "./services/notificationService"

registerServiceWorker().catch(() => {})

// Runtime diagnostics: prints which Supabase project this exact bundle talks
// to, so a stale container/CDN copy can never masquerade as current code.
try {
  console.info(`[DigiMenu] ${import.meta.env.MODE} build · backend ${String(import.meta.env.VITE_SUPABASE_URL || "")}`)
} catch {}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

