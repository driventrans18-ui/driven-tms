import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface Driver {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  email: string | null
  cdl_class: string | null
  status: string | null
  user_id: string | null
}

// Looks up the driver record linked to the signed-in auth user.
// Matches first by user_id, then falls back to email so a freshly signed-up
// account can pick up an existing driver row created via the web app.
export function useDriver(userId: string | undefined, email: string | undefined) {
  return useQuery({
    enabled: Boolean(userId),
    queryKey: ['me-driver', userId, email],
    queryFn: async (): Promise<Driver | null> => {
      if (!userId) return null
      const byId = await supabase.from('drivers').select('*').eq('user_id', userId).maybeSingle()
      if (byId.error) throw byId.error
      if (byId.data) return byId.data as Driver

      if (!email) return null
      const byEmail = await supabase.from('drivers').select('*').eq('email', email).maybeSingle()
      if (byEmail.error) throw byEmail.error
      if (byEmail.data) {
        // Link for next time.
        await supabase.from('drivers').update({ user_id: userId }).eq('id', (byEmail.data as Driver).id)
        return { ...(byEmail.data as Driver), user_id: userId }
      }
      return null
    },
  })
}
