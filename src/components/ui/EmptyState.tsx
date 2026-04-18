import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  body?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, body, icon, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 py-12 ${className}`}>
      {icon && <div className="text-text-tertiary mb-3">{icon}</div>}
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      {body && <p className="mt-1 text-sm text-text-secondary max-w-sm">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
