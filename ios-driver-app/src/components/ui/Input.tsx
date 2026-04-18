import { forwardRef, useId } from 'react'
import type {
  InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode,
} from 'react'

interface FieldProps {
  label?: string
  error?: string
  hint?: string
}

function FieldWrap({
  id, label, error, hint, children,
}: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-text-secondary">
          {label}
        </label>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger-500">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${id}-hint`} className="text-xs text-text-tertiary">
          {hint}
        </p>
      )}
    </div>
  )
}

// 16px base font prevents iOS zoom-on-focus.
const BASE_CONTROL =
  'w-full min-h-12 px-4 py-3 text-base rounded-md bg-surface-muted border border-border-subtle ' +
  'text-text-primary placeholder:text-text-tertiary ' +
  'focus:outline-none focus:bg-surface-card focus:border-brand-500 ' +
  'aria-[invalid=true]:border-danger-500 ' +
  'disabled:opacity-50'

function describedBy(id: string, error?: string, hint?: string) {
  if (error) return `${id}-error`
  if (hint) return `${id}-hint`
  return undefined
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement>, FieldProps {}

export const Input = forwardRef<HTMLInputElement, TextInputProps>(function Input(
  { label, error, hint, className = '', type = 'text', ...rest }, ref,
) {
  const id = useId()
  const isNumber = type === 'number'
  return (
    <FieldWrap id={id} label={label} error={error} hint={hint}>
      <input
        ref={ref}
        id={id}
        type={type}
        inputMode={isNumber ? 'decimal' : rest.inputMode}
        aria-invalid={!!error || undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${BASE_CONTROL} ${isNumber ? 'tabular' : ''} ${className}`}
        {...rest}
      />
    </FieldWrap>
  )
})

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldProps {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, className = '', children, ...rest }, ref,
) {
  const id = useId()
  return (
    <FieldWrap id={id} label={label} error={error} hint={hint}>
      <select
        ref={ref}
        id={id}
        aria-invalid={!!error || undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${BASE_CONTROL} ${className}`}
        {...rest}
      >
        {children}
      </select>
    </FieldWrap>
  )
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldProps {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, className = '', rows = 3, ...rest }, ref,
) {
  const id = useId()
  return (
    <FieldWrap id={id} label={label} error={error} hint={hint}>
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        aria-invalid={!!error || undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${BASE_CONTROL} ${className}`}
        {...rest}
      />
    </FieldWrap>
  )
})
