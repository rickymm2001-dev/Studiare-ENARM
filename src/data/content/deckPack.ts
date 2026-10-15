// Parte un mazo de Anki por submazo para el catálogo compartido de mazos (B11, 4.8 del plan de B11).
// El submazo es el segundo nivel de la etiqueta de cada nota, como en deckEntities.ts. Las notas se
// sanean con cardHtml.ts y sus claves salen con la misma fórmula que scripts/content/import-paco-decks.ts
// (la clave del mazo más 12 caracteres del sha256 del guid de Anki), así quien ya seguía un mazo de la
// demo conserva su historial al bajarlo del catálogo. Las imágenes van en paquetes .zip de hasta 5 MB
// para subirlas sin la carga reanudable de Supabase (6 MB) y el .json se parte si pasa de 5 MB.
// Solo funciones, sin React ni Dexie. El sanitizador, las imágenes y el zip llegan de quien llama.
import {
  DECK_PART_MAX_BYTES,
  DECK_PREVIEW_MAX_NOTES,
  DeckManifestSchema,
  DeckSubjectFileSchema,
  deckMediaPartPath,
  deckSubjectPath,
  type DeckManifest,
  type DeckPreviewNote,
  type DeckSubjectFile,
} from '../schemas/deckCatalog';
import type { DemoDeckNote } from '../schemas/content';
import { sanitizeTag, tagSegments } from '@/engines/tagPath';

/** Una nota como la lee el importador (ParsedNote de src/data/import/types.ts) */
export interface PackNote {
  guid: string | null;
  kind: 'basic' | 'basic_reverse' | 'cloze';
  front: string;
  back: string;
  tags: readonly string[];
  deckPath: readonly string[];
}

export interface PackDeps {
  /** El sanitizador de cardHtml.ts. resolveMedia da la ruta nueva de una imagen o null */
  sanitize: (html: string, resolveMedia: (file: string) => string | null) => string;
  /** Los bytes de un archivo de medios del paquete por su nombre, o null si no viene */
  media: (name: string) => Uint8Array | null;
  /** Arma un .zip sin comprimir, como zipSync de fflate con level 0 */
  zip: (files: Record<string, Uint8Array>) => Uint8Array;
  /** La rama y el tema que se proponen para un submazo por los segmentos de su etiqueta */
  propose: (segments: readonly string[]) => { branch: string | null; topic: string | null };
}

export interface PackedSubject {
  subjectKey: string;
  name: string;
  branch: string | null;
  topic: string | null;
  notes: DemoDeckNote[];
  cards: number;
  /** El .json del submazo en UTF-8, ya validado */
  json: Uint8Array;
  /** Los paquetes de imágenes, cada uno de hasta 5 MB */
  mediaParts: Uint8Array[];
  mediaBytes: number;
  /** sha256 en hexadecimal del .json, para saber si cambió entre versiones */
  sha256: string;
}

export interface PackedDeck {
  subjects: PackedSubject[];
  /** Notas que no entraron, vacías o con un campo muy largo */
  skipped: number;
  /** Imágenes que no entraron, por pesar más que un paquete */
  skippedMedia: number;
}

const IMAGE = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
const MAX_FIELD = 20_000;
/** Lo que agrega el zip por archivo, de sobra, para no pasar el tope del paquete */
const ZIP_OVERHEAD = 256;
const encoder = new TextEncoder();

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** La clave de una nota, la misma que le dio import-paco-decks.ts en la demo */
export async function noteKeyOf(deckKey: string, guid: string): Promise<string> {
  return `${deckKey}-${(await sha256Hex(encoder.encode(guid))).slice(0, 12)}`;
}

/** Clave de submazo. Minúsculas, números y guiones, como deck_catalog_subjects.subject_key */
export function subjectKeyOf(name: string): string {
  const key = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return key === '' ? 'general' : key;
}

/** La etiqueta de origen de una nota, sus segmentos y el nombre de su submazo */
function subjectOf(note: PackNote): { sourceTag: string; segments: string[]; name: string } {
  const sourceTag = sanitizeTag(note.tags[0] ?? '');
  const segments = sourceTag === '' ? [...note.deckPath] : tagSegments(sourceTag);
  const raw = segments[1] ?? segments[0] ?? note.deckPath.at(-1) ?? 'General';
  return { sourceTag: sourceTag.slice(0, 200), segments, name: raw.replace(/_+/g, ' ').trim() };
}

/** Parte unos bytes en pedazos del tope de un paquete */
export function splitBytes(bytes: Uint8Array, max: number = DECK_PART_MAX_BYTES): Uint8Array[] {
  if (bytes.length <= max) return [bytes];
  const parts: Uint8Array[] = [];
  for (let start = 0; start < bytes.length; start += max)
    parts.push(bytes.slice(start, start + max));
  return parts;
}

/**
 * Agrupa las imágenes en paquetes de hasta max bytes, en orden. Una imagen que sola no cabe se omite y
 * se cuenta, porque la subida estándar de Supabase no la aceptaría
 */
export function groupMedia(
  files: readonly { name: string; bytes: Uint8Array }[],
  max: number = DECK_PART_MAX_BYTES,
): { groups: { name: string; bytes: Uint8Array }[][]; skipped: number } {
  const groups: { name: string; bytes: Uint8Array }[][] = [];
  let current: { name: string; bytes: Uint8Array }[] = [];
  let size = 0;
  let skipped = 0;
  for (const file of files) {
    const cost = file.bytes.length + ZIP_OVERHEAD + file.name.length * 2;
    if (cost > max) {
      skipped += 1;
      continue;
    }
    if (size + cost > max && current.length > 0) {
      groups.push(current);
      current = [];
      size = 0;
    }
    current.push(file);
    size += cost;
  }
  if (current.length > 0) groups.push(current);
  return { groups, skipped };
}

const clozeOrdinals = (text: string) => {
  const found = [...new Set([...text.matchAll(/\{\{c(\d+)::/g)].map((match) => Number(match[1])))];
  return found.length > 0 ? found.sort((a, b) => a - b) : [1];
};

export interface SubjectPlan {
  subjectKey: string;
  name: string;
  notes: number;
  /** La rama y el tema propuestos por su nombre, que el admin revisa */
  branch: string | null;
  topic: string | null;
}

/** Los submazos de un mazo con la rama y el tema propuestos, sin sanear nada todavía */
export function planSubjects(
  notes: readonly PackNote[],
  propose: PackDeps['propose'],
): SubjectPlan[] {
  const plans = new Map<string, SubjectPlan>();
  for (const note of notes) {
    const { segments, name } = subjectOf(note);
    const key = subjectKeyOf(name);
    const plan = plans.get(key);
    if (plan) plan.notes += 1;
    else plans.set(key, { subjectKey: key, name, notes: 1, ...propose(segments) });
  }
  return [...plans.values()].sort((a, b) => a.subjectKey.localeCompare(b.subjectKey));
}

/**
 * Parte el mazo por submazo con sus notas saneadas, sus imágenes en paquetes y la huella de cada .json.
 * deckVersion es la versión que tendrá en el catálogo, la carpeta v<n>. overrides lleva la rama y el
 * tema que eligió el admin para cada submazo, por su clave
 */
export async function packDeck(
  notes: readonly PackNote[],
  meta: { deckKey: string; deckVersion: number; author: string },
  deps: PackDeps,
  overrides: ReadonlyMap<string, { branch: string | null; topic: string | null }> = new Map(),
): Promise<PackedDeck> {
  const bySubject = new Map<
    string,
    { name: string; segments: string[]; entries: { note: PackNote; sourceTag: string }[] }
  >();
  for (const note of notes) {
    const { sourceTag, segments, name } = subjectOf(note);
    const key = subjectKeyOf(name);
    const group = bySubject.get(key) ?? { name, segments, entries: [] };
    group.entries.push({ note, sourceTag });
    bySubject.set(key, group);
  }

  const subjects: PackedSubject[] = [];
  let skipped = 0;
  let skippedMedia = 0;
  for (const [subjectKey, group] of [...bySubject].sort(([a], [b]) => a.localeCompare(b))) {
    const proposal = overrides.get(subjectKey) ?? deps.propose(group.segments);
    const files: { name: string; bytes: Uint8Array }[] = [];
    const pathOf = new Map<string, string>();
    const resolveMedia = (name: string): string | null => {
      const known = pathOf.get(name);
      if (known) return known;
      if (!IMAGE.test(name)) return null;
      const bytes = deps.media(name);
      if (!bytes) return null;
      const extension = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? 'png').toLowerCase();
      const file = `m-${String(files.length + 1).padStart(4, '0')}.${extension}`;
      const path = `/deck-media/${meta.deckKey}/${subjectKey}/${file}`;
      files.push({ name: file, bytes });
      pathOf.set(name, path);
      return path;
    };

    const packed: DemoDeckNote[] = [];
    const seen = new Set<string>();
    for (const { note, sourceTag } of group.entries) {
      const guid = note.guid ?? `${note.front}\u001f${note.back}`;
      const key = await noteKeyOf(meta.deckKey, guid);
      if (seen.has(key)) continue;
      seen.add(key);
      const base = {
        key,
        sourceTag,
        tags: tagSegments(sourceTag)
          .map((segment) => segment.replace(/[_-]+/g, ' ').trim().slice(0, 80))
          .filter(Boolean)
          .slice(0, 20),
        branch: proposal.branch,
        topic: proposal.topic,
      };
      if (note.kind === 'cloze') {
        const text = deps.sanitize(note.front, resolveMedia);
        const extra = deps.sanitize(note.back, resolveMedia);
        if (text.trim() === '' || text.length > MAX_FIELD || extra.length > MAX_FIELD) {
          skipped += 1;
          continue;
        }
        packed.push({ ...base, kind: 'cloze', text, extra, ordinals: clozeOrdinals(text) });
      } else {
        const front = deps.sanitize(note.front, resolveMedia);
        const back = deps.sanitize(note.back, resolveMedia);
        if (front.trim() === '' || front.length > MAX_FIELD || back.length > MAX_FIELD) {
          skipped += 1;
          continue;
        }
        packed.push({ ...base, kind: 'basic', front, back });
      }
    }
    if (packed.length === 0) continue;

    const media = groupMedia(files);
    skippedMedia += media.skipped;
    const inZip = new Set(media.groups.flat().map((file) => file.name));
    const subjectFile: DeckSubjectFile = DeckSubjectFileSchema.parse({
      version: 1,
      deckKey: meta.deckKey,
      deckVersion: meta.deckVersion,
      subjectKey,
      name: group.name.slice(0, 120) || subjectKey,
      branch: proposal.branch,
      topic: proposal.topic,
      author: meta.author,
      status: 'pending_physician_review',
      media: [...pathOf.values()].filter((path) => inZip.has(path.split('/').at(-1) ?? '')),
      notes: packed,
    });
    const json = encoder.encode(JSON.stringify(subjectFile));
    const mediaParts = media.groups.map((files) =>
      deps.zip(Object.fromEntries(files.map((file) => [file.name, file.bytes]))),
    );
    subjects.push({
      subjectKey,
      name: subjectFile.name,
      branch: proposal.branch,
      topic: proposal.topic,
      notes: packed,
      cards: packed.reduce(
        (total, note) => total + (note.kind === 'cloze' ? note.ordinals.length : 1),
        0,
      ),
      json,
      mediaParts,
      mediaBytes: mediaParts.reduce((total, part) => total + part.length, 0),
      sha256: await sha256Hex(json),
    });
  }
  return { subjects, skipped, skippedMedia };
}

const stripMedia = (html: string) =>
  html
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<(audio|video)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/\[sound:[^\]]*\]/gi, '')
    .trim();

/** Hasta 5 notas de muestra para Gratis, sin imágenes, una de cada submazo primero */
export function previewNotes(
  subjects: readonly Pick<PackedSubject, 'notes'>[],
  max: number = DECK_PREVIEW_MAX_NOTES,
): DeckPreviewNote[] {
  const preview: DeckPreviewNote[] = [];
  const queues = subjects.map((subject) => [...subject.notes]);
  while (preview.length < max && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const note = queue.shift();
      if (!note || preview.length >= max) continue;
      if (note.kind === 'basic') {
        const front = stripMedia(note.front).slice(0, 4000);
        if (front !== '')
          preview.push({ kind: 'basic', front, back: stripMedia(note.back).slice(0, 4000) });
      } else {
        const text = stripMedia(note.text).slice(0, 4000);
        if (text !== '')
          preview.push({ kind: 'cloze', text, extra: stripMedia(note.extra).slice(0, 4000) });
      }
    }
  }
  return preview;
}

export interface DeckMeta {
  deckKey: string;
  name: string;
  description: string;
  author: string;
  license: 'own' | 'third_party';
  authorizationNote: string | null;
}

/** El manifiesto para admin_deck_catalog_register, con la rama y el tema que dejó el admin */
export function manifestOf(meta: DeckMeta, subjects: readonly PackedSubject[]): DeckManifest {
  return DeckManifestSchema.parse({
    ...meta,
    subjects: subjects.map((subject) => ({
      subjectKey: subject.subjectKey,
      name: subject.name,
      branch: subject.branch,
      topic: subject.topic,
      notes: subject.notes.length,
      cards: subject.cards,
      jsonBytes: subject.json.length,
      mediaBytes: subject.mediaBytes,
      mediaParts: subject.mediaParts.length,
      sha256: subject.sha256,
    })),
    preview: previewNotes(subjects),
  });
}

/**
 * Lo que se sube a cada ruta de la versión. El .json entero hasta 5 MB y en .part-<k>.json arriba de
 * eso, igual que deck_catalog_expected en la base, y cada paquete de imágenes
 */
export function uploadFilesOf(
  deckKey: string,
  version: number,
  subjects: readonly PackedSubject[],
): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  for (const subject of subjects) {
    const parts = splitBytes(subject.json);
    if (parts.length === 1 && parts[0]) {
      files.set(deckSubjectPath(deckKey, version, subject.subjectKey), parts[0]);
    } else {
      parts.forEach((part, index) => {
        files.set(`${deckKey}/v${version}/${subject.subjectKey}.part-${index + 1}.json`, part);
      });
    }
    subject.mediaParts.forEach((part, index) => {
      files.set(deckMediaPartPath(deckKey, version, subject.subjectKey, index + 1), part);
    });
  }
  return files;
}

const IMG_SRC = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;

/** Los nombres de las imágenes que usan las notas, como vienen en el paquete */
export function referencedImages(notes: readonly Pick<PackNote, 'front' | 'back'>[]): Set<string> {
  const names = new Set<string>();
  for (const note of notes) {
    for (const field of [note.front, note.back]) {
      for (const match of field.matchAll(IMG_SRC)) {
        const raw = match[1] ?? '';
        let name = raw;
        try {
          name = decodeURIComponent(raw);
        } catch {
          // Un nombre con % suelto se usa tal cual
        }
        if (IMAGE.test(name)) names.add(name);
      }
    }
  }
  return names;
}

/**
 * Las imágenes del paquete .apkg que usan las notas, por su nombre. El paquete de Anki guarda cada una
 * con un número y un archivo media con el mapa de número a nombre. Solo se descomprimen las que se usan.
 * El formato nuevo de Anki guarda ese mapa de otra forma y aquí no se lee, así que sale vacío
 */
export function apkgMedia(
  read: (wanted: (name: string) => boolean) => Record<string, Uint8Array>,
  names: ReadonlySet<string>,
): Map<string, Uint8Array> {
  const found = new Map<string, Uint8Array>();
  if (names.size === 0) return found;
  const mapFile = read((name) => name === 'media').media;
  if (!mapFile) return found;
  let map: Record<string, unknown>;
  try {
    map = JSON.parse(new TextDecoder().decode(mapFile)) as Record<string, unknown>;
  } catch {
    return found;
  }
  const indexOf = new Map<string, string>();
  for (const [index, name] of Object.entries(map)) {
    if (typeof name === 'string' && names.has(name)) indexOf.set(index, name);
  }
  if (indexOf.size === 0) return found;
  const files = read((name) => indexOf.has(name));
  for (const [index, name] of indexOf) {
    const bytes = files[index];
    if (bytes) found.set(name, bytes);
  }
  return found;
}
