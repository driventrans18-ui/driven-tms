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
  title = 'Something went wrong', message, onRetry, action, className = '',
}: ErrorStateProps) {
  return (
    <div role="alert" className={`flex flex-col items-center text-center px-6 py-8 rounded-lg bg-danger-100/60 ${className}`}>
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 text-sm text-text-secondary">{message}</p>
      {(onRetry || action) && (
        <div className="mt-3 flex gap-2">
          {onRetry && <Button variant="secondary" size="md" onClick={onRetry}>Retry</Button>}
          {action}
        </div>
      )}
    </div>
  )
}

export function InlineError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-xs text-danger-500 bg-danger-100/50 rounded-md px-3 py-2">
      {message}
    </p>
  )
}
