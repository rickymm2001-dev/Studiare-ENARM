// Convierte los mazos de Paco (.apkg) en mazos precargados de la demo (D-053). La rama y el tema de cada
// submazo salen de src/data/content/deckTopicMap.ts, que usa también el Catálogo de mazos (B11).
// Uso: node scripts/content/import-paco-decks.ts <MI.apkg> <GyO.apkg> <Urgencias.apkg>
// Escribe src/demo/content/decks/<mazo>.json con las notas saneadas y public/demo-media/<mazo>/ con
// las imágenes que usan las notas. No trae el historial de repasos (D-010). Después corre
// npx prettier --write src/demo/content/decks y npx vitest run src/demo.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { unzipSync } from 'fflate';
import { JSDOM } from 'jsdom';
import { createCardSanitizer } from '../../src/data/content/cardHtml.ts';
import { PACO_DECKS } from '../../src/data/content/deckTopicMap.ts';

const root = resolve(import.meta.dirname, '..', '..');

const DECKS = PACO_DECKS;

const sanitizer = createCardSanitizer(new JSDOM('').window);
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Uso: node scripts/content/import-paco-decks.ts <archivo.apkg> [...]');
  process.exit(1);
}

for (const file of files) {
  const zip = unzipSync(readFileSync(resolve(file)));
  const collection = zip['collection.anki21'] ?? zip['collection.anki2'];
  if (!collection) throw new Error(`${file} no trae collection.anki21`);
  const mediaMap = JSON.parse(new TextDecoder().decode(zip.media ?? new Uint8Array())) as Record<
    string,
    string
  >;
  const fileByName = new Map(Object.entries(mediaMap).map(([index, name]) => [name, index]));

  const temp = mkdtempSync(join(tmpdir(), 'paco-'));
  const dbPath = join(temp, 'collection.anki21');
  writeFileSync(dbPath, collection);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const models = JSON.parse(
    (db.prepare('select models from col').get() as { models: string }).models,
  ) as Record<string, { name: string; type: number; tmpls: unknown[] }>;
  // Una nota básica da una sola tarjeta. Un modelo con varias plantillas, como Basic (and reversed),
  // perdería tarjetas, así que se detiene la conversión para decidir qué hacer
  for (const model of Object.values(models)) {
    if (model.type !== 1 && model.tmpls.length > 1) {
      throw new Error(`El modelo ${model.name} tiene ${model.tmpls.length} plantillas`);
    }
  }
  const rows = db.prepare('select id, guid, mid, flds, tags from notes order by id').all() as {
    id: number;
    guid: string;
    mid: number;
    flds: string;
    tags: string;
  }[];
  db.close();
  rmSync(temp, { recursive: true, force: true });

  const firstTag = rows[0]?.tags.trim().split(/\s+/)[0] ?? '';
  const config = DECKS.find((deck) => deck.roots.includes(firstTag.split('::')[0] ?? ''));
  if (!config) throw new Error(`No sé a qué mazo corresponde ${file} (etiqueta ${firstTag})`);

  const mediaDir = join(root, 'public', 'demo-media', config.key);
  rmSync(mediaDir, { recursive: true, force: true });
  mkdirSync(mediaDir, { recursive: true });
  const media: string[] = [];
  const mediaPath = new Map<string, string>();
  const resolveMedia = (name: string): string | null => {
    const cached = mediaPath.get(name);
    if (cached) return cached;
    const index = fileByName.get(name);
    const bytes = index === undefined ? undefined : zip[index];
    const extension = extname(name).toLowerCase();
    if (!bytes || !/^\.(jpg|jpeg|png|gif|webp)$/.test(extension)) return null;
    const path = `/demo-media/${config.key}/m-${String(media.length + 1).padStart(4, '0')}${extension}`;
    writeFileSync(join(root, 'public', path.slice(1)), bytes);
    media.push(path);
    mediaPath.set(name, path);
    return path;
  };

  const notes = rows.map((row) => {
    const sourceTag = row.tags.trim().split(/\s+/)[0] ?? '';
    const segments = sourceTag.split('::');
    const { branch, topic } = config.branchOf(segments);
    const fields = row.flds.split('\x1f');
    const model = models[String(row.mid)];
    const isCloze = model?.type === 1 || /cloze/i.test(model?.name ?? '');
    const base = {
      // La clave sale del guid de Anki, que no cambia si Paco agrega o borra otras notas
      key: `${config.key}-${createHash('sha256').update(row.guid).digest('hex').slice(0, 12)}`,
      sourceTag,
      tags: segments.map((segment) => segment.replace(/[_-]+/g, ' ').trim()).filter(Boolean),
      branch,
      topic,
    };
    if (isCloze) {
      const text = sanitizer.sanitize(fields[0] ?? '', resolveMedia);
      const ordinals = [
        ...new Set([...text.matchAll(/\{\{c(\d+)::/g)].map((m) => Number(m[1]))),
      ].sort((a, b) => a - b);
      return {
        ...base,
        kind: 'cloze' as const,
        text,
        extra: sanitizer.sanitize(fields.slice(1).join('<br>'), resolveMedia),
        ordinals: ordinals.length > 0 ? ordinals : [1],
      };
    }
    return {
      ...base,
      kind: 'basic' as const,
      front: sanitizer.sanitize(fields[0] ?? '', resolveMedia) || '(sin texto)',
      back: sanitizer.sanitize(fields.slice(1).join('<br>'), resolveMedia),
    };
  });

  const deck = {
    version: 1,
    key: config.key,
    name: config.name,
    description: config.description,
    author: 'Paco',
    status: 'pending_physician_review',
    media,
    notes,
  };
  const target = join(root, 'src', 'demo', 'content', 'decks', `${config.key}.json`);
  mkdirSync(join(root, 'src', 'demo', 'content', 'decks'), { recursive: true });
  writeFileSync(target, `${JSON.stringify(deck, null, 2)}\n`, 'utf8');
  const unmapped = notes.filter((note) => note.topic === null).length;
  console.log(
    `${config.key}. ${notes.length} notas, ${media.length} imágenes, ${unmapped} sin tema de la taxonomía`,
  );
}
