// Lo que se dice de cada tarjeta en la tabla, en la lista y en el panel de Buscar tarjetas. El estado
// va con palabras. El color de estado solo marca lo que es aviso o error, como suspendida,
// sanguijuela o la señal de la IA (4.7 del plan del cambio).
import { isDue, type CardSearchRow } from '@/engines/cardSearch';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { formatDate } from './rowText';

/** Estado de FSRS, suspendida, sanguijuela, señal de la IA y borrador, en etiquetas */
export function StatusBadges({ row }: { row: CardSearchRow }) {
  return (
    <>
      <Badge variant="neutral">{t.cardSearch.statusOne[row.fsrs]}</Badge>
      {row.suspended ? <Badge variant="warning">{t.cardSearch.statusOne.suspended}</Badge> : null}
      {row.leech ? <Badge variant="danger">{t.cardSearch.leechOne}</Badge> : null}
      {row.controversy ? <Badge variant="danger">{t.controversy.badge}</Badge> : null}
      {row.aiDraft ? <Badge variant="warning">{t.aiCards.draftLabel}</Badge> : null}
    </>
  );
}

/** Próximo repaso, con Vencida si ya toca. Una tarjeta nueva no tiene fecha */
export function DueText({
  row,
  nowMs,
  timeZone,
}: {
  row: CardSearchRow;
  nowMs: number;
  timeZone: string;
}) {
  if (row.due === null) return <NoValue />;
  return (
    <span className="flex flex-col">
      <span className="whitespace-nowrap">{formatDate(row.due, timeZone)}</span>
      {isDue(row, nowMs) ? (
        <span className="text-xs font-semibold text-warning">{t.cardSearch.overdue}</span>
      ) : null}
    </span>
  );
}

/** Días entre el último repaso y el próximo */
export function IntervalText({ row }: { row: CardSearchRow }) {
  if (row.interval === null) return <NoValue />;
  return <span className="whitespace-nowrap">{t.cardSearch.intervalDays(row.interval)}</span>;
}

/** Una raya para la vista y Sin fecha para el lector de pantalla */
function NoValue() {
  return (
    <>
      <span aria-hidden className="text-fg-muted">
        —
      </span>
      <span className="sr-only">{t.cardSearch.noDate}</span>
    </>
  );
}
