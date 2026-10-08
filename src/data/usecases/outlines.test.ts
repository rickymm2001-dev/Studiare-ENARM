import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { newId } from '../ids';
import { draftOf } from './manualDecks';
import type { OutlineLine } from '../schemas/outlines';
import { makeUser, testApi } from '../testing/fixtures';
import {
  OutlineError,
  OUTLINES_ROOT_DECK,
  createOutline,
  deleteOutline,
  renameOutline,
  saveOutline,
} from './outlines';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

function setup() {
  const api = testApi('real');
  disposers.push(api.dispose);
  return { api, user: makeUser() };
}

const line = (text: string, depth = 0, noteId: string | null = null): OutlineLine => ({
  id: newId(),
  depth,
  text,
  noteId,
});

const later = (seconds: number) => new Date(Date.UTC(2026, 9, 8, 12, 0, seconds));

describe('crear apuntes', () => {
  it('crea el apunte dentro del mazo Apuntes y lo deja con una línea vacía', async () => {
    const { api, user } = setup();
    const page = await createOutline(api, user, { title: '  Cardiología  ' });
    expect(page.title).toBe('Cardiología');
    expect(page.lines).toHaveLength(1);
    const deck = await api.repos.decks.get(page.deckId);
    const root = (await api.repos.decks.list()).find((entry) => entry.id === deck?.parentId);
    expect(root?.name).toBe(OUTLINES_ROOT_DECK);
    expect(deck).toMatchObject({ name: 'Cardiología', origin: 'manual', ownerId: user.id });
  });

  it('un segundo apunte reutiliza el mazo raíz', async () => {
    const { api, user } = setup();
    await createOutline(api, user, { title: 'Uno' });
    await createOutline(api, user, { title: 'Dos' });
    const roots = (await api.repos.decks.list()).filter((deck) => deck.name === OUTLINES_ROOT_DECK);
    expect(roots).toHaveLength(1);
  });

  it('rechaza un título vacío o repetido, sin importar mayúsculas ni acentos', async () => {
    const { api, user } = setup();
    await createOutline(api, user, { title: 'Cardiología' });
    await expect(createOutline(api, user, { title: 'cardiologia' })).rejects.toMatchObject({
      code: 'duplicate_title',
    });
    await expect(createOutline(api, user, { title: '   ' })).rejects.toBeInstanceOf(OutlineError);
  });

  it('renombrar cambia también el nombre del mazo', async () => {
    const { api, user } = setup();
    const page = await createOutline(api, user, { title: 'Viejo' });
    const renamed = await renameOutline(api, user, page.id, 'Nuevo');
    expect(renamed.title).toBe('Nuevo');
    expect((await api.repos.decks.get(page.deckId))?.name).toBe('Nuevo');
    await createOutline(api, user, { title: 'Otro' });
    await expect(renameOutline(api, user, page.id, 'otro')).rejects.toMatchObject({
      code: 'duplicate_title',
    });
  });

  it('otra persona no puede abrir ni guardar el apunte', async () => {
    const { api, user } = setup();
    const page = await createOutline(api, user, { title: 'Mío' });
    const stranger = makeUser();
    await expect(saveOutline(api, stranger, page.id, { lines: [] })).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('guardar un apunte', () => {
  it('cada línea con marca completa crea su nota y sus cartas en el mazo del apunte', async () => {
    const { api, user } = setup();
    const page = await createOutline(api, user, { title: 'Cardio' });
    const result = await saveOutline(
      api,
      user,
      page.id,
      {
        lines: [
          line('Cardiología #cardio'),
          line('Triada de Beck :: Hipotensión, yugulares y ruidos apagados', 1),
          line('Metformina ;; Biguanida', 1),
          line('La {{troponina}} sube a las {{3 horas}}', 1),
          line('Una idea suelta', 1),
        ],
      },
      later(1),
    );
    expect(result.written).toBe(3);
    expect(result.removed).toBe(0);
    const notes = await api.repos.notes.list();
    expect(notes).toHaveLength(3);
    expect(notes.every((note) => note.deckId === page.deckId && note.origin === 'manual')).toBe(
      true,
    );
    expect(notes.map((note) => note.kind).sort()).toEqual(['basic', 'basic_reverse', 'cloze']);
    const cards = await api.repos.cards.list();
    // 1 de la básica, 2 de la inversa y 2 huecos
    expect(cards).toHaveLength(5);
    // Las líneas guardan el ID de su nota
    const marked = result.page.lines.filter((entry) => entry.noteId);
    expect(marked).toHaveLength(3);
    // Las etiquetas se heredan de la línea de arriba
    const triada = notes.find((note) => note.kind === 'basic');
    expect(triada?.tags).toEqual(['cardio']);
  });

  it('editar una línea conserva el ID de la nota y de sus cartas', async () => {
    const { api, user } = setup();
    const page = await createOutline(api, user, { title: 'Cardio' });
    const first = await saveOutline(
      api,
      user,
      page.id,
      { lines: [line('La {{troponina}} sube en el infarto')] },
      later(1),
    );
    const [lineBefore] = first.page.lines;
    const noteId = lineBefore?.noteId;
    const cardIds = (await api.repos.cards.list()).map((card) => card.id);
    const second = await saveOutline(
      api,
      user,
      page.id,
      { lines: [{ ...(lineBefore as OutlineLine), text: 'La {{troponina}} sube a las 3 horas' }] },
      later(2),
    );
    expect(second.written).toBe(1);
    expect(second.page.lines[0]?.noteId).toBe(noteId);
    expect(await api.repos.notes.list()).toHaveLength(1);
    expect((await api.repos.cards.list()).map((card) => card.id)).toEqual(cardIds);
  });

  it('guardar dos veces lo mismo no escribe nada', async () => {
    const { api, user } = setup();
    const page = await createOutline(api, user, { title: 'Cardio' });
    const lines = [line('A :: B'), line('Texto libre')];
    const first = await saveOutline(api, user, page.id, { lines }, later(1));
    const again = await saveOutline(api, user, page.id, { lines: first.page.lines }, later(2));
    expect(again.written).toBe(0);
    expect(again.removed).toBe(0);
    expect(again.page.updatedAt).toBe(first.page.updatedAt);
  });

  it('una línea incompleta no toca la última tarjeta buena y se reporta', async () => {
    const { api, user } = setup();
    const page = await createOutline(api, user, { title: 'Cardio' });
    const first = await saveOutline(
      api,
      user,
      page.id,
      { lines: [line('Pregunta :: Respuesta')] },
      later(1),
    );
    const [saved] = first.page.lines;
    const second = await saveOutline(
      api,
      user,
      page.id,
      { lines: [{ ...(saved as OutlineLine), text: 'Pregunta nueva ::' }] },
      later(2),
    );
    expect(second.problems).toEqual([{ lineId: saved?.id, error: 'empty_back' }]);
    expect(second.removed).toBe(0);
    expect(second.page.lines[0]?.noteId).toBe(saved?.noteId);
    const notes = await api.repos.notes.list();
    expect(notes).toHaveLength(1);
    expect(draftOf(notes[0] as NonNullable<(typeof notes)[0]>)).toEqual({
      kind: 'basic',
      front: 'Pregunta',
      back: 'Respuesta',
    });
  });

  it('quitar la marca o borrar la línea deja la nota y sus cartas con marca de borrado', async () => {
    const { api, user } = setup();
    const page = await createOutline(api, user, { title: 'Cardio' });
    const first = await saveOutline(
      api,
      user,
      page.id,
      { lines: [line('A :: B'), line('C ;; D')] },
      later(1),
    );
    const [a, c] = first.page.lines as [OutlineLine, OutlineLine];
    const second = await saveOutline(
      api,
      user,
      page.id,
      { lines: [{ ...a, text: 'A sin marca' }] },
      later(2),
    );
    expect(second.removed).toBe(2);
    expect(second.page.lines[0]?.noteId).toBeNull();
    expect(await api.repos.notes.list()).toHaveLength(0);
    expect(await api.repos.cards.list()).toHaveLength(0);
    // Siguen guardadas con su marca para que otro dispositivo se entere
    const raw = await api.repos.notes.listAll();
    expect(raw).toHaveLength(2);
    expect(raw.every((note) => note.deletedAt === later(2).toISOString())).toBe(true);
    expect(raw.map((note) => note.id)).toContain(c.noteId);
  });

  it('las etiquetas del apunte llegan a todas las tarjetas y cambiarlas actualiza las notas', async () => {
    const { api, user } = setup();
    const page = await createOutline(api, user, { title: 'Cardio' });
    await saveOutline(
      api,
      user,
      page.id,
      { lines: [line('A :: B #x')], tags: ['ENARM 2027'] },
      later(1),
    );
    expect((await api.repos.notes.list())[0]?.tags).toEqual(['ENARM_2027', 'x']);
    const after = await saveOutline(
      api,
      user,
      page.id,
      { lines: (await api.repos.outlines.get(page.id))?.lines ?? [], tags: ['otro'] },
      later(2),
    );
    expect(after.written).toBe(1);
    expect((await api.repos.notes.list())[0]?.tags).toEqual(['otro', 'x']);
  });

  it('una cloze lleva de contexto las líneas de arriba', async () => {
    const { api, user } = setup();
    const page = await createOutline(api, user, { title: 'Cardio' });
    await saveOutline(
      api,
      user,
      page.id,
      { lines: [line('Cardiología'), line('Infarto', 1), line('La {{troponina}} sube', 2)] },
      later(1),
    );
    const [note] = await api.repos.notes.list();
    expect(draftOf(note as NonNullable<typeof note>)).toMatchObject({
      kind: 'cloze',
      extra: 'Cardiología › Infarto',
    });
  });

  it('las sangrías imposibles se corrigen al guardar', async () => {
    const { api, user } = setup();
    const page = await createOutline(api, user, { title: 'Cardio' });
    const result = await saveOutline(api, user, page.id, { lines: [line('A', 4), line('B', 7)] });
    expect(result.page.lines.map((entry) => entry.depth)).toEqual([0, 1]);
  });

  it('el texto se guarda escapado y nunca se vuelve código', async () => {
    const { api, user } = setup();
    const page = await createOutline(api, user, { title: 'Cardio' });
    await saveOutline(api, user, page.id, {
      lines: [line('<img src=x onerror=alert(1)> :: <b>x</b>')],
    });
    const [note] = await api.repos.notes.list();
    expect(JSON.stringify(note)).not.toContain('<img');
    expect(JSON.stringify(note)).not.toContain('<b>');
  });
});

describe('borrar un apunte', () => {
  it('borra el apunte, su mazo y sus tarjetas con marca y no deja nada vivo', async () => {
    const { api, user } = setup();
    const page = await createOutline(api, user, { title: 'Cardio' });
    await saveOutline(api, user, page.id, { lines: [line('A :: B'), line('C ;; D')] }, later(1));
    await deleteOutline(api, user, page.id, later(2));
    expect(await api.repos.outlines.get(page.id)).toBeUndefined();
    expect(await api.repos.notes.list()).toHaveLength(0);
    expect(await api.repos.cards.list()).toHaveLength(0);
    expect(await api.repos.decks.get(page.deckId)).toBeUndefined();
    const raw = await api.repos.outlines.getRaw(page.id);
    expect(raw?.deletedAt).toBe(later(2).toISOString());
    // El título queda libre para uno nuevo
    await expect(createOutline(api, user, { title: 'Cardio' })).resolves.toBeDefined();
  });
});
