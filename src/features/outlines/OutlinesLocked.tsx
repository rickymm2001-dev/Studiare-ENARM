// Apuntes en el plan Gratis (respuesta 20 del plan del cambio). Se ve con su candado y una vista
// previa corta de lo que hace, con el botón de los candados de Gratis que lleva a Suscripción. Dice
// Ver planes hasta que exista la prueba de 7 días (B10, lockedCtaLabel). Los apuntes que el alumno
// ya tenía no se borran y sus tarjetas siguen en Repasar.
import { Check, Lock } from 'lucide-react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { lockedCtaLabel } from '../shared/lockedCta';

export function OutlinesLocked() {
  const text = t.outlines.locked;
  return (
    <Card aria-labelledby="apuntes-cerrado" className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle id="apuntes-cerrado" className="flex items-center gap-2">
          <Lock aria-hidden className="size-4 shrink-0 text-fg-muted" />
          {text.title}
        </CardTitle>
        <CardDescription>{text.intro}</CardDescription>
      </CardHeader>
      <ul className="flex flex-col gap-1.5 text-sm">
        {text.points.map((point) => (
          <li key={point} className="flex items-start gap-2">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-muted" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <Button asChild className="self-start">
        <Link to={screenPath('subscription')}>{lockedCtaLabel()}</Link>
      </Button>
      <p className="text-sm text-fg-muted">{text.kept}</p>
    </Card>
  );
}
