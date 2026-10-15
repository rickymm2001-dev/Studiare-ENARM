// Imágenes de los submazos bajados del catálogo de mazos (B11, 5.8 del plan de B11). Las notas las
// piden con su ruta /deck-media/<mazo>/<submazo>/<archivo>, que no existe en el sitio, porque viven en
// Dexie (deckMedia). Aquí se crean direcciones blob para mostrarlas y se sueltan al dejar de verlas. La
// política de contenido ya permite blob: en las imágenes (src/config/csp.ts).
import { useContext, useEffect, useMemo, useState } from 'react';
import { DataContext } from '@/data/context';

const MEDIA_PATH =
  /\/deck-media\/[a-z0-9-]{3,48}\/[a-z0-9-]{1,64}\/[A-Za-z0-9._-]{1,120}\.(?:jpg|jpeg|png|gif|webp|svg)/g;

const EMPTY: ReadonlyMap<string, string> = new Map();

/** Las rutas de imágenes del catálogo que usa un HTML, sin repetir */
export function deckMediaPathsIn(html: string): string[] {
  return [...new Set(html.match(MEDIA_PATH) ?? [])];
}

/**
 * Cambia en el HTML ya saneado la ruta de cada imagen del catálogo por su dirección blob. Una imagen
 * que todavía no está se queda sin src, así el navegador no la pide al sitio
 */
export function withDeckMedia(html: string, urls: ReadonlyMap<string, string>): string {
  return html.replace(
    /(<img\b[^>]*?)\ssrc="(\/deck-media\/[^"]*)"/g,
    (_, start: string, path: string) => {
      const url = urls.get(path);
      return url ? `${start} src="${url}"` : start;
    },
  );
}

/** Las direcciones blob de las imágenes del catálogo que usa el HTML. Vacío mientras cargan */
export function useDeckMediaUrls(html: string): ReadonlyMap<string, string> {
  const repos = useContext(DataContext)?.repos ?? null;
  // Una nota igual no vuelve a crear las direcciones. Las rutas no llevan el carácter |
  const key = useMemo(() => deckMediaPathsIn(html).join('|'), [html]);
  const [loaded, setLoaded] = useState<{ key: string; urls: ReadonlyMap<string, string> }>();
  useEffect(() => {
    const paths = key === '' ? [] : key.split('|');
    if (!repos || paths.length === 0) return;
    let alive = true;
    const created: string[] = [];
    void Promise.all(paths.map((path) => repos.deckMedia.get(path))).then((items) => {
      if (!alive) return;
      const urls = new Map<string, string>();
      items.forEach((item, index) => {
        const path = paths[index];
        if (!item || !path) return;
        const url = URL.createObjectURL(item.blob);
        created.push(url);
        urls.set(path, url);
      });
      setLoaded({ key, urls });
    });
    return () => {
      alive = false;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [repos, key]);
  return loaded?.key === key ? loaded.urls : EMPTY;
}
