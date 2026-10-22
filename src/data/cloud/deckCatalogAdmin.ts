// El Catálogo de mazos del admin en la nube (B11, 1.15 y 4.8 del plan de B11). Lista los mazos con sus
// versiones, crea una versión en subida con su manifiesto, sube cada archivo al bucket deck-catalog con
// la sesión del admin y publica, retira o confirma la autorización. La subida es sin upsert, porque solo
// existe la política de insert, y un archivo que ya estaba subido cuenta como subido. Publicar revisa
// archivos y tamaños (BK011) antes que la autorización (BK010).
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type {
  DeckAdminEntry,
  DeckPublishResult,
  DeckRegisterResult,
  DeckRetireResult,
} from '../bank/contracts.ts';
import type { DeckManifest } from '../schemas/deckCatalog.ts';
import { EditorialError } from '../editorial/editorialRepo.ts';
import { callBankRpc, type ForbiddenHandler } from './editorial.ts';

type Cloud = Pick<SupabaseClient, 'rpc'>;
type Storage = Pick<SupabaseClient, 'storage'>;

export const DECK_CATALOG_BUCKET = 'deck-catalog';

const count = z.coerce.number().int().nonnegative();

const DeckAdminEntrySchema = z.object({
  deckKey: z.string(),
  name: z.string(),
  author: z.string(),
  description: z.string(),
  license: z.enum(['own', 'third_party']),
  authorizationNote: z.string().nullable(),
  authorizationConfirmedAt: z.string().nullable(),
  // Un servidor anterior a 20261024000001 no los manda
  authorizationConfirmedVersion: count.nullable().default(null),
  pendingConfirmationVersion: count.nullable().default(null),
  freeAccess: z.boolean().default(false),
  status: z.enum(['draft', 'published', 'retired']),
  publishedVersion: count.nullable(),
  versions: z.array(
    z.object({
      version: count,
      status: z.enum(['uploading', 'published', 'retired']),
      createdAt: z.string(),
      publishedAt: z.string().nullable(),
      files: count,
      uploaded: count,
    }),
  ),
  downloads: count,
}) satisfies z.ZodType<DeckAdminEntry>;

const RegisterSchema = z.object({
  deckKey: z.string(),
  version: count,
  status: z.literal('uploading'),
  files: z.array(
    z.object({
      subjectKey: z.string(),
      path: z.string(),
      contentType: z.enum(['application/json', 'application/zip']),
    }),
  ),
}) satisfies z.ZodType<DeckRegisterResult>;

export function readDeckCatalog(cloud: Cloud, onForbidden?: ForbiddenHandler) {
  return callBankRpc(
    cloud,
    'admin_deck_catalog_overview',
    {},
    z.array(DeckAdminEntrySchema),
    onForbidden,
  );
}

/** La versión que tendrá el siguiente registro de un mazo, para armar sus archivos antes */
export function nextDeckVersion(entries: readonly DeckAdminEntry[], deckKey: string): number {
  const versions = entries.find((entry) => entry.deckKey === deckKey)?.versions ?? [];
  return versions.reduce((max, version) => Math.max(max, version.version), 0) + 1;
}

export function registerDeckVersion(
  cloud: Cloud,
  manifest: DeckManifest,
  onForbidden?: ForbiddenHandler,
) {
  return callBankRpc(
    cloud,
    'admin_deck_catalog_register',
    { p_manifest: manifest },
    RegisterSchema,
    onForbidden,
  );
}

/** Sube un archivo de la versión en subida. Si ya estaba subido de un intento anterior, cuenta */
export async function uploadDeckFile(
  cloud: Storage,
  path: string,
  bytes: Uint8Array,
  contentType: 'application/json' | 'application/zip',
): Promise<void> {
  let reply: { error: unknown };
  try {
    reply = await cloud.storage
      .from(DECK_CATALOG_BUCKET)
      .upload(path, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: contentType }), {
        contentType,
        upsert: false,
      });
  } catch {
    throw new EditorialError('network');
  }
  if (!reply.error) return;
  const error = reply.error as { status?: unknown; statusCode?: unknown; message?: unknown };
  const duplicate =
    error.status === 409 ||
    error.statusCode === '409' ||
    (typeof error.message === 'string' && /already exists|duplicate/i.test(error.message));
  if (duplicate) return;
  if (error.status === 403 || error.statusCode === '403' || error.statusCode === '400') {
    throw new EditorialError('forbidden');
  }
  throw new EditorialError('unknown');
}

export function publishDeckVersion(
  cloud: Cloud,
  deckKey: string,
  version: number,
  onForbidden?: ForbiddenHandler,
): Promise<DeckPublishResult> {
  return callBankRpc(
    cloud,
    'admin_deck_catalog_publish',
    { p_deck_key: deckKey, p_version: version },
    z.enum(['published', 'already_published']),
    onForbidden,
  );
}

export function retireDeck(
  cloud: Cloud,
  deckKey: string,
  onForbidden?: ForbiddenHandler,
): Promise<DeckRetireResult> {
  return callBankRpc(
    cloud,
    'admin_deck_catalog_retire',
    { p_deck_key: deckKey },
    z.enum(['retired', 'already_retired']),
    onForbidden,
  );
}

/** Deja un mazo abierto o cerrado para el plan Gratis. Solo el admin */
export function setDeckFreeAccess(
  cloud: Cloud,
  deckKey: string,
  free: boolean,
  onForbidden?: ForbiddenHandler,
): Promise<'free' | 'paid'> {
  return callBankRpc(
    cloud,
    'admin_deck_catalog_set_free_access',
    { p_deck_key: deckKey, p_free: free },
    z.enum(['free', 'paid']),
    onForbidden,
  );
}

/** Solo el dueño. Con la nota de quién autorizó, cuándo y dónde vive el documento */
export async function confirmDeckAuthorization(
  cloud: Cloud,
  deckKey: string,
  note: string,
  onForbidden?: ForbiddenHandler,
): Promise<void> {
  await callBankRpc(
    cloud,
    'owner_confirm_deck_authorization',
    { p_deck_key: deckKey, p_note: note.trim() },
    z.unknown(),
    onForbidden,
  );
}
