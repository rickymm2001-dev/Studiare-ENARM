// Vista previa de los bloques opcionales de la portada (B17, 5.2). Sirve para ver el texto del creador y
// los testimonios en una página real, con sus reglas, antes de que entren a src/i18n/landing.ts, y para
// las pruebas de punta a punta, que corren contra el build y no pueden cambiar el texto del código.
// Lee un JSON de localStorage y solo fuera de producción: en producción la portada muestra únicamente
// lo que está en src/i18n/landing.ts, porque esa copia la puede escribir cualquiera desde su navegador
// (igual que las banderas, src/config/featureFlags.ts). Lo que entra pasa por las mismas reglas que el
// texto ajeno, nunca llega como HTML y siempre se pinta con la etiqueta de contenido de prueba.
import { z } from 'zod';
import { readAppEnv, type AppEnv } from '@/config/featureFlags';
import type { LandingCreator, LandingTestimonial } from '@/i18n/landing';
import { LANDING_PREVIEW_KEY } from './previewKey';
import { blockProblems, LANDING_COUNTS, type LandingBlocks } from './slots';

export { LANDING_PREVIEW_KEY };

const PreviewSchema = z.strictObject({
  creator: z
    .strictObject({
      name: z.string(),
      role: z.string(),
      quote: z.string(),
      photo: z.strictObject({ file: z.string(), alt: z.string() }).nullable(),
    })
    .nullable(),
  testimonials: z
    .array(z.strictObject({ quote: z.string(), who: z.string(), permissionOn: z.string() }))
    .max(LANDING_COUNTS.testimonialsMax),
});

/** Lo que hace falta de localStorage, para poder probarlo sin navegador */
export type PreviewStorage = Pick<Storage, 'getItem'>;

function browserStorage(): PreviewStorage | null {
  try {
    return globalThis.localStorage;
  } catch {
    // Sin almacenamiento, en una ventana privada o con los datos del sitio bloqueados
    return null;
  }
}

/**
 * La vista previa guardada, si la hay y si cumple todas las reglas. Con cualquier problema devuelve
 * null y la portada queda con su contenido de siempre. En producción nunca la lee
 */
export function readLandingPreview(
  env: AppEnv = readAppEnv(),
  storage: PreviewStorage | null = browserStorage(),
): LandingBlocks | null {
  if (env === 'production' || storage === null) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(LANDING_PREVIEW_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = PreviewSchema.safeParse(json);
  if (!parsed.success) return null;
  const creator: LandingCreator | null = parsed.data.creator;
  const testimonials: readonly LandingTestimonial[] = parsed.data.testimonials;
  if (blockProblems(creator, testimonials).length > 0) return null;
  return { creator, testimonials, sample: true };
}
