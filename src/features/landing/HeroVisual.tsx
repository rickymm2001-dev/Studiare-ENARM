// La imagen del héroe de la portada (D-149). La foto vive en public/landing/portada.webp, ya con el
// recorte, el duotono marino y el contraste de la diapositiva 1 del Benchmark. El degradado blanco que
// la cubría se quitó a pedido de Ricardo (D-150). Si la foto no carga, en su lugar van dos capturas
// reales de la app, que ya llevan dentro su etiqueta de datos de demostración.
import { useState } from 'react';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';

const base = import.meta.env.BASE_URL;
const PHOTO = `${base}landing/portada.webp`;
const DESKTOP_SHOT = `${base}screenshots/inicio-computadora.webp`;
const PHONE_SHOT = `${base}screenshots/repasar-telefono.webp`;

export function HeroVisual() {
  const [photo, setPhoto] = useState<'loading' | 'ready' | 'missing'>('loading');
  const text = t.landing;
  return (
    <div className="ld-hero__visual">
      {photo === 'missing' ? null : (
        // Decorativa. Lo que dice la portada ya está en el texto, así que no describe nada
        <img
          className={cn('ld-hero__photo', photo === 'ready' && 'is-ready')}
          src={PHOTO}
          alt=""
          fetchPriority="high"
          decoding="async"
          onLoad={() => {
            setPhoto('ready');
          }}
          onError={() => {
            setPhoto('missing');
          }}
        />
      )}
      {photo === 'missing' ? (
        <div className="ld-collage ld-enter" style={{ '--d': '200ms' } as React.CSSProperties}>
          <img
            className="ld-collage__desktop"
            src={DESKTOP_SHOT}
            alt={text.productShotAlt}
            width={1280}
            height={800}
            decoding="async"
          />
          <img
            className="ld-collage__phone"
            src={PHONE_SHOT}
            alt={text.productShotPhoneAlt}
            width={390}
            height={844}
            decoding="async"
          />
        </div>
      ) : null}
    </div>
  );
}
