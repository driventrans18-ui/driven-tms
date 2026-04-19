import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.driventransportation.driver',
  appName: 'Driven Driver',
  webDir: 'dist',
  ios: {
    // 'never' lets the webview extend edge-to-edge so the app background
    // runs under the dynamic island and home indicator. The React shell uses
    // env(safe-area-inset-*) to keep content clear of those regions.
    contentInset: 'never',
    // Pin the native window background so the status bar and home-indicator
    // regions never flash black during load or while the keyboard animates.
    // Matches --color-surface-bg in light mode; dark mode repaints via CSS.
    backgroundColor: '#F4F6F8',
  },
  plugins: {
    LocalNotifications: {
      iconColor: '#c8410a',
    },
    StatusBar: {
      // Transparent status bar so the app background shows through at the top.
      overlaysWebView: true,
      style: 'DEFAULT',
    },
  },
}

export default config
