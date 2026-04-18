interface SkeletonProps {
  className?: string
  width?: string | number
  height?: string | number
}

export function Skeleton({ className = '', width, height }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={`inline-block bg-surface-muted rounded-sm animate-pulse ${className}`}
      style={{ width, height: height ?? '1em' }}
    />
  )
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-lg border border-border-subtle bg-surface-card p-4 ${className}`}>
      <Skeleton className="block mb-3" width="40%" height={12} />
      <Skeleton className="block mb-2" width="70%" height={18} />
      <Skeleton className="block" width="30%" height={10} />
    </div>
  )
}
