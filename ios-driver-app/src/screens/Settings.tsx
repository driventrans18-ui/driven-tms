import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme, type ThemeMode } from '../hooks/useTheme'
import { supabase } from '../lib/supabase'

// Settings sheet — full-screen overlay that respects safe-area insets.
// Hosts the appearance picker and the company-info editor that feeds
// the "From" block of generated invoices.

interface CompanyInfo {
  company_name: string | null
  address:      string | null
  city:         string | null
  state:        string | null
  zip:          string | null
  phone:        string | null
  email:        string | null
  mc_number:    string | null
  dot_number:   string | null
  ein:          string | null
}

const EMPTY_COMPANY: CompanyInfo = {
  company_name: '', address: '', city: '', state: '', zip: '',
  phone: '', email: '', mc_number: '', dot_number: '', ein: '',
}

export function Settings({ onClose }: { onClose: () => void }) {
  const { mode, setTheme } = useTheme()

  const options: Array<{ key: ThemeMode; label: string; hint: string }> = [
    { key: 'system', label: 'System', hint: 'Match iOS appearance' },
    { key: 'light',  label: 'Light',  hint: 'Always light' },
    { key: 'dark',   label: 'Dark',   hint: 'Always dark' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'var(--color-surface-bg)' }}
    >
      <header
        className="px-4 pb-3 flex items-center justify-between shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0) + 8px)' }}
      >
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <button
          onClick={onClose}
          className="text-base font-medium cursor-pointer"
          style={{ color: 'var(--color-brand-500)' }}
        >
          Done
        </button>
      </header>

      <main
        className="flex-1 overflow-y-auto px-4 space-y-5"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0) + 40px)' }}
      >
        <CompanyInfoSection />

        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Appearance</h2>
          <div className="bg-white rounded-2xl divide-y divide-gray-100">
            {options.map(opt => {
              const selected = mode === opt.key
              return (
                <button
                  key={opt.key}
                  onClick={() => setTheme(opt.key)}
                  className="w-full flex items-center justify-between px-5 py-3.5 text-left cursor-pointer active:bg-gray-50"
                >
                  <span>
                    <span className="block text-base font-medium text-gray-900">{opt.label}</span>
                    <span className="block text-xs text-gray-500 mt-0.5">{opt.hint}</span>
                  </span>
                  {selected && (
                    <svg
                      viewBox="0 0 24 24" width="20" height="20" fill="none"
                      stroke="var(--color-brand-500)" strokeWidth="2.4"
                      strokeLinecap="round" strokeLinejoin="round" aria-hidden
                    >
                      <path d="M5 12l5 5 9-11" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-gray-500 px-1 mt-2">
            System follows your iPhone's Light / Dark setting and switches automatically.
          </p>
        </section>
      </main>
    </div>
  )
}

// Editable company-info block. Mirrors every field on the singleton
// company_settings row that the invoice PDF reads, so changing a value
// here flows straight into the next generated invoice.
function CompanyInfoSection() {
  const qc = useQueryClient()
  const { data: row } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_settings')
        .select('company_name, address, city, state, zip, phone, email, mc_number, dot_number, ein')
        .limit(1).maybeSingle()
      if (error) throw error
      return (data ?? EMPTY_COMPANY) as CompanyInfo
    },
  })

  const [form, setForm]   = useState<CompanyInfo>(EMPTY_COMPANY)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  // Re-sync the editable form whenever the underlying row arrives or
  // changes (e.g. a separate device updates settings while this sheet
  // is open).
  useEffect(() => { if (row) setForm({ ...EMPTY_COMPANY, ...row }) }, [row])

  const set = (k: keyof CompanyInfo, v: string) =>
    setForm(f => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        company_name: form.company_name?.trim() || null,
        address:      form.address?.trim()      || null,
        city:         form.city?.trim()         || null,
        state:        form.state?.trim()        || null,
        zip:          form.zip?.trim()          || null,
        phone:        form.phone?.trim()        || null,
        email:        form.email?.trim()        || null,
        mc_number:    form.mc_number?.trim()    || null,
        dot_number:   form.dot_number?.trim()   || null,
        ein:          form.ein?.trim()          || null,
      }
      // The table stores a single row; update the only one if it
      // exists, otherwise insert a fresh row. Filter `id is not null`
      // is a no-op match-all that keeps the Supabase client happy
      // about not having an explicit equality clause.
      const { data: existing } = await supabase.from('company_settings').select('id').limit(1).maybeSingle()
      const { error } = existing
        ? await supabase.from('company_settings').update(payload).eq('id', (existing as { id: string }).id)
        : await supabase.from('company_settings').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-settings'] })
      setSavedAt(Date.now())
    },
  })

  return (
    <section>
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Company Info</h2>
      <p className="text-xs text-gray-500 px-1 mb-2">
        Shown in the &ldquo;From&rdquo; block of every invoice you generate.
      </p>
      <div className="bg-white rounded-2xl p-4 space-y-3">
        <Field label="Company name" value={form.company_name ?? ''} onChange={v => set('company_name', v)} placeholder="Driven Transportation Inc." />
        <Field label="Email"        value={form.email        ?? ''} onChange={v => set('email',        v)} placeholder="billing@example.com" type="email" />
        <Field label="Phone"        value={form.phone        ?? ''} onChange={v => set('phone',        v)} placeholder="(585) 555-0100"      type="tel"   />
        <Field label="Address"      value={form.address      ?? ''} onChange={v => set('address',      v)} placeholder="123 Main St" />
        <div className="grid grid-cols-3 gap-2">
          <Field label="City"  value={form.city  ?? ''} onChange={v => set('city',  v)} placeholder="Webster" />
          <Field label="State" value={form.state ?? ''} onChange={v => set('state', v)} placeholder="NY" />
          <Field label="ZIP"   value={form.zip   ?? ''} onChange={v => set('zip',   v)} placeholder="14580" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="MC#"  value={form.mc_number  ?? ''} onChange={v => set('mc_number',  v)} placeholder="090949" />
          <Field label="DOT#" value={form.dot_number ?? ''} onChange={v => set('dot_number', v)} placeholder="3126831" />
        </div>
        <Field label="EIN" value={form.ein ?? ''} onChange={v => set('ein', v)} placeholder="12-3456789" />

        {save.isError && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {(save.error as Error).message}
          </p>
        )}

        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="w-full py-3 rounded-xl text-white text-base font-semibold disabled:opacity-50 cursor-pointer mt-1"
          style={{ background: 'var(--color-brand-500)' }}
        >
          {save.isPending ? 'Saving…' : savedAt ? 'Saved ✓ — Save again' : 'Save changes'}
        </button>
      </div>
    </section>
  )
}

function Field({ label, value, onChange, placeholder, type }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      <input
        type={type ?? 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
      />
    </label>
  )
}
