// Catálogo compartido de mazos para el alumno (B11, 4.8 y 5.8 del plan de B11, respuestas 46 y 47).
// Lista los mazos publicados con deck_catalog_list y baja los archivos de un submazo del bucket privado
// deck-catalog con la sesión del alumno. Storage solo deja bajar a los planes de pago y al equipo, desde
// el dispositivo activo y de una versión publicada (deck_catalog_can_read). Gratis ve la lista y la
// vista previa sin imágenes. Cada respuesta se valida con zod, porque el servidor es un tercero.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { DeckCatalogList } from '../bank/contracts';
import {
  DeckCatalogKeySchema,
  DeckPreviewNoteSchema,
  DeckSubjectKeySchema,
} from '../schemas/deckCatalog';
import { bankFailureOf, type BankReply } from './bank';

type Rpc = Pick<SupabaseClient, 'rpc'>;
type Storage = Pick<SupabaseClient, 'storage'>;

export const DECK_CATALOG_BUCKET = 'deck-catalog';

const SubjectSchema = z.object({
  subjectKey: DeckSubjectKeySchema,
  name: z.string().min(1).max(120),
  branch: z.string().nullable(),
  topic: z.string().nullable(),
  notes: z.int().min(0),
  cards: z.int().min(0),
  bytes: z.number().int().min(0),
  mediaParts: z.int().min(0),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

const DeckSchema = z.object({
  deckKey: DeckCatalogKeySchema,
  name: z.string().min(1).max(120),
  author: z.string().min(1).max(80),
  description: z.string().max(1000),
  version: z.int().min(1),
  notes: z.int().min(0),
  cards: z.int().min(0),
  bytes: z.number().int().min(0),
  subjects: z.array(SubjectSchema),
  // Una nota de muestra que no se entiende se deja fuera, sin tirar el mazo
  preview: z.array(z.unknown()).transform((notes) =>
    notes.flatMap((note) => {
      const parsed = DeckPreviewNoteSchema.safeParse(note);
      return parsed.success ? [parsed.data] : [];
    }),
  ),
});

const ListSchema = z.object({ canDownload: z.boolean(), decks: z.array(DeckSchema) });

/** Los mazos publicados con sus submazos. canDownload es false en Gratis */
export async function fetchDeckCatalog(cloud: Rpc): Promise<BankReply<DeckCatalogList>> {
  try {
    const reply = await cloud.rpc('deck_catalog_list');
    if (reply.error) return { ok: false, reason: bankFailureOf(reply.error) };
    const parsed = ListSchema.safeParse(reply.data as unknown);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: 'unknown' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Deja constancia en la nube de un submazo bajado, para medir la transferencia (6.4). No lanza */
export async function recordDeckDownload(
  cloud: Rpc,
  input: { deckKey: string; version: number; subjectKey: string; bytes: number },
): Promise<boolean> {
  try {
    const reply = await cloud.rpc('record_deck_download', {
      p_deck_key: input.deckKey,
      p_version: input.version,
      p_subject_key: input.subjectKey,
      p_bytes: input.bytes,
    });
    return !reply.error;
  } catch {
    return false;
  }
}

/** Storage no pudo con un archivo. missing dice que no existe y network que la petición ni llegó */
export class DeckFileError extends Error {
  readonly missing: boolean;
  readonly network: boolean;
  constructor(error: unknown) {
    const info = (typeof error === 'object' && error !== null ? error : {}) as {
      message?: unknown;
      status?: unknown;
      statusCode?: unknown;
    };
    const message = typeof info.message === 'string' ? info.message : 'error desconocido';
    super(message);
    this.name = 'DeckFileError';
    const status = Number(info.status ?? info.statusCode);
    this.network = !(status > 0);
    // Storage responde 400 con not_found, o 404, a un objeto que no existe
    this.missing = status === 404 || (status === 400 && /not.?found/i.test(message));
  }
}

/** Baja un archivo del bucket del catálogo. Lanza DeckFileError si no se pudo */
export async function downloadDeckFile(
  cloud: Storage,
  path: string,
): Promise<Uint8Array<ArrayBuffer>> {
  let result: { data: Blob | null; error: unknown };
  try {
    result = await cloud.storage.from(DECK_CATALOG_BUCKET).download(path);
  } catch (error) {
    throw new DeckFileError(error);
  }
  if (result.error || !result.data) throw new DeckFileError(result.error);
  return new Uint8Array(await result.data.arrayBuffer());
}
