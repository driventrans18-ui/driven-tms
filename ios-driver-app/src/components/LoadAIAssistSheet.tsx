import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  draftLoadMessage,
  analyzeLoad,
  type LoadMessageFormat,
  type LoadAnalysis,
  type LoadVerdict,
} from '../lib/ai'

// Bottom-sheet AI helper for a specific load. Three modes:
//   · Email — draft a broker email with subject/body ready for mailto:
//   · Notes — dispatch-style summary the driver can copy/paste anywhere
//   · Analyze — is this load worth running? RPM vs history, route, risks
//
// Invoked from Home.tsx near the active-load card. Keeps all three in
// one sheet so the driver can bounce between them without closing.

type Mode = 'email' | 'notes' | 'analyze'

export function LoadAIAssistSheet({ loadId, loadLabel, onClose }: {
  loadId:    string
  loadLabel: string
  onClose:   () => void
}) {
  const [mode, setMode] = useState<Mode>('analyze')

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative bg-white w-full rounded-t-3xl p-6 max-h-[92vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)' }}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-gray-900">✨ AI load assist</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 text-lg cursor-pointer">✕</button>
        </div>
        <p className="text-xs text-gray-500 mb-4">{loadLabel}</p>

        <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded-xl p-1 mb-4">
          {(['analyze', 'email', 'notes'] as Mode[]).map(m => {
            const on = mode === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className="py-2 rounded-lg text-sm font-semibold cursor-pointer"
                style={on ? { background: 'var(--color-brand-500)', color: 'white' } : { color: '#6b7280' }}
              >
                {m === 'analyze' ? 'Good load?' : m === 'email' ? 'Email' : 'Notes'}
              </button>
            )
          })}
        </div>

        {mode === 'analyze' && <AnalyzePane loadId={loadId} />}
        {mode === 'email'   && <DraftPane loadId={loadId} format="email" />}
        {mode === 'notes'   && <DraftPane loadId={loadId} format="notes" />}
      </div>
    </div>
  )
}

// ── Analyze pane ────────────────────────────────────────────────────────────

function AnalyzePane({ loadId }: { loadId: string }) {
  const [analysis, setAnalysis] = useState<LoadAnalysis | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const run = useMutation({
    mutationFn: () => analyzeLoad(loadId),
    onSuccess: ({ analysis }) => { setAnalysis(analysis); setError(null) },
    onError:   (e: Error) => setError(e.message),
  })

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Ask Claude whether this load is worth running. Scores $/mile against
        your recent history, suggests an interstate route, and flags risks.
      </p>

      <button
        onClick={() => run.mutate()}
        disabled={run.isPending}
        className="w-full py-3 rounded-xl text-white text-base font-semibold disabled:opacity-50 cursor-pointer"
        style={{ background: 'var(--color-brand-500)' }}
      >
        {run.isPending ? 'Thinking…' : analysis ? 'Re-analyze' : 'Analyze this load'}
      </button>

      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {analysis && <AnalysisCard a={analysis} />}
    </div>
  )
}

const VERDICT_TONE: Record<LoadVerdict, { bg: string; border: string; text: string; label: string }> = {
  good: { bg: 'rgb(220, 252, 231)', border: '#86efac', text: '#14532d', label: 'Good load' },
  fair: { bg: 'rgb(254, 243, 199)', border: '#fcd34d', text: '#92400e', label: 'Fair load' },
  bad:  { bg: 'rgb(254, 226, 226)', border: '#fca5a5', text: '#991b1b', label: 'Pass'      },
}

function AnalysisCard({ a }: { a: LoadAnalysis }) {
  const tone = VERDICT_TONE[a.verdict] ?? VERDICT_TONE.fair
  return (
    <div className="space-y-3">
      <div className="rounded-xl p-4"
        style={{ background: tone.bg, border: `1px solid ${tone.border}`, color: tone.text }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-bold uppercase tracking-wide">{tone.label}</span>
          {a.loaded_rpm != null && (
            <span className="text-xs font-mono opacity-80">
              ${a.loaded_rpm.toFixed(2)}/mi loaded
            </span>
          )}
        </div>
        <p className="text-sm">{a.summary}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <RpmCell label="All-in $/mi"    value={a.rpm} />
        <RpmCell label="Loaded $/mi"    value={a.loaded_rpm} />
        <RpmCell label="Your avg $/mi"  value={a.reference_rpm} />
      </div>

      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Route</h3>
        <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-900">
          <p className="font-medium">{a.route.summary}</p>
          <p className="text-xs text-gray-500 mt-1">
            {a.route.distance_mi != null ? `${a.route.distance_mi.toLocaleString()} mi` : '—'}
            {a.route.drive_hours != null ? ` · ~${a.route.drive_hours}h driving` : ''}
          </p>
          {a.route.stops.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {a.route.stops.map((s, i) => (
                <li key={i} className="text-xs text-gray-600">• {s}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {a.pros.length > 0 && <BulletList title="Pros" items={a.pros} accent="#14532d" />}
      {a.cons.length > 0 && <BulletList title="Cons" items={a.cons} accent="#991b1b" />}
      {a.risks.length > 0 && <BulletList title="Risks" items={a.risks} accent="#92400e" />}

      <section className="bg-gray-50 rounded-xl p-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Recommendation</p>
        <p className="text-sm text-gray-900 font-medium">{a.recommendation}</p>
      </section>
    </div>
  )
}

function RpmCell({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="bg-gray-50 rounded-xl p-2 text-center">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-base font-bold text-gray-900 mt-0.5 font-mono">
        {value != null ? `$${value.toFixed(2)}` : '—'}
      </p>
    </div>
  )
}

function BulletList({ title, items, accent }: { title: string; items: string[]; accent: string }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: accent }}>
        {title}
      </h3>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-gray-800">• {item}</li>
        ))}
      </ul>
    </section>
  )
}

// ── Email / Notes draft pane ────────────────────────────────────────────────

function DraftPane({ loadId, format }: { loadId: string; format: LoadMessageFormat }) {
  const [context, setContext] = useState('')
  const [draft, setDraft]     = useState<
    { subject: string | null; body: string | null; notes: string | null; brokerEmail: string | null } | null
  >(null)
  const [error, setError]     = useState<string | null>(null)
  const [copied, setCopied]   = useState(false)

  const run = useMutation({
    mutationFn: () => draftLoadMessage({ loadId, format, extraContext: context || undefined }),
    onSuccess: ({ draft: d }) => {
      setDraft({ subject: d.subject, body: d.body, notes: d.notes, brokerEmail: d.broker_email })
      setError(null)
    },
    onError: (e: Error) => setError(e.message),
  })

  function sendViaMail() {
    if (!draft || format !== 'email') return
    const to      = draft.brokerEmail ?? ''
    const subject = encodeURIComponent(draft.subject ?? '')
    const body    = encodeURIComponent((draft.body ?? '').slice(0, 1800))
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`
  }

  async function copyNotes() {
    if (!draft?.notes) return
    try {
      await navigator.clipboard.writeText(draft.notes)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Copy failed — select and copy manually.')
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        {format === 'email'
          ? 'Draft a professional email to the broker about this load.'
          : 'Generate a compact dispatch-style summary to paste into a log or SMS.'}
      </p>

      <label className="block">
        <span className="block text-xs font-medium text-gray-600 mb-1">Extra context (optional)</span>
        <textarea
          value={context}
          onChange={e => setContext(e.target.value)}
          rows={2}
          placeholder={format === 'email'
            ? 'Anything specific — e.g. "counter at $3,200, deadhead 200mi"'
            : 'Anything to highlight — e.g. "dock appt only after 14:00"'}
          className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
        />
      </label>

      <button
        onClick={() => run.mutate()}
        disabled={run.isPending}
        className="w-full py-3 rounded-xl text-white text-base font-semibold disabled:opacity-50 cursor-pointer"
        style={{ background: 'var(--color-brand-500)' }}
      >
        {run.isPending ? 'Drafting…' : draft ? 'Re-draft' : `Draft ${format === 'email' ? 'email' : 'notes'}`}
      </button>

      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {draft && format === 'email' && (
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">Subject</span>
            <input
              value={draft.subject ?? ''}
              onChange={e => setDraft({ ...draft, subject: e.target.value })}
              className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-base"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">Body</span>
            <textarea
              value={draft.body ?? ''}
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
        </div>
      )}

      {draft && format === 'notes' && (
        <div className="space-y-2">
          <textarea
            value={draft.notes ?? ''}
            onChange={e => setDraft({ ...draft, notes: e.target.value })}
            rows={8}
            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm font-mono"
          />
          <button
            onClick={copyNotes}
            className="w-full py-3 rounded-xl text-white text-base font-semibold cursor-pointer"
            style={{ background: 'var(--color-brand-500)' }}
          >
            {copied ? 'Copied ✓' : 'Copy notes'}
          </button>
        </div>
      )}
    </div>
  )
}
