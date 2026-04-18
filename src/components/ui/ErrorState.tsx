import type { ReactNode } from 'react'
import { Button } from './Button'

interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
  action?: ReactNode
  className?: string
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  action,
  className = '',
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center text-center px-6 py-10 rounded-lg bg-danger-100/60 ${className}`}
    >
      <div className="w-10 h-10 mb-3 rounded-full bg-danger-100 text-danger-500 flex items-center justify-center">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v5" />
          <circle cx="12" cy="16" r="0.5" fill="currentColor" />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 text-sm text-text-secondary max-w-sm">{message}</p>
      {(onRetry || action) && (
        <div className="mt-4 flex gap-2">
          {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>}
          {action}
        </div>
      )}
    </div>
  )
}

// Inline variant for form-level or banner errors
export function InlineError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-xs text-danger-500 bg-danger-100/50 rounded-md px-3 py-2">
      {message}
    </p>
  )
}
