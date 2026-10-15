// Catálogo compartido de mazos en Supabase Storage (B11, 1.15 y 4.8 del plan de B11, respuestas 46, 47
// y 49). Un mazo se sube por submazo, que es el segundo nivel de su etiqueta, en una carpeta por
// versión para no sobrescribir lo que ya está en la caché de la CDN
//   deck-catalog/<mazo>/v<n>/<submazo>.json           las notas saneadas del submazo
//   deck-catalog/<mazo>/v<n>/<submazo>.media-<k>.zip  sus imágenes, en paquetes de hasta 5 MB
// Este archivo valida lo que se sube y lo que se baja. La app valida cada submazo con
// DeckSubjectFileSchema antes de guardarlo, así un archivo raro en Storage no entra a Dexie.
import { z } from 'zod';
import { DemoDeckNoteSchema, ReviewStatusSchema } from './content';
import { TaxonomyKeySchema } from './common';

/** Clave de un mazo del catálogo, la misma regla que deck_catalog.deck_key */
export const DeckCatalogKeySchema = z.string().regex(/^[a-z0-9-]{3,48}$/);
/** Clave de un submazo, la misma regla que deck_catalog_subjects.subject_key */
export const DeckSubjectKeySchema = z.string().regex(/^[a-z0-9-]{1,64}$/);

/** Tope de cada archivo subido, para no pasar de la subida estándar de Supabase (6 MB) */
export const DECK_PART_MAX_BYTES = 5_000_000;
/** Notas de muestra que ve Gratis, sin imágenes */
export const DECK_PREVIEW_MAX_NOTES = 5;

/**
 * Ruta de una imagen dentro de una nota del catálogo. La app la resuelve desde Dexie (deckMedia)
 * con una dirección blob, porque el archivo vive en un paquete .zip y no en el sitio
 */
export const DeckMediaPathSchema = z
  .string()
  .regex(
    /^\/deck-media\/[a-z0-9-]{3,48}\/[a-z0-9-]{1,64}\/[A-Za-z0-9._-]{1,120}\.(?:jpg|jpeg|png|gif|webp|svg)$/,
  );

/** El archivo .json de un submazo, con las notas ya saneadas (cardHtml.ts) */
export const DeckSubjectFileSchema = z.strictObject({
  version: z.literal(1),
  deckKey: DeckCatalogKeySchema,
  /** Versión del mazo en el catálogo, la carpeta v<n> */
  deckVersion: z.int().min(1),
  subjectKey: DeckSubjectKeySchema,
  name: z.string().min(1).max(120),
  branch: TaxonomyKeySchema.nullable(),
  topic: TaxonomyKeySchema.nullable(),
  /** Crédito visible del autor (D-053) */
  author: z.string().min(1).max(80),
  status: ReviewStatusSchema,
  /** Imágenes que usan las notas. Cada una llega en uno de los paquetes media-<k>.zip */
  media: z.array(DeckMediaPathSchema),
  /** Las notas, con la misma clave que tenían en la demo (mazo más 12 caracteres del sha256 del guid) */
  notes: z.array(DemoDeckNoteSchema).min(1),
});
export type DeckSubjectFile = z.infer<typeof DeckSubjectFileSchema>;

/** Nota de muestra de Gratis, sin imágenes */
export const DeckPreviewNoteSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('basic'),
    front: z.string().min(1).max(4000),
    back: z.string().max(4000),
  }),
  z.strictObject({
    kind: z.literal('cloze'),
    text: z.string().min(1).max(4000),
    extra: z.string().max(4000),
  }),
]);
export type DeckPreviewNote = z.infer<typeof DeckPreviewNoteSchema>;

/** Un submazo del manifiesto, con sus cifras y la huella de su .json */
export const DeckManifestSubjectSchema = z.strictObject({
  subjectKey: DeckSubjectKeySchema,
  name: z.string().min(1).max(120),
  branch: TaxonomyKeySchema.nullable(),
  topic: TaxonomyKeySchema.nullable(),
  notes: z.int().min(1),
  cards: z.int().min(1),
  jsonBytes: z.int().min(1),
  mediaBytes: z.int().min(0),
  /** Paquetes de imágenes de hasta 5 MB. 0 si el submazo no tiene imágenes */
  mediaParts: z.int().min(0).max(999),
  /** sha256 en hexadecimal del .json, para saber si cambió entre versiones */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type DeckManifestSubject = z.infer<typeof DeckManifestSubjectSchema>;

/**
 * Lo que manda el admin a admin_deck_catalog_register para crear una versión en uploading. La base
 * devuelve las rutas donde subir cada archivo
 */
export const DeckManifestSchema = z
  .strictObject({
    deckKey: DeckCatalogKeySchema,
    name: z.string().min(1).max(120),
    description: z.string().max(1000),
    author: z.string().min(1).max(80),
    /** own es de Studiare. third_party necesita autorización escrita confirmada por el dueño */
    license: z.enum(['own', 'third_party']),
    /** Quién autorizó, cuándo y dónde vive el documento. Obligatorio en los de terceros */
    authorizationNote: z.string().min(1).max(500).nullable(),
    subjects: z.array(DeckManifestSubjectSchema).min(1).max(200),
    preview: z.array(DeckPreviewNoteSchema).max(DECK_PREVIEW_MAX_NOTES),
  })
  .refine(
    (manifest) =>
      new Set(manifest.subjects.map((subject) => subject.subjectKey)).size ===
      manifest.subjects.length,
    { message: 'Cada submazo lleva una clave distinta', path: ['subjects'] },
  )
  .refine((manifest) => manifest.license === 'own' || manifest.authorizationNote !== null, {
    message: 'Un mazo de terceros necesita la nota de su autorización',
    path: ['authorizationNote'],
  });
export type DeckManifest = z.infer<typeof DeckManifestSchema>;

/** Ruta en el bucket del .json de un submazo */
export function deckSubjectPath(deckKey: string, version: number, subjectKey: string): string {
  return `${deckKey}/v${version}/${subjectKey}.json`;
}

/** Ruta en el bucket del paquete k (desde 1) de imágenes de un submazo */
export function deckMediaPartPath(
  deckKey: string,
  version: number,
  subjectKey: string,
  part: number,
): string {
  return `${deckKey}/v${version}/${subjectKey}.media-${part}.zip`;
}
