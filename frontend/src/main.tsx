import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { APP_VERSION } from './version.ts'

console.info(
  `%cPata y Perro PMS — v${APP_VERSION}`,
  'font-weight:bold;color:#0f766e'
)

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
