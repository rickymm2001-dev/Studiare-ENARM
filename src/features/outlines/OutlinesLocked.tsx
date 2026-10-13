// Apuntes en el plan Gratis (respuesta 20 del plan del cambio). Se ve con su candado y una vista
// previa corta de lo que hace, con el botón de los candados de Gratis que lleva a Suscripción. Dice
// Ver planes hasta que exista la prueba de 7 días (B10, lockedCtaLabel). Los apuntes que el alumno
// ya tenía no se borran y sus tarjetas siguen en Repasar. Es la misma vista previa de los candados de
// Party y Subir mazos (LockedPreview, B8).
import { t } from '@/i18n/es-MX';
import { LockedPreview } from '../shared/LockedPreview';

export function OutlinesLocked() {
  const text = t.outlines.locked;
  return (
    <LockedPreview
      id="apuntes-cerrado"
      title={text.title}
      intro={text.intro}
      points={text.points}
      kept={text.kept}
    />
  );
}
