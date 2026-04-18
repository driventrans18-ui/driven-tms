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

export function SkeletonText({ lines = 1, className = '' }: { lines?: number; className?: string }) {
  return (
    <span className={`inline-flex flex-col gap-1.5 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="block" width={`${80 - i * 10}%`} height={12} />
      ))}
    </span>
  )
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-lg border border-border-subtle bg-surface-card p-5 ${className}`}>
      <Skeleton className="block mb-3" width="40%" height={14} />
      <Skeleton className="block mb-2" width="70%" height={22} />
      <Skeleton className="block" width="30%" height={12} />
    </div>
  )
}
