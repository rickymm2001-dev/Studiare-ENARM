// El catálogo de mazos precargados en el plan Gratis (4.25 del plan del cambio, B8). Seguir mazos
// nuevos del catálogo es de los planes de pago, así que la lista queda como vista previa, con el aviso
// corto del candado arriba y cada mazo nuevo marcado como de pago. Lo que el alumno ya tiene en este
// dispositivo, porque lo sigue o lo siguió antes, lo sigue repasando y lo puede volver a seguir,
// porque sus repasos son suyos.
import { Lock } from 'lucide-react';
import { t } from '@/i18n/es-MX';
import { LockedNote } from '../shared/LockedPreview';

export function CatalogLockNotice() {
  return (
    <div className="mb-3">
      <LockedNote>{t.freePlan.catalog.notice}</LockedNote>
    </div>
  );
}

/** Va en lugar del botón Seguir mazo en un mazo del catálogo que el alumno todavía no tiene */
export function CatalogRowLock() {
  return (
    <span className="flex items-center gap-1 text-sm font-medium text-fg-muted">
      <Lock aria-hidden className="size-4" />
      {t.freePlan.catalog.rowLocked}
    </span>
  );
}
