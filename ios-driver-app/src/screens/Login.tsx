import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(error.message)
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f2f2f7] px-6" style={{ paddingTop: 'env(safe-area-inset-top, 24px)' }}>
      <div className="flex-1 flex flex-col justify-center max-w-sm w-full mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-xl font-bold" style={{ background: 'var(--color-brand-500)' }}>D</span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Driven Driver</h1>
            <p className="text-sm text-gray-500">Sign in to continue</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="email"
            placeholder="Email" className="w-full px-4 py-3.5 rounded-xl bg-white text-base border border-gray-200 focus:outline-none focus:border-[var(--color-brand-500)]" />
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="current-password"
            placeholder="Password" className="w-full px-4 py-3.5 rounded-xl bg-white text-base border border-gray-200 focus:outline-none focus:border-[var(--color-brand-500)]" />
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button type="submit" disabled={busy || !email || !password}
            className="w-full py-3.5 rounded-xl text-white text-base font-semibold disabled:opacity-50 cursor-pointer"
            style={{ background: 'var(--color-brand-500)' }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
