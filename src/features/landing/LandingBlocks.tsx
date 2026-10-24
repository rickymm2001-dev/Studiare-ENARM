// Los dos bloques opcionales de la portada, el del creador y el de testimonios (B17, 5.2). No pintan nada
// mientras no tengan texto, así la portada queda igual que antes. Todo texto entra como texto de React
// y nunca como HTML. Si el contenido es de prueba lleva siempre su etiqueta visible. La foto del creador
// solo se muestra si trae su texto alternativo. Cada elemento lleva data-slot con el id de su lugar
// (slots.ts), solo para que quien escribe el texto lo vea al inspeccionar la página. Con la portada de
// D-149 el creador va en una banda crema y los testimonios en tarjetas con la comilla de adorno.
import { FlaskConical } from 'lucide-react';
import type { CSSProperties } from 'react';
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
    <section aria-labelledby="creador" className="ld-section ld-section--cream pt-0">
      <div className="ld-container">
        <div className="ld-creator" data-reveal="">
          {photo ? (
            <img
              src={photoSrc(photo.file)}
              alt={photo.alt}
              width={112}
              height={112}
              loading="lazy"
              decoding="async"
              data-slot="creator.photoAlt"
              className="ld-creator__photo"
            />
          ) : null}
          <div className="flex min-w-0 flex-col gap-3">
            {sample ? <SampleLabel /> : null}
            <div>
              <h2 id="creador" className="ld-title text-[1.75rem]" data-slot="creator.name">
                {creator.name}
              </h2>
              {filled(creator.role) ? (
                <p className="ld-muted mt-1 text-sm" data-slot="creator.role">
                  {creator.role}
                </p>
              ) : null}
            </div>
            <blockquote className="m-0 text-lg leading-relaxed" data-slot="creator.quote">
              <p className="m-0">{creator.quote}</p>
            </blockquote>
          </div>
        </div>
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
    <section aria-labelledby="testimonios" className="ld-section pt-0">
      <div className="ld-container">
        <div className="flex flex-col items-start gap-3" data-reveal="">
          <h2 id="testimonios" className="ld-title">
            {t.landing.testimonialsTitle}
          </h2>
          {sample ? <SampleLabel /> : null}
        </div>
        <ul className="m-0 mt-8 grid list-none gap-4 p-0 sm:grid-cols-2">
          {shown.map((item, index) => (
            <li key={`${item.who}-${item.permissionOn}`}>
              <figure
                className="ld-quote-card m-0"
                data-reveal=""
                style={{ '--i': index } as CSSProperties}
              >
                <span className="ld-quote-mark" aria-hidden>
                  &ldquo;
                </span>
                <blockquote data-slot={slotId('testimonials.N.quote', index + 1)}>
                  <p className="m-0">{item.quote}</p>
                </blockquote>
                <figcaption
                  className="ld-muted mt-auto text-sm font-semibold"
                  data-slot={slotId('testimonials.N.who', index + 1)}
                >
                  {item.who}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
