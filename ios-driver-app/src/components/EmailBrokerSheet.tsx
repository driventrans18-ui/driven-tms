import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { draftBrokerEmail, type BrokerEmailIntent } from '../lib/ai'

// Bottom-sheet UI for drafting a broker email with Claude. The driver
// picks an intent, optionally adds free-text context, and hits
// "Draft with Claude". The returned subject + body show in editable
// fields; "Send via Mail" opens mailto: with everything pre-filled.
//
// Used from LoadSheet (Loads.tsx) and InvoiceSheet (Invoices.tsx).

interface IntentOption {
  key:   BrokerEmailIntent
  label: string
  hint:  string
}

const INTENTS: IntentOption[] = [
  { key: 'accept',           label: 'Accept load',          hint: 'Confirm terms in writing' },
  { key: 'detention',        label: 'Detention claim',      hint: 'Request detention pay' },
  { key: 'pod',              label: 'POD sent',             hint: 'Notify broker of delivery' },
  { key: 'payment_followup', label: 'Payment follow-up',    hint: 'Politely chase an invoice' },
  { key: 'rate_counter',     label: 'Counter rate',         hint: 'Counter an offered rate' },
  { key: 'generic',          label: 'Other',                hint: 'Free-form — describe in Context' },
]

// Pre-fill the intent when called from the Invoice flow (payment_followup
// is the only one that makes sense there). Otherwise leave it blank so the
// driver makes an explicit choice.
export function EmailBrokerSheet({ loadId, loadLabel, brokerName, initialIntent, onClose }: {
  loadId:        string
  loadLabel:     string
  brokerName:    string | null
  initialIntent?: BrokerEmailIntent
  onClose:       () => void
}) {
  const [intent, setIntent]   = useState<BrokerEmailIntent | null>(initialIntent ?? null)
  const [context, setContext] = useState('')
  const [draft, setDraft]     = useState<{ subject: string; body: string; brokerEmail: string | null } | null>(null)
  const [error, setError]     = useState<string | null>(null)

  const draftMut = useMutation({
    mutationFn: async () => {
      if (!intent) throw new Error('Pick an intent first')
      const { draft } = await draftBrokerEmail({ intent, loadId, extraContext: context || undefined })
      return draft
    },
    onSuccess: d => {
      setDraft({ subject: d.subject, body: d.body, brokerEmail: d.broker_email })
      setError(null)
    },
    onError: (e: Error) => setError(e.message),
  })

  // Open iOS Mail with the draft pre-filled. mailto: breaks around ~2000
  // chars on iOS, so clip defensively. Driver can paste the rest manually
  // if we truncate — rare given the edge function's 1400-char cap.
  function sendViaMail() {
    if (!draft) return
    const to = draft.brokerEmail ?? ''
    const subject = encodeURIComponent(draft.subject)
    const body    = encodeURIComponent(draft.body.slice(0, 1800))
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative bg-white w-full rounded-t-3xl p-6 max-h-[92vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-gray-900">Email broker</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 text-lg cursor-pointer">✕</button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          {loadLabel}{brokerName ? ` · ${brokerName}` : ''}
        </p>

        {/* Intent picker — grid of 6 small cards. Shown always, even after a
            draft renders, so the driver can regenerate with a different intent. */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {INTENTS.map(opt => {
            const on = intent === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => { setIntent(opt.key); setDraft(null); setError(null) }}
                className="rounded-xl border p-3 text-left cursor-pointer"
                style={on
                  ? { borderColor: 'var(--color-brand-500)', background: 'rgba(0, 168, 232, 0.08)' }
                  : { borderColor: 'var(--color-border-subtle)', background: 'white' }}
              >
                <span className="block text-sm font-semibold text-gray-900">{opt.label}</span>
                <span className="block text-[11px] text-gray-500 mt-0.5">{opt.hint}</span>
              </button>
            )
          })}
        </div>

        <label className="block mb-4">
          <span className="block text-xs font-medium text-gray-600 mb-1">Extra context (optional)</span>
          <textarea
            value={context}
            onChange={e => setContext(e.target.value)}
            rows={2}
            placeholder={intentPlaceholder(intent)}
            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
          />
        </label>

        <button
          onClick={() => draftMut.mutate()}
          disabled={!intent || draftMut.isPending}
          className="w-full py-3 rounded-xl text-white text-base font-semibold disabled:opacity-50 cursor-pointer mb-4"
          style={{ background: 'var(--color-brand-500)' }}
        >
          {draftMut.isPending ? 'Drafting…' : draft ? 'Re-draft' : 'Draft with Claude'}
        </button>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>
        )}

        {draft && (
          <div className="space-y-3">
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Subject</span>
              <input
                value={draft.subject}
                onChange={e => setDraft({ ...draft, subject: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">Body</span>
              <textarea
                value={draft.body}
                onChange={e => setDraft({ ...draft, body: e.target.value })}
                rows={10}
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm font-mono"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">To</span>
              <input
                value={draft.brokerEmail ?? ''}
                onChange={e => setDraft({ ...draft, brokerEmail: e.target.value || null })}
                placeholder="broker@example.com"
                type="email"
                className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
              />
            </label>
            <button
              onClick={sendViaMail}
              className="w-full py-3 rounded-xl text-white text-base font-semibold cursor-pointer"
              style={{ background: 'var(--color-brand-500)' }}
            >
              Send via Mail
            </button>
            <p className="text-[11px] text-gray-400 text-center">
              Opens iOS Mail with the draft pre-filled. You can tweak before sending.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// Nudge the driver toward the kind of detail Claude actually needs per
// intent. Empty context still produces a decent draft; extra detail
// makes it excellent.
function intentPlaceholder(intent: BrokerEmailIntent | null): string {
  switch (intent) {
    case 'detention':        return 'Held 3 hrs past appointment, lumper argument caused delay'
    case 'rate_counter':     return 'Deadhead 180 mi, fuel tight, need $3,600 all-in'
    case 'pod':              return 'Any load-specific notes (seal #, piece count, etc.)'
    case 'payment_followup': return 'Invoice is 10 days past due, still no ACH'
    case 'accept':           return 'Any special acceptance conditions (e.g. need updated rate con with lumper)'
    case 'generic':          return 'Describe what you want the email to say'
    default:                 return 'Anything extra Claude should mention?'
  }
}
