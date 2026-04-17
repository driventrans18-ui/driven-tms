export interface LoadCardLoad {
  id: string
  load_number: string | null
  origin_city: string | null
  origin_state: string | null
  dest_city: string | null
  dest_state: string | null
  rate: number | null
  miles: number | null
  status: string
  eta: string | null
  load_type: string | null
}

const STATUS_COLORS: Record<string, string> = {
  Pending:     'bg-gray-200 text-gray-700',
  Assigned:    'bg-orange-100 text-orange-700',
  'In Transit':'bg-blue-100 text-blue-700',
  Delivered:   'bg-green-100 text-green-700',
}

function routeStr(city: string | null, state: string | null) {
  return [city, state].filter(Boolean).join(', ') || '—'
}

export function LoadCard({ load, onTap }: { load: LoadCardLoad; onTap?: () => void }) {
  const cls = STATUS_COLORS[load.status] ?? 'bg-gray-200 text-gray-700'
  return (
    <button onClick={onTap}
      className="w-full text-left bg-white rounded-2xl p-4 shadow-sm active:bg-gray-50 cursor-pointer">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-400 tracking-wide">
          {load.load_number || `#${load.id.slice(0, 8)}`}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{load.status}</span>
      </div>
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center pt-1">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
          <span className="w-px h-5 bg-gray-200 my-0.5" />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#c8410a' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base text-gray-900 font-semibold truncate">{routeStr(load.origin_city, load.origin_state)}</p>
          <p className="text-base text-gray-900 font-semibold truncate mt-1">{routeStr(load.dest_city, load.dest_state)}</p>
        </div>
      </div>
      <div className="flex items-baseline gap-4 mt-3 text-sm text-gray-500">
        {load.rate != null && <span className="text-gray-900 font-semibold text-base">${load.rate.toLocaleString()}</span>}
        {load.miles != null && <span>{load.miles.toLocaleString()} mi</span>}
        {load.load_type && <span>{load.load_type}</span>}
      </div>
    </button>
  )
}
