import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { impactMedium } from './haptics'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'lg' | 'xl'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  fullWidth?: boolean
  /** Disable the automatic medium-impact haptic on tap. */
  noHaptic?: boolean
}

const VARIANTS: Record<Variant, string> = {
  primary:   'bg-brand-500 text-text-on-brand active:bg-brand-600',
  secondary: 'bg-surface-card text-text-primary border border-border-subtle active:bg-surface-muted',
  ghost:     'bg-transparent text-brand-500 active:bg-brand-100',
  danger:    'bg-danger-500 text-text-on-brand active:bg-red-800',
}

// iOS sizes skew taller for comfortable thumb use.
const SIZES: Record<Size, string> = {
  md: 'h-11 px-4 text-base rounded-md gap-2',
  lg: 'h-13 px-5 text-base rounded-lg gap-2 font-semibold',
  xl: 'h-14 px-6 text-lg rounded-lg gap-2.5 font-semibold',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'lg', loading, leadingIcon, trailingIcon,
    fullWidth, noHaptic, onClick, className = '', disabled, children, ...rest },
  ref,
) {
  const isDisabled = disabled || loading
  return (
    <button
      ref={ref}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
      onClick={(e) => {
        if (isDisabled) return
        if (!noHaptic) void impactMedium()
        onClick?.(e)
      }}
      className={[
        'inline-flex items-center justify-center font-semibold transition-colors',
        'disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth ? 'w-full' : '',
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {loading ? <Spinner /> : leadingIcon}
      <span className="min-w-0 truncate">{children}</span>
      {!loading && trailingIcon}
    </button>
  )
})

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
