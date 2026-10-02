// Muestra el HTML de una tarjeta. Se vuelve a sanear al mostrarlo, aunque ya venga saneado, para que
// un mazo importado nunca inyecte código (14.3). Solo se permiten imágenes de la propia app.
import { useMemo } from 'react';
import { createCardSanitizer } from '@/data/content/cardHtml';
import { cn } from '@/ui/cn';

let sanitizer: ReturnType<typeof createCardSanitizer> | null = null;
// En GitHub Pages la app vive bajo una ruta base, así que la imagen se sirve desde ahí
const keepLocal = (file: string) =>
  file.startsWith('/demo-media/') ? `${import.meta.env.BASE_URL}${file.slice(1)}` : null;

export function CardHtml({ html, className }: { html: string; className?: string }) {
  const clean = useMemo(() => {
    sanitizer ??= createCardSanitizer(window);
    return sanitizer.sanitize(html, keepLocal);
  }, [html]);
  return (
    <div
      className={cn(
        'card-html text-lg leading-relaxed [&_img]:my-2 [&_img]:max-h-80 [&_img]:rounded-md [&_li]:ml-5 [&_li]:list-disc [&_mark]:rounded-sm [&_mark]:bg-primary-soft [&_mark]:px-1 [&_mark]:text-fg [&_ol>li]:list-decimal',
        className,
      )}
      // Saneado con DOMPurify y lista corta de etiquetas
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
