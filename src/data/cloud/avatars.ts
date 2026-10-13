// Foto de perfil en Supabase Storage (B2 del plan del cambio, comentario 15). Vive en el bucket privado
// avatars, en la carpeta del auth.uid() del alumno, como <authId>/avatar.jpg. Las políticas de la
// migración 20261016000001 dejan verla solo a él, a sus compañeros de Party y a los admins. A Storage
// viaja únicamente el JPEG. El correo y el alias nunca.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AVATAR_DATA_URL_MAX, AVATAR_DATA_URL_PREFIX, type Account } from '@/data/schemas/people';

export const AVATAR_BUCKET = 'avatars';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** Ruta de la foto dentro del bucket. Solo la carpeta del alumno y un solo archivo */
export const AVATAR_PATH = new RegExp(`^${UUID}/avatar\\.jpg$`);

/**
 * Lo que guarda private_accounts.avatar. La foto no va en la fila, solo su ruta en Storage y una
 * huella del contenido para no volver a subir la misma foto en cada sincronización. generated son
 * filas de antes de B2 y se tratan como iniciales
 */
export const RemoteAvatarSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('initials') }),
  z.object({ kind: z.literal('generated') }),
  z.object({
    kind: z.literal('photo'),
    path: z.string().regex(AVATAR_PATH),
    hash: z
      .string()
      .regex(/^[0-9a-f]{8}$/)
      .optional(),
  }),
]);
export type RemoteAvatar = z.infer<typeof RemoteAvatarSchema>;

/** Valor remoto válido o null si la fila trae algo que no se reconoce */
export function parseRemoteAvatar(value: unknown): RemoteAvatar | null {
  const parsed = RemoteAvatarSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const avatarPath = (authId: string) => `${authId}/avatar.jpg`;

/** Huella corta y estable del dataUrl (FNV-1a de 32 bits). La misma foto da la misma huella */
export function photoHash(dataUrl: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < dataUrl.length; index += 1) {
    hash ^= dataUrl.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Bytes del JPEG a partir del dataUrl que guarda la cuenta */
export function dataUrlToBlob(dataUrl: string): Blob {
  if (!dataUrl.startsWith(AVATAR_DATA_URL_PREFIX)) {
    throw new Error('La foto no es un JPEG en base64');
  }
  const binary = atob(dataUrl.slice(AVATAR_DATA_URL_PREFIX.length));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: 'image/jpeg' });
}

/** El dataUrl que guarda la cuenta a partir de los bytes que bajó Storage */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return `${AVATAR_DATA_URL_PREFIX}${btoa(binary)}`;
}

type CloudStorage = Pick<SupabaseClient, 'storage'>;

function describe(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return 'error desconocido';
}

/** Deja constancia en consola de qué falló en Storage. Sin ruta, correo ni alias */
function warnStorage(action: string, error: unknown): void {
  console.warn(`La foto de perfil no se pudo ${action}. ${describe(error)}`);
}

/** Sube la foto a la carpeta del alumno y reemplaza la anterior. Devuelve la ruta o lanza si falló */
export async function uploadAvatar(
  cloud: CloudStorage,
  authId: string,
  dataUrl: string,
): Promise<string> {
  const path = avatarPath(authId);
  const { error } = await cloud.storage
    .from(AVATAR_BUCKET)
    .upload(path, dataUrlToBlob(dataUrl), { upsert: true, contentType: 'image/jpeg' });
  if (error) throw new Error(describe(error));
  return path;
}

/** Baja la foto como dataUrl. null si no existe, no se pudo bajar o no cabe en el esquema */
export async function downloadAvatar(cloud: CloudStorage, path: string): Promise<string | null> {
  if (!AVATAR_PATH.test(path)) return null;
  const { data, error } = await cloud.storage.from(AVATAR_BUCKET).download(path);
  if (error) return null;
  const dataUrl = await blobToDataUrl(data);
  return dataUrl.length > AVATAR_DATA_URL_MAX ? null : dataUrl;
}

/** Quita la foto del bucket. Lanza si falló */
export async function removeAvatar(cloud: CloudStorage, path: string): Promise<void> {
  const { error } = await cloud.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) throw new Error(describe(error));
}

/**
 * Qué guardar en private_accounts.avatar para que la nube refleje la elección local, y lo que eso
 * implica en Storage. Con foto, la sube si la huella cambió. Sin foto, borra la que hubiera. Si
 * Storage falla, la cuenta se guarda igual con lo que la nube ya tenía y se vuelve a intentar en la
 * siguiente sincronización. El motivo queda solo en consola
 */
export async function syncAvatarToStorage(
  cloud: CloudStorage,
  authId: string,
  local: Account['avatar'],
  remote: RemoteAvatar | null,
): Promise<RemoteAvatar> {
  if (local.kind !== 'photo') {
    if (remote?.kind === 'photo') {
      try {
        await removeAvatar(cloud, remote.path);
      } catch (error) {
        warnStorage('quitar', error);
        return remote;
      }
    }
    return { kind: 'initials' };
  }
  const hash = photoHash(local.dataUrl);
  if (remote?.kind === 'photo' && remote.hash === hash) return remote;
  try {
    const path = await uploadAvatar(cloud, authId, local.dataUrl);
    return { kind: 'photo', path, hash };
  } catch (error) {
    warnStorage('subir', error);
    return remote?.kind === 'photo' ? remote : { kind: 'initials' };
  }
}
