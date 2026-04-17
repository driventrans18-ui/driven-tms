import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.driventransportation.driver',
  appName: 'Driven Driver',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
  },
  plugins: {
    LocalNotifications: {
      iconColor: '#c8410a',
    },
  },
}

export default config
