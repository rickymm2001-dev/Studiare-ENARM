// Señal de controversia de la IA en una tarjeta (D-085). La IA nunca corrige una tarjeta por su
// cuenta. Solo la señala, con una explicación y fuentes de la lista cerrada de textos académicos, y
// el alumno decide. Puede marcar que ya la verificó, y la señal se va y queda como evento, o editar
// esa misma tarjeta, que también la quita.
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { academicSourceName } from '@/config/academicSources';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';

export function ControversySignal({
  controversy,
  onVerify,
  onEdit,
}: {
  controversy: {
    reason: string;
    sources: readonly { key: string; locator?: string | null }[];
    simulated: boolean;
  };
  /** Sin esto la señal solo se lee, como en las propuestas que todavía no se guardan */
  onVerify?: () => Promise<void>;
  onEdit?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const verify = async () => {
    if (!onVerify) return;
    setBusy(true);
    setFailed(false);
    try {
      await onVerify();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      aria-label={t.controversy.title}
      className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm"
    >
      <p className="flex items-center gap-2 font-semibold text-warning">
        <TriangleAlert aria-hidden className="size-4 shrink-0" />
        {t.controversy.title}
        {controversy.simulated ? <Badge variant="neutral">{t.controversy.simulated}</Badge> : null}
      </p>
      <p>{controversy.reason}</p>
      <p className="text-fg-muted">{t.controversy.notChanged}</p>
      <p className="font-medium">
        {t.controversy.sources}
        <span className="font-normal">
          {' '}
          {controversy.sources
            .map(
              (source) =>
                `${academicSourceName(source.key)}${source.locator ? `, ${source.locator}` : ''}`,
            )
            .join('; ')}
        </span>
      </p>
      {onVerify || onEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          {onVerify ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                void verify();
              }}
            >
              {t.controversy.verify}
            </Button>
          ) : null}
          {onEdit ? (
            <Button size="sm" variant="ghost" onClick={onEdit}>
              {t.controversy.edit}
            </Button>
          ) : null}
          {onEdit ? <span className="text-xs text-fg-muted">{t.controversy.editHint}</span> : null}
        </div>
      ) : null}
      {failed ? (
        <p role="alert" className="text-danger">
          {t.controversy.error}
        </p>
      ) : null}
    </aside>
  );
}
