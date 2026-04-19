import { useTheme, type ThemeMode } from '../hooks/useTheme'

// Settings sheet — appears above the rest of the app as a full-screen
// overlay so it respects the safe-area insets. Currently only hosts the
// Appearance picker; intended to grow (push notifications, caching,
// account) without churning the Profile screen.

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
      style={{ paddingTop: 'env(safe-area-inset-top, 0)', background: 'var(--color-surface-bg)' }}
    >
      <header className="px-4 pt-4 pb-3 flex items-center justify-between shrink-0">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <button
          onClick={onClose}
          className="text-base font-medium cursor-pointer"
          style={{ color: 'var(--color-brand-500)' }}
        >
          Done
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-10 space-y-5">
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
