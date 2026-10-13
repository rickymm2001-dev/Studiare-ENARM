// Por qué fallaste (B5, comentario 2). Los siete motivos de Ricardo en botones de un toque. Es
// opcional y se puede cambiar. Cada cambio deja un evento nuevo y vale el último, así que el botón
// presionado es el último motivo que quedó en la bitácora. Mientras se guarda se ve el nuevo.
import { useState } from 'react';
import { ERROR_MOTIVES, type ErrorMotive } from '@/engines/errorCauses';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { FilterChip } from '@/ui/components/filter-chip';

export function MotivePicker({
  value,
  onChange,
  className,
}: {
  /** El último motivo que marcó para este error. null si no ha marcado ninguno */
  value: ErrorMotive | null;
  onChange: (motive: ErrorMotive) => Promise<unknown>;
  className?: string;
}) {
  const text = t.examReview.motives;
  // El último que tocó aquí. Se ve de inmediato, sin esperar a que la bitácora lo confirme
  const [chosen, setChosen] = useState<ErrorMotive | null>(null);
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed'>('idle');
  const shown = chosen ?? value;

  const choose = async (motive: ErrorMotive) => {
    if (motive === shown) return;
    const before = chosen;
    setChosen(motive);
    setStatus('idle');
    try {
      await onChange(motive);
      setStatus('saved');
    } catch {
      setChosen(before);
      setStatus('failed');
    }
  };

  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-2', className)}>
      <legend className="mb-1 font-medium">{text.legend}</legend>
      <p className="-mt-1 text-sm text-fg-muted">{text.hint}</p>
      <div className="flex flex-wrap gap-2">
        {ERROR_MOTIVES.map((motive) => (
          <FilterChip
            key={motive}
            pressed={shown === motive}
            onPressedChange={() => {
              void choose(motive);
            }}
          >
            {t.review.causes[motive]}
          </FilterChip>
        ))}
      </div>
      <p role="status" className="text-sm text-fg-muted">
        {status === 'saved' && shown ? text.saved(t.review.causes[shown]) : ''}
      </p>
      {status === 'failed' ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {text.error}
        </p>
      ) : null}
    </fieldset>
  );
}
