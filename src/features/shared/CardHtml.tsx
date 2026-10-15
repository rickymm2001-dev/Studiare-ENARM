// Muestra el HTML de una tarjeta. Se vuelve a sanear al mostrarlo, aunque ya venga saneado, para que
// un mazo importado nunca inyecte código (14.3). Solo se permiten imágenes de la propia app: las de los
// mazos de la demo, servidas desde el sitio, y las del catálogo de mazos de la nube, que viven en el
// navegador y se muestran con una dirección blob (B11, deckMediaUrls.ts).
import { useMemo } from 'react';
import { createCardSanitizer } from '@/data/content/cardHtml';
import { cn } from '@/ui/cn';
import { useDeckMediaUrls, withDeckMedia } from './deckMediaUrls';

let sanitizer: ReturnType<typeof createCardSanitizer> | null = null;
// En GitHub Pages la app vive bajo una ruta base, así que la imagen se sirve desde ahí. La ruta de una
// imagen del catálogo se conserva para cambiarla después por su dirección blob
const keepLocal = (file: string) => {
  if (file.startsWith('/demo-media/')) return `${import.meta.env.BASE_URL}${file.slice(1)}`;
  return file.startsWith('/deck-media/') ? file : null;
};

export function CardHtml({ html, className }: { html: string; className?: string }) {
  const media = useDeckMediaUrls(html);
  const clean = useMemo(() => {
    sanitizer ??= createCardSanitizer(window);
    return withDeckMedia(sanitizer.sanitize(html, keepLocal), media);
  }, [html, media]);
  return (
    <div
      className={cn(
        'card-html text-lg leading-relaxed [&_img]:my-2 [&_img]:max-h-80 [&_img]:rounded-md [&_li]:ml-5 [&_li]:list-disc [&_mark]:rounded-sm [&_mark]:bg-primary-soft [&_mark]:px-1 [&_mark]:text-fg [&_ol>li]:list-decimal [&_p+p]:mt-3',
        className,
      )}
      // Saneado con DOMPurify y lista corta de etiquetas
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
