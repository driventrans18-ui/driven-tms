// Shared helpers for tax / regulatory filing deadlines.

export type FilingKind = 'ifta' | '2290' | 'ucr' | 'other'

export interface TaxDeadline {
  id: string
  kind: FilingKind
  period: string
  due_date: string
  filed_on: string | null
  notes: string | null
}

export const KIND_LABEL: Record<FilingKind, string> = {
  ifta:  'IFTA',
  '2290':'Form 2290',
  ucr:   'UCR',
  other: 'Other',
}

export function daysUntil(iso: string) {
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function severity(filed_on: string | null, due_date: string):
  'filed' | 'overdue' | 'due-soon' | 'upcoming' {
  if (filed_on) return 'filed'
  const n = daysUntil(due_date)
  if (n < 0) return 'overdue'
  if (n <= 30) return 'due-soon'
  return 'upcoming'
}

export function severityClasses(s: ReturnType<typeof severity>) {
  return s === 'overdue'   ? 'bg-red-50 border-red-200 text-red-700'
       : s === 'due-soon'  ? 'bg-orange-50 border-orange-200 text-orange-800'
       : s === 'filed'     ? 'bg-green-50 border-green-200 text-green-700'
       :                     'bg-gray-50 border-gray-200 text-gray-700'
}
