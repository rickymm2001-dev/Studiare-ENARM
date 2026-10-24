// La imagen del héroe de la portada (D-148). Si Ricardo guarda su foto en public/landing/portada.webp
// se muestra con el fundido del boceto. Mientras no exista, o si no carga, en su lugar van dos
// capturas reales de la app, que ya llevan dentro su etiqueta de datos de demostración. El sello
// redondo con la línea de confianza va encima en los dos casos.
import { useState } from 'react';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';

const base = import.meta.env.BASE_URL;
const PHOTO = `${base}landing/portada.webp`;
const DESKTOP_SHOT = `${base}screenshots/inicio-computadora.webp`;
const PHONE_SHOT = `${base}screenshots/repasar-telefono.webp`;

export function HeroVisual({ trust }: { trust: string }) {
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
      <p className="ld-hero__seal" data-slot="hero.trust">
        {trust}
      </p>
    </div>
  );
}
