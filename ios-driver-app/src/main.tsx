import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Capacitor } from '@capacitor/core'
import { App } from './App'
import { installKeyboardTracking } from './components/ui'
import { bootstrapTheme } from './hooks/useTheme'
import './index.css'

// Apply the stored theme before React paints so there's no flash of light
// mode when the user chose dark.
bootstrapTheme()
installKeyboardTracking()

// Make the native status bar overlay the webview so the app background
// extends under the dynamic island instead of leaving an opaque strip.
if (Capacitor.isNativePlatform()) {
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {})
    StatusBar.setStyle({ style: Style.Default }).catch(() => {})
  }).catch(() => {})
}

const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
