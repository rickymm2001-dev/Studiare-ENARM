// Los candados del plan Gratis (respuesta 20, B6 y B8 del plan del cambio). LockedPreview es la vista
// previa de una función de pago, con su candado, lo que trae y el botón de los candados, que lleva a
// Suscripción. LockedNote es el aviso corto con el mismo botón, para un lugar chico como el reto de
// Party en Inicio o una parte de otra tarjeta. Los usan Apuntes, Party, Subir tus mazos, el catálogo
// de mazos y FeatureGate, así todos los candados se ven y dicen lo mismo. El botón dice Prueba 7 días
// gratis y abre la forma de pago del Mensual cuando la prueba existe, y si no Ver planes (lockedCta.ts,
// B10). Son avisos fijos, así que no se anuncian como un cambio en cada visita. LockedLoading ocupa su
// lugar mientras se sabe el plan.
import { Check, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SkeletonRows } from '@/ui/components/skeleton';
import { lockedCtaLabel, lockedCtaPath } from './lockedCta';

export function LockedPreview({
  id,
  title,
  intro,
  points,
  kept = [],
  children,
}: {
  /** id del título, que da nombre a la región */
  id: string;
  title: string;
  intro: string;
  /** Lo que trae la función, un renglón por punto */
  points: readonly string[];
  /** Qué pasa con lo que el alumno ya tenía, un párrafo por frase */
  kept?: readonly string[];
  /** Lo que el alumno todavía puede hacer con lo suyo, como salir de sus grupos */
  children?: ReactNode;
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
        <Link to={lockedCtaPath()}>{lockedCtaLabel()}</Link>
      </Button>
      {kept.map((line) => (
        <p key={line} className="text-sm text-fg-muted">
          {line}
        </p>
      ))}
      {children}
    </Card>
  );
}

/** El aviso corto de un candado, con una frase y el mismo botón */
export function LockedNote({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="flex flex-wrap items-center gap-3 rounded-lg bg-muted p-3 text-sm">
      <Lock aria-hidden className="size-4 shrink-0 text-fg-muted" />
      <p className="min-w-0 flex-1">{children}</p>
      <Button asChild size="sm" variant="secondary">
        <Link to={lockedCtaPath()}>{lockedCtaLabel()}</Link>
      </Button>
    </div>
  );
}

/** El lugar de un candado con vista previa mientras se sabe el plan, como en un dispositivo nuevo */
export function LockedLoading() {
  return (
    <Card>
      <SkeletonRows label={t.freePlan.checking} rows={3} />
    </Card>
  );
}
