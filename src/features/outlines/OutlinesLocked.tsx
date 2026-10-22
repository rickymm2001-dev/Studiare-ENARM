// Apuntes en el plan Gratis (respuesta 20 del plan del cambio). Se ve con su candado y una vista
// previa corta de lo que hace, con el botón de los candados de Gratis que lleva a Suscripción. Dice
// Ver planes hasta que exista la prueba de 7 días (B10, lockedCtaLabel). Los apuntes que el alumno
// ya tenía no se borran y sus tarjetas siguen en Repasar. Con la nube, lo que escribió y todavía no
// subió se queda en este dispositivo y sube con el primer plan de pago (outlinesPending, B8). Es la
// misma vista previa de los candados de Party y Subir tus mazos (LockedPreview, B8).
import { useCloud } from '@/app/cloudState';
import { t } from '@/i18n/es-MX';
import { LockedPreview } from '../shared/LockedPreview';

export function OutlinesLocked() {
  const text = t.outlines.locked;
  // Sin nube, como en la versión que guarda todo en el navegador, no hay nada que subir
  const withCloud = useCloud((store) => store.state.status !== 'off');
  return (
    <LockedPreview
      id="apuntes-cerrado"
      feature="outlines"
      title={text.title}
      intro={text.intro}
      points={text.points}
      kept={withCloud ? [text.kept, text.keptCloud] : [text.kept]}
    />
  );
}
