// Bajar submazos del catálogo compartido de mazos (B11, 4.8 y 5.8 del plan de B11, respuestas 46 y 47).
// El alumno de pago baja los submazos que quiera. Cada uno llega como su .json (o en partes de hasta
// 5 MB, .part-<k>.json, que se juntan en orden) y sus imágenes en paquetes .zip de hasta 5 MB. Antes
// de guardar nada se revisa la huella sha256 del .json y se valida con DeckSubjectFileSchema, así un
// archivo raro en Storage no entra a Dexie. Las notas y tarjetas se guardan como precargadas con las
// mismas claves de la demo, así quien ya seguía esos mazos conserva su historial de repaso. Las
// imágenes van a Dexie (deckMedia) y se ven sin conexión. El mazo queda seguido.
import type { DeckCatalogEntry, DeckCatalogSubjectInfo } from '../bank/contracts';
import type { DataApi } from '../context';
import type { DeckDownload, DeckMedia } from '../schemas/bankCloud';
import type { DemoDeckFile } from '../schemas/content';
import {
  DeckSubjectFileSchema,
  deckMediaPartPath,
  deckSubjectPath,
  type DeckSubjectFile,
} from '../schemas/deckCatalog';
import type { User } from '../schemas/people';
import { saveDeckFiles, unfollowDeck } from './decks';
import { updateProfile } from './profile';

/** Lo que el caso de uso necesita de la nube. Lo arma src/data/cloud/deckCatalog.ts */
export interface CatalogFiles {
  /** Baja un archivo del bucket. Lanza un error con missing en true si no existe */
  download(path: string): Promise<Uint8Array<ArrayBuffer>>;
  /** Deja constancia de la bajada. No importa si falla */
  record(input: { deckKey: string; version: number; subjectKey: string; bytes: number }): unknown;
}

/** Abre un .zip y devuelve sus archivos por nombre */
export type Unzip = (bytes: Uint8Array) => Promise<Record<string, Uint8Array>>;

/** fflate se carga solo al bajar un submazo con imágenes */
export async function loadUnzip(): Promise<Unzip> {
  const { unzip } = await import('fflate');
  return (bytes) =>
    new Promise((resolve, reject) => {
      unzip(bytes, (error, files) => {
        if (error) reject(error);
        else resolve(files);
      });
    });
}

/** network, sin conexión. missing, falta un archivo. denied, Storage no lo dejó bajar. corrupt, no cuadra */
export type CatalogDeckFailure = 'network' | 'missing' | 'denied' | 'corrupt';

/** No se pudo bajar el submazo. Nada de él quedó guardado */
export class CatalogDeckError extends Error {
  readonly reason: CatalogDeckFailure;
  constructor(reason: CatalogDeckFailure) {
    super(`No se pudo bajar el submazo (${reason})`);
    this.name = 'CatalogDeckError';
    this.reason = reason;
  }
}

function failureOf(error: unknown): CatalogDeckFailure {
  const info = (typeof error === 'object' && error !== null ? error : {}) as {
    missing?: unknown;
    network?: unknown;
  };
  if (info.missing === true) return 'missing';
  return info.network === false ? 'denied' : 'network';
}

/** Junta el .json del submazo, entero o en partes */
async function subjectJson(
  files: CatalogFiles,
  deckKey: string,
  version: number,
  subjectKey: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const whole = deckSubjectPath(deckKey, version, subjectKey);
  try {
    return await files.download(whole);
  } catch (error) {
    if (failureOf(error) !== 'missing') throw new CatalogDeckError(failureOf(error));
  }
  // Arriba de 5 MB el .json va partido. Las partes se juntan en orden hasta la primera que falte
  const parts: Uint8Array<ArrayBuffer>[] = [];
  for (let part = 1; part <= 999; part += 1) {
    try {
      parts.push(await files.download(whole.replace(/\.json$/, `.part-${part}.json`)));
    } catch (error) {
      if (failureOf(error) !== 'missing') throw new CatalogDeckError(failureOf(error));
      break;
    }
  }
  if (parts.length === 0) throw new CatalogDeckError('missing');
  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const MEDIA_TYPES: Record<string, DeckMedia['type']> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

/** El archivo del submazo como lo guarda saveDeckFiles, igual que un mazo de la demo */
function deckFileOf(deck: DeckCatalogEntry, file: DeckSubjectFile): DemoDeckFile {
  return {
    version: 1,
    key: deck.deckKey,
    name: deck.name,
    description: deck.description,
    author: file.author,
    status: file.status,
    // Las imágenes del catálogo viven en deckMedia, no en el sitio
    media: [],
    notes: file.notes,
  };
}

export interface SubjectDownload {
  notes: number;
  images: number;
  bytes: number;
}

/**
 * Baja un submazo, lo guarda, sigue su mazo y anota la bajada. Si algo falla antes de guardar, nada
 * queda a medias. Lanza CatalogDeckError
 */
export async function downloadCatalogSubject(input: {
  api: Pick<DataApi, 'repos' | 'recordEvent'>;
  user: User;
  deck: DeckCatalogEntry;
  subject: DeckCatalogSubjectInfo;
  files: CatalogFiles;
  unzip?: () => Promise<Unzip>;
  now?: Date;
}): Promise<SubjectDownload> {
  const { deck, subject, files } = input;
  const json = await subjectJson(files, deck.deckKey, deck.version, subject.subjectKey);
  if ((await sha256Hex(json)) !== subject.sha256) throw new CatalogDeckError('corrupt');
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(json));
  } catch {
    throw new CatalogDeckError('corrupt');
  }
  const parsed = DeckSubjectFileSchema.safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.deckKey !== deck.deckKey ||
    parsed.data.deckVersion !== deck.version ||
    parsed.data.subjectKey !== subject.subjectKey
  ) {
    throw new CatalogDeckError('corrupt');
  }
  const file = parsed.data;

  // Las imágenes, solo las que el submazo dice que usa
  const wanted = new Set(file.media);
  const media: DeckMedia[] = [];
  let bytes = json.length;
  if (subject.mediaParts > 0) {
    const unzip = await (input.unzip ?? loadUnzip)();
    for (let part = 1; part <= subject.mediaParts; part += 1) {
      let zip: Uint8Array<ArrayBuffer>;
      try {
        zip = await files.download(
          deckMediaPartPath(deck.deckKey, deck.version, subject.subjectKey, part),
        );
      } catch (error) {
        throw new CatalogDeckError(failureOf(error));
      }
      bytes += zip.length;
      let entries: Record<string, Uint8Array>;
      try {
        entries = await unzip(zip);
      } catch {
        throw new CatalogDeckError('corrupt');
      }
      for (const [name, content] of Object.entries(entries)) {
        const fileName = name.split('/').pop() ?? '';
        const path = `/deck-media/${deck.deckKey}/${subject.subjectKey}/${fileName}`;
        const type = MEDIA_TYPES[fileName.split('.').pop()?.toLowerCase() ?? ''];
        if (!wanted.has(path) || !type) continue;
        media.push({
          path,
          deckKey: deck.deckKey,
          subjectKey: subject.subjectKey,
          deckVersion: deck.version,
          type,
          // Una copia propia, porque fflate puede devolver vistas de un mismo búfer
          blob: new Blob([new Uint8Array(content)], { type }),
        });
      }
    }
  }

  await input.api.repos.deckMedia.putMany(media);
  await saveDeckFiles(input.api, [deckFileOf(deck, file)], { isDemo: false });
  if (!input.user.settings.followedDecks.includes(deck.deckKey)) {
    await updateProfile(input.api, input.user, {
      settings: { followedDecks: [...input.user.settings.followedDecks, deck.deckKey] },
    });
  }
  const download: DeckDownload = {
    deckKey: deck.deckKey,
    subjectKey: subject.subjectKey,
    version: deck.version,
    sha256: subject.sha256,
    bytes,
    at: (input.now ?? new Date()).toISOString(),
  };
  const previous = (await input.api.repos.bankState.get('decks'))?.downloads ?? [];
  await input.api.repos.bankState.put({
    key: 'decks',
    downloads: [
      ...previous.filter(
        (item) => !(item.deckKey === deck.deckKey && item.subjectKey === subject.subjectKey),
      ),
      download,
    ],
  });
  void Promise.resolve(
    files.record({
      deckKey: deck.deckKey,
      version: deck.version,
      subjectKey: subject.subjectKey,
      bytes,
    }),
  ).catch(() => undefined);
  return { notes: file.notes.length, images: media.length, bytes };
}

/**
 * Quitar descargas de un mazo (8.32). Quita sus imágenes, que son lo que pesa, y sus bajadas de este
 * navegador, y deja de seguirlo para que Repasar no muestre tarjetas sin imagen. Las notas, las
 * tarjetas y sus repasos se quedan, así que al volver a bajarlo el alumno sigue donde iba
 */
export async function removeCatalogDownloads(
  api: Pick<DataApi, 'repos' | 'recordEvent'>,
  user: User,
  deckKey: string,
): Promise<number> {
  const removed = await api.repos.deckMedia.removeForDeck(deckKey);
  const previous = (await api.repos.bankState.get('decks'))?.downloads ?? [];
  await api.repos.bankState.put({
    key: 'decks',
    downloads: previous.filter((item) => item.deckKey !== deckKey),
  });
  if (user.settings.followedDecks.includes(deckKey)) await unfollowDeck(api, user, deckKey);
  return removed;
}

/** Vuelve a seguir un mazo del catálogo que sigue bajado en este navegador, sin bajarlo otra vez */
export async function refollowCatalogDeck(
  api: Pick<DataApi, 'repos' | 'recordEvent'>,
  user: User,
  deckKey: string,
): Promise<void> {
  if (user.settings.followedDecks.includes(deckKey)) return;
  await updateProfile(api, user, {
    settings: { followedDecks: [...user.settings.followedDecks, deckKey] },
  });
}

/** Cómo está cada submazo en este navegador. update si la versión nueva trae otro .json */
export type SubjectState = 'none' | 'current' | 'update';

export function subjectStates(
  deck: Pick<DeckCatalogEntry, 'deckKey' | 'subjects'>,
  downloads: readonly DeckDownload[],
): Map<string, SubjectState> {
  const mine = new Map(
    downloads
      .filter((item) => item.deckKey === deck.deckKey)
      .map((item) => [item.subjectKey, item] as const),
  );
  return new Map(
    deck.subjects.map((subject) => {
      const done = mine.get(subject.subjectKey);
      const state: SubjectState = !done
        ? 'none'
        : done.sha256 === subject.sha256
          ? 'current'
          : 'update';
      return [subject.subjectKey, state] as const;
    }),
  );
}

/**
 * Pide al navegador que no borre lo guardado cuando le falte espacio, antes de la primera bajada
 * (8.32). En el teléfono las imágenes pueden ser decenas de MB. Si el navegador no sabe, sigue igual
 */
/** Lo que se usa de navigator.storage. Un navegador viejo puede no traerlo */
interface PersistableStorage {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
}

export async function askPersistentStorage(
  storage: PersistableStorage | undefined = (
    globalThis as { navigator?: { storage?: PersistableStorage } }
  ).navigator?.storage,
): Promise<boolean> {
  try {
    if (!storage?.persist || !storage.persisted) return false;
    if (await storage.persisted()) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}
