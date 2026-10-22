// Los dos bloques opcionales de la portada, el del creador y el de testimonios (B17, 5.2). No pintan nada
// mientras no tengan texto, así la portada queda igual que antes. Todo texto entra como texto de React
// y nunca como HTML. Si el contenido es de prueba lleva siempre su etiqueta visible. La foto del creador
// solo se muestra si trae su texto alternativo. Cada elemento lleva data-slot con el id de su lugar
// (slots.ts), solo para que quien escribe el texto lo vea al inspeccionar la página.
import { FlaskConical } from 'lucide-react';
import { t } from '@/i18n/es-MX';
import type { LandingCreator, LandingTestimonial } from '@/i18n/landing';
import { Badge } from '@/ui/components/badge';
import { slotId } from './slotId';

/** La foto vive en public/landing y se pide con la base de publicación de la app */
const photoSrc = (file: string) => `${import.meta.env.BASE_URL}landing/${file}`;

function SampleLabel() {
  return (
    <Badge variant="simulated" className="self-start">
      <FlaskConical aria-hidden className="size-3.5" />
      {t.landing.sampleLabel}
    </Badge>
  );
}

const filled = (value: string) => value.trim() !== '';

export function CreatorSection({
  creator,
  sample,
}: {
  creator: LandingCreator | null;
  sample: boolean;
}) {
  if (!creator || !filled(creator.name) || !filled(creator.quote)) return null;
  const photo = creator.photo && filled(creator.photo.alt) ? creator.photo : null;
  return (
    <section
      aria-labelledby="creador"
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5 sm:flex-row sm:items-start sm:p-6"
    >
      {photo ? (
        <img
          src={photoSrc(photo.file)}
          alt={photo.alt}
          width={96}
          height={96}
          loading="lazy"
          decoding="async"
          data-slot="creator.photoAlt"
          className="size-24 shrink-0 rounded-full border border-line object-cover"
        />
      ) : null}
      <div className="flex min-w-0 flex-col gap-2">
        {sample ? <SampleLabel /> : null}
        <div>
          <h2 id="creador" className="screen-title" data-slot="creator.name">
            {creator.name}
          </h2>
          {filled(creator.role) ? (
            <p className="text-sm text-fg-muted" data-slot="creator.role">
              {creator.role}
            </p>
          ) : null}
        </div>
        <blockquote className="text-fg" data-slot="creator.quote">
          <p>{creator.quote}</p>
        </blockquote>
      </div>
    </section>
  );
}

export function TestimonialsSection({
  testimonials,
  sample,
}: {
  testimonials: readonly LandingTestimonial[];
  sample: boolean;
}) {
  const shown = testimonials.filter((item) => filled(item.quote) && filled(item.who));
  if (shown.length === 0) return null;
  return (
    <section aria-labelledby="testimonios" className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-2">
        <h2 id="testimonios" className="screen-title">
          {t.landing.testimonialsTitle}
        </h2>
        {sample ? <SampleLabel /> : null}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {shown.map((item, index) => (
          <li key={`${item.who}-${item.permissionOn}`}>
            <figure className="flex h-full flex-col gap-3 rounded-lg border border-line bg-surface p-4">
              <blockquote data-slot={slotId('testimonials.N.quote', index + 1)}>
                <p>{item.quote}</p>
              </blockquote>
              <figcaption
                className="mt-auto text-sm text-fg-muted"
                data-slot={slotId('testimonials.N.who', index + 1)}
              >
                {item.who}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}
