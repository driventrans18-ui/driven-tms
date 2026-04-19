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
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-[#0b0b0f] relative overflow-hidden w-full px-6"
      style={{ paddingTop: 'env(safe-area-inset-top, 24px)', paddingBottom: 'env(safe-area-inset-bottom, 24px)' }}
    >
      {/* Soft brand-tinted glows behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full blur-3xl opacity-40"
        style={{ background: 'radial-gradient(circle, var(--color-brand-500) 0%, transparent 70%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -right-24 w-80 h-80 rounded-full blur-3xl opacity-30"
        style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 70%)' }}
      />

      {/* Glass card */}
      <form
        onSubmit={onSubmit}
        className="relative z-10 w-full max-w-sm rounded-3xl bg-gradient-to-b from-white/10 to-white/[0.02] backdrop-blur-xl border border-white/10 shadow-2xl p-8 flex flex-col items-center"
      >
        {/* Brand mark */}
        <div
          className="flex items-center justify-center w-14 h-14 rounded-2xl mb-5 shadow-lg text-white text-2xl font-bold"
          style={{ background: 'var(--color-brand-500)' }}
        >
          D
        </div>
        <h2 className="text-2xl font-semibold text-white text-center leading-tight">
          Driven Driver
        </h2>
        <p className="text-sm text-gray-400 mt-1 mb-6 text-center">
          Sign in to continue
        </p>

        <div className="flex flex-col w-full gap-3">
          <input
            placeholder="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-5 py-3.5 rounded-xl bg-white/10 text-white placeholder-gray-400 text-sm border border-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent"
          />
          <input
            placeholder="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-5 py-3.5 rounded-xl bg-white/10 text-white placeholder-gray-400 text-sm border border-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)] focus:border-transparent"
          />
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <hr className="w-full my-5 border-white/10" />

        <button
          type="submit"
          disabled={busy || !email || !password}
          className="w-full text-white font-semibold px-5 py-3.5 rounded-full shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed text-sm cursor-pointer"
          style={{ background: 'var(--color-brand-500)' }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-xs text-gray-500 text-center mt-5 leading-relaxed">
          Don't have an account? Ask dispatch to add you in the web TMS.
        </p>
      </form>
    </div>
  )
}
