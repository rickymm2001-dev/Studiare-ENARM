// Los candados del plan Gratis (respuesta 20, B6 y B8 del plan del cambio). LockedPreview es la vista
// previa de una función de pago, con su candado, lo que trae y el botón de los candados, que lleva a
// Suscripción. LockedNote es el aviso corto con el mismo botón, para un lugar chico como el reto de
// Party en Inicio o una parte de otra tarjeta. Los usan Apuntes, Party, Subir mazos, el catálogo de
// mazos y FeatureGate, así todos los candados se ven y dicen lo mismo. El botón dice Ver planes hasta
// que B10 prenda la prueba de 7 días (lockedCtaLabel).
import { Check, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { lockedCtaLabel } from './lockedCta';

export function LockedPreview({
  id,
  title,
  intro,
  points,
  kept,
}: {
  /** id del título, que da nombre a la región */
  id: string;
  title: string;
  intro: string;
  /** Lo que trae la función, un renglón por punto */
  points: readonly string[];
  /** Qué pasa con lo que el alumno ya tenía */
  kept?: string;
}) {
  return (
    <Card aria-labelledby={id} className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle id={id} className="flex items-center gap-2">
          <Lock aria-hidden className="size-4 shrink-0 text-fg-muted" />
          {title}
        </CardTitle>
        <CardDescription>{intro}</CardDescription>
      </CardHeader>
      <ul className="flex flex-col gap-1.5 text-sm">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-muted" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <Button asChild className="self-start">
        <Link to={screenPath('subscription')}>{lockedCtaLabel()}</Link>
      </Button>
      {kept ? <p className="text-sm text-fg-muted">{kept}</p> : null}
    </Card>
  );
}

/** El aviso corto de un candado, con una frase y el mismo botón */
export function LockedNote({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-lg bg-muted p-3 text-sm"
    >
      <Lock aria-hidden className="size-4 shrink-0 text-fg-muted" />
      <p className="min-w-0 flex-1">{children}</p>
      <Button asChild size="sm" variant="secondary">
        <Link to={screenPath('subscription')}>{lockedCtaLabel()}</Link>
      </Button>
    </div>
  );
}
