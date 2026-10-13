// Party en el plan Gratis (respuesta 20 y 4.3 del plan del cambio, B8). Grupos, tabla de la semana,
// retos y duelos son de los planes de pago, así que en Gratis Party muestra su vista previa con el
// candado y el botón de los candados de Gratis. Comparte tu semana e Invita y gana un mes siguen
// abiertas en la misma pantalla, y en Inicio el reto de Party lleva el aviso corto. El servidor
// también cierra Party con el plan (party_open, 20261021000001_free_plan_locks.sql).
import { t } from '@/i18n/es-MX';
import { LockedNote, LockedPreview } from '../shared/LockedPreview';

export function PartyLocked() {
  const text = t.freePlan.party;
  return (
    <LockedPreview
      id="party-cerrada"
      title={text.title}
      intro={text.intro}
      points={text.points}
      kept={text.kept}
    />
  );
}

/** El reto de Party en Inicio con el plan Gratis */
export function PartyWidgetLocked() {
  return <LockedNote>{t.freePlan.widget}</LockedNote>;
}
