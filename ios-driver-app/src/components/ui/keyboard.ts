import { Keyboard } from '@capacitor/keyboard'
import { Capacitor } from '@capacitor/core'

// Tracks the iOS software keyboard height and publishes it to CSS as
// `--kbd-height`, consumed by `.kbd-safe-bottom` in index.css.
export function installKeyboardTracking() {
  if (!Capacitor.isNativePlatform()) return

  const root = document.documentElement
  Keyboard.addListener('keyboardWillShow', (info) => {
    root.style.setProperty('--kbd-height', `${info.keyboardHeight}px`)
  })
  Keyboard.addListener('keyboardWillHide', () => {
    root.style.setProperty('--kbd-height', '0px')
  })
}
