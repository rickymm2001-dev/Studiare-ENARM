// Campos de formulario accesibles con etiqueta visible, ayuda y error asociados (4.8).
import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/ui/cn';

const control =
  'min-h-touch w-full rounded-md border border-line-strong bg-surface px-3 text-base text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50';

interface FieldShell {
  label: string;
  hint?: string;
  error?: string | null;
  className?: string;
}

function Shell({
  id,
  label,
  hint,
  error,
  className,
  children,
}: FieldShell & { id: string; children: (describedBy: string | undefined) => ReactNode }) {
  const hintId = hint ? `${id}-ayuda` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="font-medium text-fg">
        {label}
      </label>
      {children(describedBy)}
      {hint ? (
        <p id={hintId} className="text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  className,
  ...props
}: FieldShell & Omit<ComponentProps<'input'>, 'className'>) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} className={className}>
      {(describedBy) => (
        <input
          id={id}
          className={control}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
        />
      )}
    </Shell>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  className,
  ...props
}: FieldShell & Omit<ComponentProps<'textarea'>, 'className'>) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} className={className}>
      {(describedBy) => (
        <textarea
          id={id}
          className={cn(control, 'min-h-24 py-2 leading-relaxed')}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
        />
      )}
    </Shell>
  );
}

export function SelectField({
  label,
  hint,
  error,
  className,
  options,
  ...props
}: FieldShell &
  Omit<ComponentProps<'select'>, 'className'> & {
    options: readonly { value: string; label: string }[];
  }) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} className={className}>
      {(describedBy) => (
        <select id={id} className={control} aria-describedby={describedBy} {...props}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Shell>
  );
}

export function CheckboxField({
  label,
  hint,
  className,
  ...props
}: Omit<FieldShell, 'error'> & Omit<ComponentProps<'input'>, 'className' | 'type'>) {
  const id = useId();
  const hintId = hint ? `${id}-ayuda` : undefined;
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-1 size-5 shrink-0 accent-[var(--color-primary)]"
        aria-describedby={hintId}
        {...props}
      />
      <div className="flex flex-col">
        <label htmlFor={id} className="font-medium text-fg">
          {label}
        </label>
        {hint ? (
          <p id={hintId} className="text-sm text-fg-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
