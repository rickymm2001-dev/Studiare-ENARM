// Campos de formulario accesibles con etiqueta visible, ayuda y error asociados (4.8). De 48 px con
// radio de 12 px y borde de 1.5 px, como los de la bienvenida del diseño (D-150).
import { Fragment, useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/ui/cn';

const control =
  'min-h-12 w-full rounded-md border-[1.5px] border-line-strong bg-surface px-4 text-base text-fg placeholder:text-fg-muted focus-visible:border-indicator focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-50';

interface FieldShell {
  label: string;
  hint?: string;
  error?: string | null;
  className?: string;
  /**
   * La etiqueta solo para el lector de pantalla, cuando el encabezado de una columna de tabla ya dice
   * qué es el campo. Sigue siendo la etiqueta del control
   */
  labelHidden?: boolean;
}

function Shell({
  id,
  label,
  hint,
  error,
  className,
  labelHidden = false,
  children,
}: FieldShell & { id: string; children: (describedBy: string | undefined) => ReactNode }) {
  const hintId = hint ? `${id}-ayuda` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className={labelHidden ? 'sr-only' : 'font-semibold text-fg'}>
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

interface SelectOption {
  value: string;
  label: string;
  /** Las opciones seguidas con el mismo grupo van juntas bajo su nombre, con optgroup */
  group?: string;
}

/** Junta las opciones seguidas que comparten grupo. Las que no tienen grupo quedan sueltas */
function groupOptions(options: readonly SelectOption[]) {
  const blocks: { group: string | undefined; options: SelectOption[] }[] = [];
  for (const option of options) {
    const last = blocks.at(-1);
    if (last && option.group !== undefined && last.group === option.group) {
      last.options.push(option);
    } else {
      blocks.push({ group: option.group, options: [option] });
    }
  }
  return blocks;
}

export function SelectField({
  label,
  hint,
  error,
  className,
  labelHidden,
  options,
  ...props
}: FieldShell &
  Omit<ComponentProps<'select'>, 'className'> & {
    options: readonly SelectOption[];
  }) {
  const id = useId();
  const optionOf = (option: SelectOption) => (
    <option key={option.value} value={option.value}>
      {option.label}
    </option>
  );
  return (
    <Shell
      id={id}
      label={label}
      hint={hint}
      error={error}
      className={className}
      {...(labelHidden === undefined ? {} : { labelHidden })}
    >
      {(describedBy) => (
        <select id={id} className={control} aria-describedby={describedBy} {...props}>
          {groupOptions(options).map((block, index) =>
            block.group === undefined ? (
              <Fragment key={`sueltas-${String(index)}`}>{block.options.map(optionOf)}</Fragment>
            ) : (
              <optgroup key={`grupo-${String(index)}`} label={block.group}>
                {block.options.map(optionOf)}
              </optgroup>
            ),
          )}
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
        className="mt-1 size-5 shrink-0 accent-[var(--color-indicator)]"
        aria-describedby={hintId}
        {...props}
      />
      <div className="flex flex-col">
        <label htmlFor={id} className="font-semibold text-fg">
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
