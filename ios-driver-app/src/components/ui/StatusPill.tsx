import type { ReactNode } from 'react'

export type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand'

const VARIANTS: Record<StatusVariant, string> = {
  success: 'bg-success-100 text-success-500',
  warning: 'bg-warning-100 text-warning-500',
  danger:  'bg-danger-100 text-danger-500',
  info:    'bg-info-100 text-info-500',
  neutral: 'bg-surface-muted text-text-secondary',
  brand:   'bg-brand-100 text-brand-600',
}

interface StatusPillProps {
  variant?: StatusVariant
  children: ReactNode
  icon?: ReactNode
  className?: string
}

export function StatusPill({ variant = 'neutral', children, icon, className = '' }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-medium whitespace-nowrap ${VARIANTS[variant]} ${className}`}
    >
      {icon}
      {children}
    </span>
  )
}

export function loadStatusVariant(status: string | null | undefined): StatusVariant {
  switch (status) {
    case 'Delivered':  return 'success'
    case 'In Transit': return 'info'
    case 'Assigned':   return 'warning'
    case 'Pending':    return 'neutral'
    case 'Cancelled':  return 'danger'
    default:           return 'neutral'
  }
}
