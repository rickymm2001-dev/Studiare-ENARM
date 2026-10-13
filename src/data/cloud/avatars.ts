// Foto de perfil en Supabase Storage (B2 del plan del cambio, comentario 15). Vive en el bucket privado
// avatars, en la carpeta del auth.uid() del alumno, como <authId>/avatar.jpg. Las políticas de las
// migraciones 20261016000001 y 20261017000001 dejan verla solo a él y a sus compañeros de un grupo
// activo de Party. A Storage viaja únicamente el JPEG. El correo y el alias nunca.
//
// Entre los dispositivos del alumno gana la elección más reciente. La fecha la pone la app solo cuando
// el alumno guarda una foto distinta o pasa a iniciales en Tus datos, y viaja en la fila de
// private_accounts. Así un dispositivo con una copia vieja no impone la suya (revisión de B2).
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

/** true si el servidor respondió. Sin estado HTTP la petición ni llegó */
function answered(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status > 0
  );
}

/** Storage no pudo con la foto. network dice que la petición ni llegó al servidor */
export class AvatarStorageError extends Error {
  readonly network: boolean;
  constructor(error: unknown) {
    super(describe(error));
    this.name = 'AvatarStorageError';
    this.network = !answered(error);
  }
}

/** Corre una llamada a Storage y la convierte en AvatarStorageError si responde con error o se cae */
async function storageCall<T>(
  call: () => PromiseLike<{ data: T | null; error: unknown }>,
): Promise<T> {
  let result: { data: T | null; error: unknown };
  try {
    result = await call();
  } catch (error) {
    throw new AvatarStorageError(error);
  }
  if (result.error || result.data === null) throw new AvatarStorageError(result.error);
  return result.data;
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
  await storageCall(() =>
    cloud.storage
      .from(AVATAR_BUCKET)
      .upload(path, dataUrlToBlob(dataUrl), { upsert: true, contentType: 'image/jpeg' }),
  );
  return path;
}

/** Baja la foto como dataUrl. null si no existe, no se pudo bajar o no cabe en el esquema */
export async function downloadAvatar(cloud: CloudStorage, path: string): Promise<string | null> {
  if (!AVATAR_PATH.test(path)) return null;
  try {
    const blob = await storageCall(() => cloud.storage.from(AVATAR_BUCKET).download(path));
    const dataUrl = await blobToDataUrl(blob);
    return dataUrl.length > AVATAR_DATA_URL_MAX ? null : dataUrl;
  } catch {
    return null;
  }
}

/**
 * Quita la foto del alumno de su ruta fija, sin depender de lo que diga la fila. Quitar una foto que
 * no existe no falla, así que se puede repetir. Lanza AvatarStorageError si Storage falló
 */
export async function removeAvatar(cloud: CloudStorage, authId: string): Promise<void> {
  await storageCall(() => cloud.storage.from(AVATAR_BUCKET).remove([avatarPath(authId)]));
}

/** La foto de un lado y cuándo se eligió. changedAt es null si no se sabe, en cuentas de antes */
export interface AvatarSide<T> {
  avatar: T;
  changedAt: string | null;
}
export type LocalAvatar = AvatarSide<Account['avatar']>;
/** Lo que dice la fila. avatar es null sin fila o con un valor que no se reconoce */
export type RemoteAvatarState = AvatarSide<RemoteAvatar | null>;

/** Columnas de la foto en private_accounts */
export interface CloudAvatarColumns {
  avatar: RemoteAvatar;
  avatar_changed_at: string | null;
}

/** true si la nube ya tiene la misma elección que este navegador. generated cuenta como iniciales */
export function sameAvatar(local: Account['avatar'], remote: RemoteAvatar | null): boolean {
  if (local.kind === 'photo') {
    return remote?.kind === 'photo' && remote.hash === photoHash(local.dataUrl);
  }
  return remote?.kind !== 'photo';
}

/**
 * Qué hacer con la foto. push lleva a la nube la elección de este navegador, pull trae a este
 * navegador la de la nube y none es que ya coinciden o que no hay con qué decidir
 */
export type AvatarPlan = 'push' | 'pull' | 'none';

const timeOf = (value: string | null): number | null => {
  if (value === null) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
};

/**
 * Decide quién manda con la fecha de la elección. Gana la más reciente, y una fecha conocida gana a
 * una desconocida. Con la misma fecha y distinta foto manda este navegador, que es el dispositivo
 * activo, para reparar la nube. Sin fecha en ningún lado, como en cuentas de antes de B2, una foto
 * gana a las iniciales y la de la nube gana a otra foto, para que todos los dispositivos terminen con
 * la misma. Una fila que no se reconoce nunca se copia a este navegador
 */
export function planAvatarSync(local: LocalAvatar, remote: RemoteAvatarState): AvatarPlan {
  const localTime = timeOf(local.changedAt);
  const remoteTime = timeOf(remote.changedAt);
  if (localTime !== null && (remoteTime === null || localTime > remoteTime)) return 'push';
  if (remoteTime !== null && (localTime === null || remoteTime > localTime)) {
    return remote.avatar ? 'pull' : 'none';
  }
  if (sameAvatar(local.avatar, remote.avatar)) return 'none';
  if (localTime !== null) return 'push';
  if (remote.avatar?.kind === 'photo') return 'pull';
  return local.avatar.kind === 'photo' ? 'push' : 'none';
}

/**
 * Lleva a la nube la elección de este navegador. Con foto la sube si la nube no tiene esa misma. Con
 * iniciales quita la foto de su ruta fija, aunque la fila no diga que hay una. Devuelve las columnas
 * para la fila, con la fecha local, o null si Storage falló, para no tocar la fila y volver a
 * intentarlo en la siguiente sincronización. El motivo queda solo en consola
 */
export async function pushAvatar(
  cloud: CloudStorage,
  authId: string,
  local: LocalAvatar,
  remote: RemoteAvatar | null,
): Promise<CloudAvatarColumns | null> {
  const { avatar } = local;
  try {
    if (avatar.kind === 'photo') {
      const hash = photoHash(avatar.dataUrl);
      if (!sameAvatar(avatar, remote)) await uploadAvatar(cloud, authId, avatar.dataUrl);
      return {
        avatar: { kind: 'photo', path: avatarPath(authId), hash },
        avatar_changed_at: local.changedAt,
      };
    }
    await removeAvatar(cloud, authId);
    return { avatar: { kind: 'initials' }, avatar_changed_at: local.changedAt };
  } catch (error) {
    warnStorage(avatar.kind === 'photo' ? 'subir' : 'quitar', error);
    return null;
  }
}
