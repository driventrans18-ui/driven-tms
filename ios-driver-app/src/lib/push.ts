// Wires @capacitor/push-notifications → Supabase device_tokens.
// On first launch after a session is established, we:
//   1. Request permission (APNs on iOS).
//   2. Register with APNs; a 'registration' event fires with the hex device token.
//   3. Upsert that token into `device_tokens` keyed by (user_id, token).
//
// Safe to call on the web / simulator — it silently returns if the plugin
// isn't available or the user declines.

import { supabase } from './supabase'

let registered = false

export async function registerPushForUser(userId: string): Promise<void> {
  if (registered) return
  registered = true

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    const perm = await PushNotifications.checkPermissions()
    if (perm.receive !== 'granted') {
      const req = await PushNotifications.requestPermissions()
      if (req.receive !== 'granted') return
    }

    // Fires once APNs hands us a token.
    PushNotifications.addListener('registration', async token => {
      try {
        await supabase.from('device_tokens').upsert(
          { user_id: userId, platform: 'ios', token: token.value, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,token' },
        )
      } catch (e) {
        console.error('device_tokens upsert failed', e)
      }
    })

    PushNotifications.addListener('registrationError', err => {
      console.error('push registration error', err)
    })

    await PushNotifications.register()
  } catch {
    // Plugin unavailable (web build / simulator without APNs setup).
  }
}
