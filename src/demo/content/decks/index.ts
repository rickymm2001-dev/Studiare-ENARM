// Mazos precargados de la demo (D-053). Se cargan bajo demanda, así su contenido no entra al
// JavaScript inicial. Hoy son los mazos de Paco, compartidos con su autorización.
// En el build de producción (VITE_APP_ENV=production) no van. Vite cambia la variable por su valor al
// construir, Rollup quita la rama del import.meta.glob y no emite los .json. Así nadie baja los mazos de
// pago desde el JavaScript publicado, y en producción salen del catálogo de la nube (B11, 5.9).
import { DemoDeckFileSchema, type DemoDeckFile } from '@/data/schemas/content';

type Loader = () => Promise<{ default: unknown }>;

const files: Record<string, Loader> =
  import.meta.env.VITE_APP_ENV === 'production'
    ? {}
    : import.meta.glob<{ default: unknown }>('./*.json');

export async function loadDemoDecks(): Promise<DemoDeckFile[]> {
  const keys = Object.keys(files).sort();
  const loaded = await Promise.all(keys.map((key) => (files[key] as Loader)()));
  return loaded.map((module) => DemoDeckFileSchema.parse(module.default));
}
