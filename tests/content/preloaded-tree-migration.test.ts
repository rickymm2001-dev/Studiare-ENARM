// Migración de los mazos de Paco al árbol de mazos (D-085, fila 3). Quien ya seguía mazos tenía cada
// uno plano y con etiquetas partidas con espacios. Al reacomodarlos no se pierde ninguna nota ni
// tarjeta, los IDs son los mismos para conservar el historial de repaso y ninguna etiqueta queda
// con espacios.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createEnarmDb } from '@/data/db/database';
import { createDexieRepositories } from '@/data/repos/dexie/createRepositories';
import { ensurePreloadedTree } from '@/data/usecases/decks';
import { buildDeckEntities, deckIds, ROOT_DECK_KEY } from '@/demo/content/deckEntities';
import { loadDemoDecks } from '@/demo/content/decks';
import { descendantIds } from '@/engines/deckTree';

const files = await loadDemoDecks();
const KEYS = files.map((file) => file.key);
const opened: ReturnType<typeof createEnarmDb>[] = [];
let counter = 0;
afterEach(async () => {
  await Promise.all(opened.splice(0).map((db) => db.delete()));
});

/** La base como estaba antes del árbol, cada mazo plano y con las etiquetas partidas con espacios */
async function legacyDatabase(keys: readonly string[]) {
  counter += 1;
  const db = createEnarmDb('real', { name: `migracion-arbol-${counter}-${Date.now()}` });
  opened.push(db);
  await db.open();
  const chosen = files.filter((file) => keys.includes(file.key));
  const entities = buildDeckEntities(chosen);
  const fileDeckOf = new Map(chosen.map((file) => [file.key, deckIds.deck(file.key)]));
  const sourceNote = new Map(
    chosen.flatMap((file) => file.notes.map((note) => [deckIds.note(note.key), note] as const)),
  );
  await db.decks.bulkPut(
    chosen.map((file) => {
      const deck = entities.decks.find((entry) => entry.id === deckIds.deck(file.key));
      const {
        parentId: _parent,
        updatedAt: _updated,
        ...legacy
      } = deck as NonNullable<typeof deck>;
      return legacy;
    }),
  );
  await db.notes.bulkPut(
    entities.notes.map((note) => {
      const source = sourceNote.get(note.id);
      const fileKey = chosen.find((file) => file.notes.includes(source as never))?.key as string;
      const { updatedAt: _updated, ...legacy } = note;
      return { ...legacy, deckId: fileDeckOf.get(fileKey) as string, tags: source?.tags ?? [] };
    }),
  );
  await db.cards.bulkPut(
    entities.cards.map((entry) => {
      const { updatedAt: _updated, ...legacy } = entry.card;
      return { ...legacy, deckId: fileDeckOf.get(entry.deckKey) as string };
    }),
  );
  return { db, repos: createDexieRepositories(db), entities };
}

describe('migración al árbol con los 3 mazos de Paco', () => {
  it(
    'compara conteos y claves antes y después, sin perder nada y sin espacios en las etiquetas',
    {
      timeout: 120_000,
    },
    async () => {
      const { db, repos, entities } = await legacyDatabase(KEYS);
      const before = {
        notes: (await db.notes.toArray()).map((note) => note.id).sort(),
        cards: (await db.cards.toArray()).map((card) => card.id).sort(),
      };
      // Antes, planos y con etiquetas con espacios
      expect((await db.decks.toArray()).every((deck) => !deck.parentId)).toBe(true);
      expect(
        (await db.notes.toArray()).some((note) => note.tags.some((tag) => /\s/.test(tag))),
      ).toBe(true);

      expect(await ensurePreloadedTree({ repos }, KEYS, () => Promise.resolve(files))).toBe(true);

      const notes = await db.notes.toArray();
      const cards = await db.cards.toArray();
      const decks = await db.decks.toArray();
      // Mismas claves, mismo número
      expect(notes.map((note) => note.id).sort()).toEqual(before.notes);
      expect(cards.map((card) => card.id).sort()).toEqual(before.cards);
      expect(notes).toHaveLength(3771);
      expect(decks).toHaveLength(entities.decks.length);
      // Etiquetas sin espacios
      for (const note of notes) for (const tag of note.tags) expect(tag).not.toMatch(/\s/);
      // Cada nota y cada tarjeta cuelgan de un mazo que existe y están bajo su rama
      const byId = new Map(decks.map((deck) => [deck.id, deck]));
      const rootId = deckIds.deck(ROOT_DECK_KEY);
      for (const card of cards) {
        expect(byId.has(card.deckId)).toBe(true);
      }
      for (const file of files) {
        const branch = byId.get(deckIds.deck(file.key));
        expect(branch?.parentId).toBe(rootId);
        const inBranch = descendantIds(decks, deckIds.deck(file.key));
        const expected = file.notes.map((note) => deckIds.note(note.key));
        const found = notes.filter((note) => inBranch.has(note.deckId)).map((note) => note.id);
        expect(found.sort()).toEqual(expected.sort());
      }
    },
  );

  it(
    'repetirla no cambia nada y es seguro con una selección parcial',
    { timeout: 120_000 },
    async () => {
      const { db, repos } = await legacyDatabase(['paco-urgencias']);
      expect(
        await ensurePreloadedTree({ repos }, ['paco-urgencias'], () => Promise.resolve(files)),
      ).toBe(true);
      const snapshot = JSON.stringify(await db.notes.orderBy('id').toArray());
      // La segunda vez ya está en el árbol y no hay nada que hacer
      expect(
        await ensurePreloadedTree({ repos }, ['paco-urgencias'], () => Promise.resolve(files)),
      ).toBe(false);
      expect(JSON.stringify(await db.notes.orderBy('id').toArray())).toBe(snapshot);
      // Solo trajo el mazo que seguía, no los otros dos
      expect(await db.notes.count()).toBe(123);
      expect((await db.decks.toArray()).map((deck) => deck.name)).toContain('ENARM 2027');
    },
  );

  it('sin mazos seguidos no hace nada', async () => {
    const { repos } = await legacyDatabase([]);
    expect(await ensurePreloadedTree({ repos }, [], () => Promise.resolve(files))).toBe(false);
  });
});
