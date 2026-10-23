// El catálogo de mazos precargados en el plan Gratis (4.25 del plan del cambio, B8). Seguir mazos
// nuevos del catálogo es de los planes de pago, así que la lista queda como vista previa, con el aviso
// corto del candado arriba y cada mazo nuevo marcado como de pago. Un mazo que el alumno ya siguió, porque
// está en este dispositivo o porque su bitácora tiene repasos de sus tarjetas, lo sigue repasando y lo
// puede volver a seguir, porque sus repasos son suyos.
import { Lock } from 'lucide-react';
import { deckCatalogText } from '@/i18n/cloudDecks';
import { t } from '@/i18n/es-MX';
import { LockedNote } from '../shared/LockedPreview';

/**
 * El aviso de arriba de la lista. freeDeck agrega que Urgencias va abierto, que es lo que dice el
 * catálogo que viene en la app. El de la nube dice cuáles mazos dejó abiertos el admin con
 * freeDeckNames, que sale solo si hay alguno
 */
export function CatalogLockNotice({
  freeDeck = false,
  freeDeckNames = [],
}: {
  freeDeck?: boolean;
  freeDeckNames?: readonly string[];
}) {
  const note = freeDeckNames.length > 0 ? deckCatalogText.freeDecks(freeDeckNames) : null;
  return (
    <div className="mb-3 flex flex-col gap-1">
      <LockedNote feature="catalog">{t.freePlan.catalog.notice}</LockedNote>
      {freeDeck ? <p className="text-sm text-fg-muted">{t.freePlan.catalog.freeDeckNote}</p> : null}
      {note ? <p className="text-sm text-fg-muted">{note}</p> : null}
    </div>
  );
}

/** Va en lugar del botón Seguir mazo en un mazo del catálogo que el alumno nunca ha estudiado */
export function CatalogRowLock() {
  return (
    <span className="flex items-center gap-1 text-sm font-medium text-fg-muted">
      <Lock aria-hidden className="size-4" />
      {t.freePlan.catalog.rowLocked}
    </span>
  );
}
