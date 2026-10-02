// Convierte los mazos de Paco (.apkg) en mazos precargados de la demo (D-053).
// Uso: node scripts/content/import-paco-decks.ts <MI.apkg> <GyO.apkg> <Urgencias.apkg>
// Escribe src/demo/content/decks/<mazo>.json con las notas saneadas y public/demo-media/<mazo>/ con
// las imágenes que usan las notas. No trae el historial de repasos (D-010). Después corre
// npx prettier --write src/demo/content/decks y npx vitest run src/demo.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { unzipSync } from 'fflate';
import { JSDOM } from 'jsdom';
import { createCardSanitizer } from '../../src/data/content/cardHtml.ts';

const root = resolve(import.meta.dirname, '..', '..');

interface DeckConfig {
  key: string;
  name: string;
  description: string;
  /** Raíces de etiqueta que pertenecen a este mazo */
  roots: string[];
  branchOf: (segments: string[]) => { branch: string | null; topic: string | null };
}

const MI_TOPICS: Record<string, string> = {
  Gastroenterología: 'gastroenterology',
  Hematología: 'hematology',
  Infectología: 'infectious_diseases',
  Nefrología: 'nephrology',
  Neumología: 'pulmonology',
  Neurología: 'neurology',
  Reumatología: 'rheumatology',
};

// Subtemas del mazo de Ginecología y obstetricia en la taxonomía. Juicio de Claude, por revisar
const GYO_TOPICS: Record<string, string | null> = {
  Amenorreas: 'reproductive_endocrinology',
  AnticonceptivosyMPF: 'contraception',
  Infectología: 'gynecologic_infections',
  Infertilidad: 'reproductive_endocrinology',
  Menopausia: 'reproductive_endocrinology',
  Oncología: 'gynecologic_oncology',
  Patología_Mamaria: 'gynecologic_oncology',
  SUA: 'reproductive_endocrinology',
  Torsion_Ovarica: null,
  APP: 'labor_delivery',
  Cesárea: 'labor_delivery',
  Control_Prenatal: 'prenatal_care',
  Corioamnionitis: 'labor_delivery',
  DG: 'prenatal_care',
  Distocias: 'labor_delivery',
  Embarazo_Multiple: 'prenatal_care',
  Enfermedades_Hipertensivas: 'hypertensive_pregnancy',
  Hemorragias1T: 'early_pregnancy',
  Hemorragias3T: 'obstetric_hemorrhage',
  HigadoGraso: null,
  'Induccion/Conduccion': 'labor_delivery',
  Misceláneos: null,
  'Oligo/Polihidramnios': 'prenatal_care',
  Parto_Normal: 'labor_delivery',
  Patologia_Puerperal: 'puerperium',
  Puerperio: 'puerperium',
  RPM: 'labor_delivery',
};

const DECKS: DeckConfig[] = [
  {
    key: 'paco-mi',
    name: 'Medicina interna (Paco)',
    description: 'Mazo de Paco, compartido con su autorización. Demostración, no validado por médicos.',
    roots: ['Medicina-Interna'],
    branchOf: (segments) => ({
      branch: 'internal_medicine',
      topic: MI_TOPICS[segments[1] ?? ''] ?? null,
    }),
  },
  {
    key: 'paco-gyo',
    name: 'Ginecología y obstetricia (Paco)',
    description: 'Mazo de Paco, compartido con su autorización. Demostración, no validado por médicos.',
    roots: ['Ginecología', 'Obstetricia'],
    branchOf: (segments) => ({
      branch: 'obstetrics_gynecology',
      topic: GYO_TOPICS[segments[1] ?? ''] ?? null,
    }),
  },
  {
    key: 'paco-urgencias',
    name: 'Urgencias (Paco)',
    description:
      'Mazo de Paco, compartido con su autorización. Urgencias no es rama de la taxonomía todavía (D-013). Demostración, no validado por médicos.',
    roots: ['Urgencias'],
    branchOf: (segments) =>
      segments[1] === 'Quemaduras'
        ? { branch: 'general_surgery', topic: 'burns' }
        : { branch: null, topic: null },
  },
];

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
  ) as Record<string, { name: string; type: number }>;
  const rows = db.prepare('select id, mid, flds, tags from notes order by id').all() as {
    id: number;
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
    const path = `demo-media/${config.key}/m-${String(media.length + 1).padStart(4, '0')}${extension}`;
    writeFileSync(join(root, 'public', path), bytes);
    media.push(path);
    mediaPath.set(name, path);
    return path;
  };

  const notes = rows.map((row, index) => {
    const sourceTag = row.tags.trim().split(/\s+/)[0] ?? '';
    const segments = sourceTag.split('::');
    const { branch, topic } = config.branchOf(segments);
    const fields = row.flds.split('\x1f');
    const model = models[String(row.mid)];
    const isCloze = model?.type === 1 || /cloze/i.test(model?.name ?? '');
    const base = {
      key: `${config.key}-${String(index + 1).padStart(4, '0')}`,
      sourceTag,
      tags: segments.map((segment) => segment.replace(/[_-]+/g, ' ').trim()).filter(Boolean),
      branch,
      topic,
    };
    if (isCloze) {
      const text = sanitizer.sanitize(fields[0] ?? '', resolveMedia);
      const ordinals = [...new Set([...text.matchAll(/\{\{c(\d+)::/g)].map((m) => Number(m[1])))].sort(
        (a, b) => a - b,
      );
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
