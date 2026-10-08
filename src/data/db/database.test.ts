import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { makeUser, newId } from '../testing/fixtures';
import { createEnarmDb, type EnarmDb } from './database';
import { storesFor } from './tables';

const names: string[] = [];
const open: EnarmDb[] = [];
afterEach(async () => {
  for (const db of open.splice(0)) db.close();
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

/** Una base como la dejó la versión 3, con una persona que tiene la confianza previa encendida */
async function oldDatabase(name: string, userId: string) {
  const old = new Dexie(name);
  old.version(3).stores(storesFor('real'));
  await old.open();
  const user = makeUser({ id: userId });
  await old.table('users').put({
    ...user,
    settings: { ...user.settings, cardConfidenceStep: true },
  });
  old.close();
}

describe('versiones de la base', () => {
  it('apaga la confianza previa una sola vez al subir de versión', async () => {
    const name = `migracion-${newId()}`;
    names.push(name);
    const userId = newId();
    await oldDatabase(name, userId);

    const db = createEnarmDb('real', { name });
    open.push(db);
    await db.open();
    expect((await db.users.get(userId))?.settings.cardConfidenceStep).toBe(false);

    // Si la persona la vuelve a encender, abrir la base de nuevo no la apaga otra vez
    const user = await db.users.get(userId);
    await db.users.put({
      ...(user as NonNullable<typeof user>),
      settings: { ...(user as NonNullable<typeof user>).settings, cardConfidenceStep: true },
    });
    db.close();
    const again = createEnarmDb('real', { name });
    open.push(again);
    await again.open();
    expect((await again.users.get(userId))?.settings.cardConfidenceStep).toBe(true);
  });

  it('sube de la versión 3 a la 5 llenando fechas de modificación y limpiando las etiquetas con espacios', async () => {
    const name = `migracion5-${newId()}`;
    names.push(name);
    const old = new Dexie(name);
    old.version(3).stores(storesFor('real'));
    await old.open();
    const stamp = '2026-10-01T15:00:00.000Z';
    const deckId = newId();
    const noteId = newId();
    const cardId = newId();
    await old.table('decks').put({
      id: deckId,
      name: 'Mazo',
      description: '',
      ownerId: null,
      origin: 'preloaded',
      visibility: 'public',
      isDemo: true,
      createdAt: stamp,
    });
    await old.table('notes').put({
      id: noteId,
      deckId,
      tags: ['Medicina Interna', 'Hipertensión Portal::Ascitis refractaria', 'medicina interna'],
      origin: 'preloaded',
      editorialStatus: 'draft',
      sourceQuote: null,
      sourceQuestionVersionId: null,
      isDemo: true,
      createdAt: stamp,
      kind: 'basic',
      front: 'a',
      back: 'b',
    });
    await old.table('cards').put({ id: cardId, noteId, deckId, ordinal: 0, createdAt: stamp });
    old.close();

    const db = createEnarmDb('real', { name });
    open.push(db);
    await db.open();
    const deck = await db.decks.get(deckId);
    const note = await db.notes.get(noteId);
    const card = await db.cards.get(cardId);
    expect(deck).toMatchObject({ parentId: null, updatedAt: stamp });
    expect(note?.updatedAt).toBe(stamp);
    // Sin espacios, con los niveles conservados y sin repetir la misma etiqueta
    expect(note?.tags).toEqual(['Medicina_Interna', 'Hipertensión_Portal::Ascitis_refractaria']);
    expect(card?.updatedAt).toBe(stamp);
  });

  it('una base de la versión 4 con el índice viejo de mazos sube a la 5 y abrirla otra vez no cambia nada', async () => {
    const name = `migracion4-${newId()}`;
    names.push(name);
    // La versión 4 todavía no tenía el índice parentId en los mazos
    const old = new Dexie(name);
    old.version(4).stores({ ...storesFor('real'), decks: 'id, ownerId, origin' });
    await old.open();
    const stamp = '2026-10-02T10:00:00.000Z';
    const deckId = newId();
    const noteId = newId();
    await old.table('decks').put({
      id: deckId,
      name: 'Mazo viejo',
      description: '',
      ownerId: null,
      origin: 'preloaded',
      visibility: 'public',
      isDemo: true,
      createdAt: stamp,
    });
    await old.table('notes').put({
      id: noteId,
      deckId,
      tags: ['Tema Uno::Subtema Dos'],
      origin: 'preloaded',
      editorialStatus: 'draft',
      sourceQuote: null,
      sourceQuestionVersionId: null,
      isDemo: true,
      createdAt: stamp,
      kind: 'basic',
      front: 'a',
      back: 'b',
    });
    old.close();

    const db = createEnarmDb('real', { name });
    open.push(db);
    await db.open();
    expect(db.verno).toBe(6);
    // El índice nuevo ya sirve y la nota quedó limpia
    expect(await db.decks.where('parentId').equals('').count()).toBe(0);
    expect((await db.decks.toArray()).filter((deck) => deck.parentId === null)).toHaveLength(1);
    const first = JSON.stringify(await db.notes.toArray());
    expect((await db.notes.get(noteId))?.tags).toEqual(['Tema_Uno::Subtema_Dos']);

    // Abrirla otra vez, y otra, no vuelve a tocar nada
    for (let round = 0; round < 2; round += 1) {
      db.close();
      const again = createEnarmDb('real', { name });
      open.push(again);
      await again.open();
      expect(JSON.stringify(await again.notes.toArray())).toBe(first);
    }
  });

  it('una base de la versión 5 sube a la 6, gana la tabla de apuntes y conserva sus datos', async () => {
    const name = `migracion6-${newId()}`;
    names.push(name);
    // La versión 5 todavía no tenía la tabla de apuntes
    const stores = Object.fromEntries(
      Object.entries(storesFor('real')).filter(([table]) => table !== 'outlines'),
    );
    const old = new Dexie(name);
    old.version(5).stores(stores);
    await old.open();
    const stamp = '2026-10-07T10:00:00.000Z';
    const deckId = newId();
    await old.table('decks').put({
      id: deckId,
      name: 'Mazo de la versión 5',
      description: '',
      ownerId: null,
      origin: 'preloaded',
      visibility: 'public',
      isDemo: true,
      parentId: null,
      createdAt: stamp,
      updatedAt: stamp,
    });
    old.close();

    const db = createEnarmDb('real', { name });
    open.push(db);
    await db.open();
    expect(db.verno).toBe(6);
    expect(await db.decks.get(deckId)).toMatchObject({ name: 'Mazo de la versión 5' });
    expect(await db.outlines.count()).toBe(0);
    // La tabla nueva ya sirve, con su índice por mazo
    const pageId = newId();
    const outlineDeckId = newId();
    await db.outlines.put({
      id: pageId,
      ownerId: newId(),
      title: 'Apunte',
      deckId: outlineDeckId,
      tags: [],
      lines: [],
      createdAt: stamp,
    });
    expect(
      (await db.outlines.where('deckId').equals(outlineDeckId).toArray()).map((p) => p.id),
    ).toEqual([pageId]);
  });

  it('una base nueva queda en la versión 6', async () => {
    const name = `nueva-${newId()}`;
    names.push(name);
    const db = createEnarmDb('real', { name });
    open.push(db);
    await db.open();
    expect(db.verno).toBe(6);
  });
});
