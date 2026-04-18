import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { bootstrapTheme } from './hooks/useTheme'
import './index.css'
import App from './App.tsx'

// Apply stored theme before React paints so dark mode doesn't flash light.
bootstrapTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
