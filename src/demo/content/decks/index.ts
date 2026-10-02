// Mazos precargados de la demo (D-053). Se cargan bajo demanda, así su contenido no entra al
// JavaScript inicial. Hoy son los mazos de Paco, compartidos con su autorización.
import { DemoDeckFileSchema, type DemoDeckFile } from '@/data/schemas/content';

const files = import.meta.glob<{ default: unknown }>('./*.json');

export async function loadDemoDecks(): Promise<DemoDeckFile[]> {
  const keys = Object.keys(files).sort();
  const loaded = await Promise.all(
    keys.map((key) => (files[key] as () => Promise<{ default: unknown }>)()),
  );
  return loaded.map((module) => DemoDeckFileSchema.parse(module.default));
}
