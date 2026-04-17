import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { AppShell } from '../components/AppShell'

interface CompanySettings {
  id: string
  company_name: string | null
  logo_path: string | null
  factoring_email: string | null
}

const BUCKET = 'branding'

export function Settings() {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [form, setForm] = useState({ company_name: '', factoring_email: '' })
  const [dirty, setDirty] = useState(false)

  const { data: settings } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
      if (error) throw error
      return data as CompanySettings | null
    },
  })

  useEffect(() => {
    if (!settings) return
    setForm({
      company_name: settings.company_name ?? '',
      factoring_email: settings.factoring_email ?? '',
    })
    setDirty(false)
    if (settings.logo_path) {
      supabase.storage.from(BUCKET).createSignedUrl(settings.logo_path, 3600).then(({ data }) => {
        if (data?.signedUrl) setLogoUrl(data.signedUrl)
      })
    } else {
      setLogoUrl(null)
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!settings) return
      const { error } = await supabase.from('company_settings').update({
        company_name: form.company_name || null,
        factoring_email: form.factoring_email || null,
        updated_at: new Date().toISOString(),
      }).eq('id', settings.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-settings'] })
      setDirty(false)
    },
    onError: (e: Error) => setError(e.message),
  })

  const uploadLogo = async (file: File) => {
    if (!settings) return
    setError(null)
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() ?? 'png'
      const path = `logo-${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      })
      if (upErr) throw upErr
      if (settings.logo_path) {
        await supabase.storage.from(BUCKET).remove([settings.logo_path])
      }
      const { error: dbErr } = await supabase.from('company_settings').update({
        logo_path: path,
        updated_at: new Date().toISOString(),
      }).eq('id', settings.id)
      if (dbErr) throw dbErr
      qc.invalidateQueries({ queryKey: ['company-settings'] })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const removeLogo = async () => {
    if (!settings?.logo_path) return
    if (!confirm('Remove the logo?')) return
    setError(null)
    try {
      await supabase.storage.from(BUCKET).remove([settings.logo_path])
      const { error } = await supabase.from('company_settings').update({
        logo_path: null,
        updated_at: new Date().toISOString(),
      }).eq('id', settings.id)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['company-settings'] })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const set = (k: keyof typeof form, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    setDirty(true)
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-400 mt-0.5">Company branding and defaults</p>
      </div>

      <div className="max-w-2xl space-y-6">
        <section className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Company logo</h2>
          <p className="text-xs text-gray-500 mb-4">Shown in the header and on generated invoices.</p>

          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Company logo" className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-xs text-gray-400">No logo</span>
              )}
            </div>
            <div className="flex-1">
              <label className="inline-flex items-center px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                {uploading ? 'Uploading…' : logoUrl ? 'Replace' : 'Upload'}
                <input type="file" accept="image/*" className="hidden" disabled={uploading}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) uploadLogo(f)
                  }} />
              </label>
              {logoUrl && (
                <button onClick={removeLogo}
                  className="ml-2 inline-flex items-center px-3 py-1.5 text-sm rounded-lg text-red-600 border border-red-200 hover:bg-red-50 cursor-pointer">
                  Remove
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Company info</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company Name</label>
              <input value={form.company_name} onChange={e => set('company_name', e.target.value)}
                placeholder="Driven Transportation Inc."
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Factoring Company Email</label>
              <input type="email" value={form.factoring_email} onChange={e => set('factoring_email', e.target.value)}
                placeholder="driventransportation@fleetdocs.com"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#c8410a]/20 focus:border-[#c8410a]" />
              <p className="text-xs text-gray-400 mt-1">Used by the "Email to factoring" button in the driver app.</p>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-5">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!dirty || saveMutation.isPending}
              className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 cursor-pointer"
              style={{ background: '#c8410a' }}>
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </section>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      </div>
    </AppShell>
  )
}
