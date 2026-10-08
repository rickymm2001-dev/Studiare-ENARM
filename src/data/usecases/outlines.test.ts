import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OUTLINE_LIMITS, type OutlineNode } from '../../engines/outline';
import { latestCardStates } from '../../features/review/study';
import type { FsrsCardState } from '../schemas/common';
import { isLive, type Card, type Note } from '../schemas/decks';
import type { Outline } from '../schemas/outlines';
import type { User } from '../schemas/people';
import { fixedClock, makeEvent, makeUser, newId, testApi } from '../testing/fixtures';
import { exportUserData } from './exportData';
import {
  createManualDeck,
  deleteManualDeck,
  draftOf,
  saveManualNote,
  type NoteDraft,
} from './manualDecks';
import {
  OUTLINES_ROOT_DECK_NAME,
  OutlineConflictError,
  createOutline,
  deleteOutline,
  isFromOutline,
  moveOutline,
  renameOutline,
  saveOutline,
  syncOutlineCards,
} from './outlines';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

type Api = ReturnType<typeof testApi>;

/** Un momento del 8 de octubre de 2026, con minutos de diferencia para ver qué se tocó */
const at = (minutes: number) => new Date(Date.UTC(2026, 9, 8, 12, minutes));

function setup() {
  const api = testApi('real');
  disposers.push(api.dispose);
  return { api, user: makeUser() };
}

const line = (text: string, children: OutlineNode[] = [], id: string = newId()): OutlineNode => ({
  id,
  text,
  children,
});

/** Un apunte vacío en su propio mazo, listo para guardarle líneas */
async function start(api: Api, user: User, title = 'Cardiología') {
  return createOutline(api, user, { title }, at(0));
}

const notesOf = async (api: Api, outlineId: string) => {
  const notes = await api.repos.notes.listAllByOutline(outlineId);
  return new Map(notes.map((note) => [note.outlineNodeId, note]));
};

const cardsOf = async (api: Api, noteId: string, options: { live?: boolean } = {}) =>
  (await api.repos.cards.listAllForNotes([noteId]))
    .filter((card) => options.live !== true || isLive(card))
    .sort((a, b) => a.ordinal - b.ordinal);

const idsOf = (cards: readonly Card[]) => cards.map((card) => card.id);

/** Todo lo que guarda la base de contenido, para comparar antes y después */
async function snapshot(api: Api) {
  const sorted = <T extends { id: string }>(list: T[]) =>
    list.sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify([
    sorted(await api.repos.decks.listAll()),
    sorted(await api.repos.outlines.listAll()),
    sorted(await api.repos.notes.listAll()),
    sorted(await api.repos.cards.listAll()),
  ]);
}

describe('crear un apunte', () => {
  it('sin mazo crea uno propio con el título, colgado del mazo raíz Apuntes', async () => {
    const { api, user } = setup();
    const outline = await createOutline(api, user, { title: '  Cardiología  ' }, at(0));
    expect(outline).toMatchObject({
      ownerId: user.id,
      title: 'Cardiología',
      nodes: [],
      createdAt: at(0).toISOString(),
      updatedAt: at(0).toISOString(),
    });
    const decks = await api.repos.decks.list();
    const root = decks.find((deck) => deck.name === OUTLINES_ROOT_DECK_NAME);
    const own = decks.find((deck) => deck.id === outline.deckId);
    expect(root).toMatchObject({
      ownerId: user.id,
      origin: 'manual',
      visibility: 'private',
      isDemo: false,
    });
    expect(root?.parentId ?? null).toBeNull();
    expect(own).toMatchObject({
      name: 'Cardiología',
      ownerId: user.id,
      origin: 'manual',
      parentId: root?.id,
    });
    expect(await api.repos.outlines.get(outline.id)).toEqual(outline);
  });

  it('el mazo raíz Apuntes se crea una sola vez y se reutiliza', async () => {
    const { api, user } = setup();
    const first = await createOutline(api, user, { title: 'Uno' }, at(0));
    const second = await createOutline(api, user, { title: 'Dos' }, at(1));
    const decks = await api.repos.decks.list();
    const roots = decks.filter((deck) => deck.name === OUTLINES_ROOT_DECK_NAME);
    expect(roots).toHaveLength(1);
    expect(decks).toHaveLength(3);
    const parents = [first, second].map(
      (outline) => decks.find((deck) => deck.id === outline.deckId)?.parentId,
    );
    expect(parents).toEqual([roots[0]?.id, roots[0]?.id]);
    // Cada alumno tiene su propia raíz
    const other = makeUser();
    await createOutline(api, other, { title: 'Ajeno' }, at(2));
    const rootsNow = (await api.repos.decks.list()).filter(
      (deck) => deck.name === OUTLINES_ROOT_DECK_NAME,
    );
    expect(rootsNow.map((deck) => deck.ownerId).sort()).toEqual([user.id, other.id].sort());
  });

  it('con mazo usa ese mazo propio hecho a mano y no crea ninguno', async () => {
    const { api, user } = setup();
    const deck = await createManualDeck(api, user, { name: 'Mi mazo' });
    const outline = await createOutline(api, user, { title: 'Nefrología', deckId: deck.id }, at(0));
    expect(outline.deckId).toBe(deck.id);
    expect(await api.repos.decks.list()).toHaveLength(1);
  });

  it('rechaza un mazo ajeno, uno que no existe y uno que no es hecho a mano', async () => {
    const { api, user } = setup();
    const other = makeUser();
    const theirs = await createManualDeck(api, other, { name: 'Ajeno' });
    await expect(createOutline(api, user, { title: 'X', deckId: theirs.id })).rejects.toThrow(
      'mazos que creaste',
    );
    await expect(createOutline(api, user, { title: 'X', deckId: newId() })).rejects.toThrow(
      'ya no existe',
    );
    const generated = await api.repos.decks.put({
      id: newId(),
      name: 'Mis errores',
      description: '',
      ownerId: user.id,
      origin: 'generated',
      visibility: 'private',
      isDemo: false,
      parentId: null,
      createdAt: at(0).toISOString(),
    });
    await expect(createOutline(api, user, { title: 'X', deckId: generated.id })).rejects.toThrow(
      'mazos que creaste',
    );
    expect(await api.repos.outlines.listAll()).toHaveLength(0);
  });

  it('el título va de 1 a 120 caracteres y un título malo no crea mazos', async () => {
    const { api, user } = setup();
    await expect(createOutline(api, user, { title: '   ' })).rejects.toThrow('vacío');
    await expect(createOutline(api, user, { title: 'x'.repeat(121) })).rejects.toThrow('120');
    expect(await api.repos.decks.listAll()).toHaveLength(0);
    const long = await createOutline(api, user, { title: 'x'.repeat(120) }, at(0));
    expect(long.title).toHaveLength(120);
    expect((await api.repos.decks.get(long.deckId))?.name).toHaveLength(120);
  });

  it('renombrar valida el título, conserva el mazo y no escribe si no cambia', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    const renamed = await renameOutline(api, user, outline.id, '  Cardio 2  ', at(5));
    expect(renamed).toMatchObject({ title: 'Cardio 2', deckId: outline.deckId });
    expect(renamed.updatedAt).toBe(at(5).toISOString());
    const put = vi.spyOn(api.repos.outlines, 'put');
    expect((await renameOutline(api, user, outline.id, 'Cardio 2', at(9))).updatedAt).toBe(
      at(5).toISOString(),
    );
    expect(put).not.toHaveBeenCalled();
    await expect(renameOutline(api, user, outline.id, ' ')).rejects.toThrow('vacío');
    await expect(renameOutline(api, makeUser(), outline.id, 'Mío')).rejects.toThrow('apuntes');
  });
});

describe('las cuatro clases de marca se vuelven tarjetas', () => {
  it('crea notas, cartas, números de carta y etiquetas heredadas', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    const ids = {
      forward: newId(),
      both: newId(),
      cloze: newId(),
      multi: newId(),
      backward: newId(),
      plain: newId(),
    };
    const nodes = [
      line('Cardiología #Cardio', [
        line('¿Primer síntoma del infarto? >> Dolor torácico', [], ids.forward),
        line('Troponina :: Marcador de daño miocárdico', [], ids.both),
        line('El {{ECG}} detecta {{c3::arritmias}}', [], ids.cloze),
        line(
          'Causas de IAM >>>',
          [line('Aterosclerosis'), line('Embolia', [line('Paradójica')])],
          ids.multi,
        ),
        line('Dolor torácico << ¿Qué síntoma?', [], ids.backward),
        line('Texto sin marca', [], ids.plain),
      ]),
    ];
    const { sync } = await saveOutline(api, user, { outlineId: outline.id, nodes }, at(1));
    expect(sync).toEqual({ created: 5, updated: 0, deleted: 0, unchanged: 0, issues: [] });

    const notes = await notesOf(api, outline.id);
    expect(notes.size).toBe(5);
    expect(notes.has(ids.plain)).toBe(false);
    const draft = (nodeId: string): NoteDraft => {
      const note = notes.get(nodeId);
      if (!note) throw new Error('Falta la nota');
      return draftOf(note);
    };
    expect(draft(ids.forward)).toEqual({
      kind: 'basic',
      front: '¿Primer síntoma del infarto?',
      back: 'Dolor torácico',
    });
    expect(draft(ids.both)).toEqual({
      kind: 'basic_reverse',
      front: 'Troponina',
      back: 'Marcador de daño miocárdico',
    });
    expect(draft(ids.cloze)).toEqual({
      kind: 'cloze',
      text: 'El {{c1::ECG}} detecta {{c3::arritmias}}',
      extra: '',
    });
    expect(draft(ids.multi)).toEqual({
      kind: 'basic',
      front: 'Causas de IAM',
      back: 'Aterosclerosis\nEmbolia\n  Paradójica',
    });
    // << pregunta lo que está a la derecha
    expect(draft(ids.backward)).toEqual({
      kind: 'basic',
      front: '¿Qué síntoma?',
      back: 'Dolor torácico',
    });

    const ordinals = async (nodeId: string) =>
      (await cardsOf(api, notes.get(nodeId)?.id ?? '', { live: true })).map((c) => c.ordinal);
    expect(await ordinals(ids.forward)).toEqual([0]);
    expect(await ordinals(ids.both)).toEqual([0, 1]);
    expect(await ordinals(ids.cloze)).toEqual([1, 3]);
    expect(await ordinals(ids.multi)).toEqual([0]);
    expect(await ordinals(ids.backward)).toEqual([0]);
    expect(await api.repos.cards.list()).toHaveLength(1 + 2 + 2 + 1 + 1);

    for (const note of notes.values()) {
      expect(note).toMatchObject({
        origin: 'manual',
        editorialStatus: 'draft',
        isDemo: false,
        sourceQuote: null,
        deckId: outline.deckId,
        outlineId: outline.id,
        createdAt: at(1).toISOString(),
        updatedAt: at(1).toISOString(),
      });
      expect(isFromOutline(note)).toBe(true);
      expect(note.tags).toEqual(['Cardio']);
      for (const card of await cardsOf(api, note.id)) {
        expect(card).toMatchObject({ deckId: outline.deckId, noteId: note.id });
      }
    }
    expect(notes.get(ids.cloze)?.outlineNodeId).toBe(ids.cloze);
  });

  it('las etiquetas son las heredadas de los ancestros y las propias, sin repetir', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    const [deep, shallow, root] = [newId(), newId(), newId()];
    const nodes = [
      line(
        'Pediatría #Pediatría',
        [
          line('Neonato #Pediatría::Neonato', [line('Apgar >> Test al minuto 1 y 5', [], deep)]),
          line('Otra >> Cosa', [], shallow),
        ],
        newId(),
      ),
      line('Raíz >> Sin etiquetas', [], root),
    ];
    await saveOutline(api, user, { outlineId: outline.id, nodes }, at(1));
    const notes = await notesOf(api, outline.id);
    expect(notes.get(deep)?.tags).toEqual(['Pediatría', 'Pediatría::Neonato']);
    expect(notes.get(shallow)?.tags).toEqual(['Pediatría']);
    expect(notes.get(root)?.tags).toEqual([]);

    // Quitar la etiqueta del padre cambia las de los hijos, sin crear notas
    const before = [...notes.values()].map((note) => note.id).sort();
    const withoutTag = [
      line('Pediatría', nodes[0]?.children ?? [], nodes[0]?.id),
      ...nodes.slice(1),
    ];
    const { sync } = await saveOutline(
      api,
      user,
      { outlineId: outline.id, nodes: withoutTag },
      at(2),
    );
    expect(sync).toMatchObject({ created: 0, updated: 2, unchanged: 1 });
    const after = await notesOf(api, outline.id);
    expect(after.get(deep)?.tags).toEqual(['Pediatría::Neonato']);
    expect(after.get(shallow)?.tags).toEqual([]);
    expect([...after.values()].map((note) => note.id).sort()).toEqual(before);
  });

  it('avisa de los problemas de las líneas y no crea nota de una marca que no sirve', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    const [empty, broken, good] = [newId(), newId(), newId()];
    const nodes = [
      line('Lista sin respuesta >>>', [], empty),
      line('La {{c1::creatinina sube', [], broken),
      line('Bien >> Hecho', [], good),
    ];
    const { sync } = await saveOutline(api, user, { outlineId: outline.id, nodes }, at(1));
    expect(sync).toMatchObject({ created: 1, deleted: 0 });
    expect(sync.issues).toEqual([
      { nodeId: empty, code: 'multiline_without_children' },
      { nodeId: broken, code: 'cloze_unusable' },
    ]);
    expect((await notesOf(api, outline.id)).size).toBe(1);
  });
});

describe('una línea que sigue marcada conserva su nota y sus cartas', () => {
  it('editar el texto no crea notas y conserva los IDs de la nota y de las cartas', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    const [first, second] = [newId(), newId()];
    const nodes = [
      line('Troponina :: Marcador', [], first),
      line('Pregunta >> Respuesta', [], second),
    ];
    await saveOutline(api, user, { outlineId: outline.id, nodes }, at(1));
    const before = await notesOf(api, outline.id);
    const noteId = before.get(first)?.id ?? '';
    const cardIds = idsOf(await cardsOf(api, noteId));
    expect(cardIds).toHaveLength(2);

    const edited = [
      line('Troponina I :: Marcador más específico', [], first),
      line('Pregunta >> Respuesta', [], second),
    ];
    const { sync } = await saveOutline(api, user, { outlineId: outline.id, nodes: edited }, at(2));
    expect(sync).toMatchObject({ created: 0, updated: 1, deleted: 0, unchanged: 1 });
    const after = await notesOf(api, outline.id);
    expect(after.size).toBe(2);
    expect(after.get(first)?.id).toBe(noteId);
    expect(after.get(second)?.id).toBe(before.get(second)?.id);
    expect(idsOf(await cardsOf(api, noteId))).toEqual(cardIds);
    expect(after.get(first)).toMatchObject({
      front: '<p>Troponina I</p>',
      createdAt: at(1).toISOString(),
      updatedAt: at(2).toISOString(),
    });
    // La otra nota ni se tocó
    expect(after.get(second)?.updatedAt).toBe(at(1).toISOString());
    expect(await api.repos.notes.listAll()).toHaveLength(2);
    expect(await api.repos.cards.listAll()).toHaveLength(3);
  });

  it('mover la línea de lugar o de padre conserva todo y cambia las etiquetas que hereda', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    const [moved, other, parentA, parentB] = [newId(), newId(), newId(), newId()];
    const before = [
      line('Tema A #A', [line('Dato >> Valor', [], moved)], parentA),
      line('Tema B #B', [line('Otro >> Valor', [], other)], parentB),
    ];
    await saveOutline(api, user, { outlineId: outline.id, nodes: before }, at(1));
    const first = await notesOf(api, outline.id);
    const cardId = idsOf(await cardsOf(api, first.get(moved)?.id ?? ''))[0];
    expect(first.get(moved)?.tags).toEqual(['A']);

    // La línea pasa al otro padre, al inicio, y el otro tema sube de lugar
    const after = [
      line(
        'Tema B #B',
        [line('Dato >> Valor', [], moved), line('Otro >> Valor', [], other)],
        parentB,
      ),
      line('Tema A #A', [], parentA),
    ];
    const { sync } = await saveOutline(api, user, { outlineId: outline.id, nodes: after }, at(2));
    expect(sync).toMatchObject({ created: 0, deleted: 0, updated: 1, unchanged: 1 });
    const second = await notesOf(api, outline.id);
    expect(second.get(moved)?.id).toBe(first.get(moved)?.id);
    expect(second.get(moved)?.tags).toEqual(['B']);
    expect(idsOf(await cardsOf(api, second.get(moved)?.id ?? ''))).toEqual([cardId]);
    expect(await api.repos.notes.listAll()).toHaveLength(2);

    // Reordenar sin cambiar lo que hereda no escribe la nota
    const put = vi.spyOn(api.repos.notes, 'putMany');
    const swapped = [
      line(
        'Tema B #B',
        [line('Otro >> Valor', [], other), line('Dato >> Valor', [], moved)],
        parentB,
      ),
      line('Tema A #A', [], parentA),
    ];
    const again = await saveOutline(api, user, { outlineId: outline.id, nodes: swapped }, at(3));
    expect(again.sync).toMatchObject({ created: 0, updated: 0, unchanged: 2 });
    expect(put).not.toHaveBeenCalled();
  });

  it('pasar de >> a <> suma la carta 1 sin crear una nota, y volver la quita y la revive con su ID', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    const node = newId();
    const write = (text: string, minute: number) =>
      saveOutline(api, user, { outlineId: outline.id, nodes: [line(text, [], node)] }, at(minute));

    await write('Troponina >> Marcador', 1);
    const noteId = (await notesOf(api, outline.id)).get(node)?.id ?? '';
    const [zero] = await cardsOf(api, noteId);
    expect(zero?.ordinal).toBe(0);

    const both = await write('Troponina <> Marcador', 2);
    expect(both.sync).toMatchObject({ created: 0, updated: 1 });
    const afterBoth = await cardsOf(api, noteId, { live: true });
    expect(afterBoth.map((card) => card.ordinal)).toEqual([0, 1]);
    expect(afterBoth[0]?.id).toBe(zero?.id);
    const one = afterBoth[1];
    expect((await notesOf(api, outline.id)).get(node)).toMatchObject({
      id: noteId,
      kind: 'basic_reverse',
    });

    await write('Troponina >> Marcador', 3);
    const live = await cardsOf(api, noteId, { live: true });
    expect(idsOf(live)).toEqual([zero?.id]);
    const all = await cardsOf(api, noteId);
    expect(all.find((card) => card.id === one?.id)?.deletedAt).toBe(at(3).toISOString());

    await write('Troponina :: Marcador', 4);
    const revived = await cardsOf(api, noteId, { live: true });
    expect(idsOf(revived)).toEqual([zero?.id, one?.id]);
    expect(revived[1]?.deletedAt).toBeNull();
    expect(await api.repos.notes.listAll()).toHaveLength(1);
    expect(await api.repos.cards.listAll()).toHaveLength(2);
  });

  it('cambiar entre básica y cloze sigue la regla de saveManualNote, con cartas nuevas', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    const node = newId();
    const write = (text: string, minute: number) =>
      saveOutline(api, user, { outlineId: outline.id, nodes: [line(text, [], node)] }, at(minute));

    await write('Pregunta >> Respuesta', 1);
    const noteId = (await notesOf(api, outline.id)).get(node)?.id ?? '';
    const [basicCard] = await cardsOf(api, noteId);

    await write('La {{c1::urea}} sube', 2);
    // Es la misma nota, pero con cartas nuevas, y la de antes queda con marca de borrado
    expect((await notesOf(api, outline.id)).get(node)).toMatchObject({ id: noteId, kind: 'cloze' });
    const live = await cardsOf(api, noteId, { live: true });
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ ordinal: 1 });
    expect(live[0]?.id).not.toBe(basicCard?.id);
    expect((await api.repos.cards.getRaw(basicCard?.id ?? ''))?.deletedAt).not.toBeNull();

    // Es lo mismo que hace saveManualNote al cambiar de familia
    const manual = await createManualDeck(api, user, { name: 'Suelto' });
    const note = await saveManualNote(api, user, {
      deckId: manual.id,
      draft: { kind: 'basic', front: 'a', back: 'b' },
    });
    const [manualBasic] = await cardsOf(api, note.id);
    await saveManualNote(api, user, {
      deckId: manual.id,
      noteId: note.id,
      draft: { kind: 'cloze', text: '{{c1::x}}', extra: '' },
    });
    const manualLive = await cardsOf(api, note.id, { live: true });
    expect(manualLive).toHaveLength(1);
    expect(manualLive[0]?.id).not.toBe(manualBasic?.id);
  });
});

describe('una línea que pierde su marca o se borra deja su nota con marca de borrado', () => {
  it('nunca es borrado duro y, si la marca vuelve a la misma línea, todo revive con los mismos IDs', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    const [both, gone] = [newId(), newId()];
    const full = [line('Troponina :: Marcador', [], both), line('Dato >> Valor', [], gone)];
    await saveOutline(api, user, { outlineId: outline.id, nodes: full }, at(1));
    const notes = await notesOf(api, outline.id);
    const noteId = notes.get(both)?.id ?? '';
    const goneId = notes.get(gone)?.id ?? '';
    const cardIds = idsOf(await cardsOf(api, noteId));
    const goneCardIds = idsOf(await cardsOf(api, goneId));

    // La primera pierde la marca y la segunda desaparece del apunte
    const stripped = [line('Troponina y marcador', [], both)];
    const { sync } = await saveOutline(
      api,
      user,
      { outlineId: outline.id, nodes: stripped },
      at(2),
    );
    expect(sync).toEqual({ created: 0, updated: 0, deleted: 2, unchanged: 0, issues: [] });
    for (const id of [noteId, goneId]) {
      expect(await api.repos.notes.get(id)).toBeUndefined();
      expect(await api.repos.notes.getRaw(id)).toMatchObject({
        deletedAt: at(2).toISOString(),
        updatedAt: at(2).toISOString(),
        outlineId: outline.id,
      });
    }
    expect(await api.repos.cards.list()).toHaveLength(0);
    const raw = await api.repos.cards.listAll();
    expect(raw).toHaveLength(3);
    expect(raw.every((card) => card.deletedAt === at(2).toISOString())).toBe(true);

    // Una guardada más no vuelve a tocar lo que ya está borrado
    const again = await saveOutline(api, user, { outlineId: outline.id, nodes: stripped }, at(3));
    expect(again.sync).toMatchObject({ created: 0, updated: 0, deleted: 0, unchanged: 0 });
    expect((await api.repos.notes.getRaw(noteId))?.updatedAt).toBe(at(2).toISOString());

    // La marca vuelve, con otro texto, a las mismas líneas
    const back = [line('Troponina T :: Otro marcador', [], both), line('Dato >> Nuevo', [], gone)];
    const revived = await saveOutline(api, user, { outlineId: outline.id, nodes: back }, at(4));
    expect(revived.sync).toMatchObject({ created: 0, updated: 2, deleted: 0 });
    expect(idsOf(await cardsOf(api, noteId, { live: true }))).toEqual(cardIds);
    expect(idsOf(await cardsOf(api, goneId, { live: true }))).toEqual(goneCardIds);
    expect(await api.repos.notes.get(noteId)).toMatchObject({
      front: '<p>Troponina T</p>',
      deletedAt: null,
      createdAt: at(1).toISOString(),
      updatedAt: at(4).toISOString(),
    });
    expect(await api.repos.notes.listAll()).toHaveLength(2);
    expect(await api.repos.cards.listAll()).toHaveLength(3);
  });

  it('una carta que se había quitado de una nota revive al volver su número, sin importar el borrado de la nota', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    const node = newId();
    const write = (text: string, minute: number) =>
      saveOutline(api, user, { outlineId: outline.id, nodes: [line(text, [], node)] }, at(minute));
    await write('A <> B', 1);
    const noteId = (await notesOf(api, outline.id)).get(node)?.id ?? '';
    const ids = idsOf(await cardsOf(api, noteId));
    await write('A >> B', 2); // Quita la carta 1
    await write('Sin marca', 3); // Quita la carta 0 y la nota
    await write('A <> B', 4);
    expect(idsOf(await cardsOf(api, noteId, { live: true }))).toEqual(ids);
  });
});

describe('guardar sin cambios no escribe nada', () => {
  it('ni el apunte ni sus notas ni sus cartas, ni siquiera la fecha de modificación', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    const nodes = [
      line('Tema #T', [
        line('Pregunta >> Respuesta'),
        line('A :: B'),
        line('Una {{c1::cloze}}'),
        line('Lista >>>', [line('Uno'), line('Dos')]),
      ]),
    ];
    await saveOutline(api, user, { outlineId: outline.id, nodes }, at(1));
    const before = await snapshot(api);

    const spies = [
      vi.spyOn(api.repos.notes, 'put'),
      vi.spyOn(api.repos.notes, 'putMany'),
      vi.spyOn(api.repos.cards, 'put'),
      vi.spyOn(api.repos.cards, 'putMany'),
      vi.spyOn(api.repos.outlines, 'put'),
      vi.spyOn(api.repos.outlines, 'putMany'),
      vi.spyOn(api.repos.decks, 'put'),
    ];
    const same = await saveOutline(api, user, { outlineId: outline.id, nodes }, at(30));
    expect(same.sync).toEqual({ created: 0, updated: 0, deleted: 0, unchanged: 4, issues: [] });
    expect(same.outline.updatedAt).toBe(at(1).toISOString());
    // Tampoco al sincronizar directo ni al guardar el mismo título
    const direct = await syncOutlineCards(api, user, same.outline, at(31));
    expect(direct).toMatchObject({ created: 0, updated: 0, deleted: 0, unchanged: 4 });
    await saveOutline(api, user, { outlineId: outline.id, title: 'Cardiología', nodes }, at(32));
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(await snapshot(api)).toBe(before);
  });

  it('cambiar una línea solo escribe esa nota', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    const [one, two] = [newId(), newId()];
    const nodes = [line('Uno >> 1', [], one), line('Dos >> 2', [], two)];
    await saveOutline(api, user, { outlineId: outline.id, nodes }, at(1));
    const cardsBefore = await api.repos.cards.listAll();
    const put = vi.spyOn(api.repos.notes, 'putMany');
    const cardPut = vi.spyOn(api.repos.cards, 'putMany');
    await saveOutline(
      api,
      user,
      { outlineId: outline.id, nodes: [line('Uno >> 1', [], one), line('Dos >> 22', [], two)] },
      at(2),
    );
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0]?.[0].map((note: Note) => note.outlineNodeId)).toEqual([two]);
    expect(cardPut).not.toHaveBeenCalled();
    expect(await api.repos.cards.listAll()).toEqual(cardsBefore);
    const notes = await notesOf(api, outline.id);
    expect(notes.get(one)?.updatedAt).toBe(at(1).toISOString());
    expect(notes.get(two)?.updatedAt).toBe(at(2).toISOString());
  });

  it('una nota viva a la que le falta una carta se arregla sin tocar la nota', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    const node = newId();
    const nodes = [line('A :: B', [], node)];
    await saveOutline(api, user, { outlineId: outline.id, nodes }, at(1));
    const noteId = (await notesOf(api, outline.id)).get(node)?.id ?? '';
    const [zero, one] = await cardsOf(api, noteId);
    // Un corte a la mitad de una escritura dejó la carta 1 con marca de borrado
    await api.repos.cards.put({ ...(one as Card), deletedAt: at(1).toISOString() });
    const { sync } = await saveOutline(api, user, { outlineId: outline.id, nodes }, at(2));
    expect(sync).toMatchObject({ created: 0, updated: 1, unchanged: 0 });
    expect(idsOf(await cardsOf(api, noteId, { live: true }))).toEqual([zero?.id, one?.id]);
    expect((await api.repos.notes.getRaw(noteId))?.updatedAt).toBe(at(1).toISOString());
  });
});

describe('solo toca las notas de ese apunte', () => {
  it('no toca tarjetas sueltas, ni de otro apunte, ni las que quedaron sueltas de un apunte borrado', async () => {
    const { api, user } = setup();
    const outline = await start(api, user, 'Uno');
    const sibling = await start(api, user, 'Dos');
    const loose = await saveManualNote(
      api,
      user,
      {
        deckId: outline.deckId,
        draft: { kind: 'basic', front: 'Pregunta', back: 'Respuesta' },
        tags: ['mía'],
      },
      at(1),
    );
    const sharedNode = newId();
    await saveOutline(
      api,
      user,
      { outlineId: sibling.id, nodes: [line('Pregunta >> Respuesta', [], sharedNode)] },
      at(1),
    );
    const retired = await start(api, user, 'Tres');
    await saveOutline(
      api,
      user,
      { outlineId: retired.id, nodes: [line('Antes >> Suelta')] },
      at(1),
    );
    await deleteOutline(api, user, retired.id, { keepCards: true }, at(2));
    const frozen = async () =>
      JSON.stringify([
        await api.repos.notes.getRaw(loose.id),
        await cardsOf(api, loose.id),
        await notesOf(api, sibling.id).then((map) => [...map.values()]),
        await Promise.all(
          [...(await notesOf(api, sibling.id)).values()].map((note) => cardsOf(api, note.id)),
        ),
        await api.repos.notes
          .listAll()
          .then((all) => all.filter((note) => !isFromOutline(note) && note.id !== loose.id)),
      ]);
    const before = await frozen();

    // El mismo texto y el mismo ID de línea en otro apunte no se confunden
    await saveOutline(
      api,
      user,
      { outlineId: outline.id, nodes: [line('Pregunta >> Respuesta', [], sharedNode)] },
      at(3),
    );
    await saveOutline(
      api,
      user,
      { outlineId: outline.id, nodes: [line('Pregunta >> Otra')] },
      at(4),
    );
    await saveOutline(api, user, { outlineId: outline.id, nodes: [] }, at(5));
    await deleteOutline(api, user, outline.id, { keepCards: false }, at(6));
    expect(await frozen()).toBe(before);
    expect((await api.repos.notes.get(loose.id))?.tags).toEqual(['mía']);
    expect(await cardsOf(api, loose.id, { live: true })).toHaveLength(1);
  });

  it('dos apuntes con la misma línea no se pisan al guardar ni al quitar la marca', async () => {
    const { api, user } = setup();
    const a = await start(api, user, 'A');
    const b = await start(api, user, 'B');
    const shared = newId();
    const nodes = [line('Dato >> Valor', [], shared)];
    await saveOutline(api, user, { outlineId: a.id, nodes }, at(1));
    await saveOutline(api, user, { outlineId: b.id, nodes }, at(2));
    const noteA = (await notesOf(api, a.id)).get(shared);
    const noteB = (await notesOf(api, b.id)).get(shared);
    expect(noteA?.id).not.toBe(noteB?.id);
    expect(noteA?.deckId).toBe(a.deckId);
    expect(noteB?.deckId).toBe(b.deckId);

    await saveOutline(
      api,
      user,
      { outlineId: b.id, nodes: [line('Sin marca', [], shared)] },
      at(3),
    );
    expect(await api.repos.notes.get(noteA?.id ?? '')).toBeDefined();
    expect(await api.repos.notes.get(noteB?.id ?? '')).toBeUndefined();
    expect(await cardsOf(api, noteA?.id ?? '', { live: true })).toHaveLength(1);
    expect(await cardsOf(api, noteB?.id ?? '', { live: true })).toHaveLength(0);
  });
});

describe('dueño, mazo y límites', () => {
  it('otro alumno no puede guardar, sincronizar ni borrar un apunte ajeno y no se escribe nada', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    const nodes = [line('Dato >> Valor')];
    await saveOutline(api, user, { outlineId: outline.id, nodes }, at(1));
    const before = await snapshot(api);
    const stranger = makeUser();
    await expect(
      saveOutline(api, stranger, { outlineId: outline.id, nodes: [] }, at(2)),
    ).rejects.toThrow('apuntes que escribiste');
    await expect(syncOutlineCards(api, stranger, outline, at(2))).rejects.toThrow(
      'apuntes que escribiste',
    );
    await expect(
      deleteOutline(api, stranger, outline.id, { keepCards: false }, at(2)),
    ).rejects.toThrow('apuntes que escribiste');
    await expect(moveOutline(api, stranger, outline.id, outline.deckId, at(2))).rejects.toThrow(
      'apuntes que escribiste',
    );
    expect(await snapshot(api)).toBe(before);
  });

  it('no deja guardar en un mazo ajeno aunque el apunte sea del alumno', async () => {
    const { api, user } = setup();
    const stranger = makeUser();
    const theirs = await createManualDeck(api, stranger, { name: 'Ajeno' });
    const mine = await start(api, user);
    // Un apunte que apunta a un mazo de otro, como si se hubiera movido a mano en la base
    const forged = await api.repos.outlines.put({ ...mine, deckId: theirs.id });
    const before = await snapshot(api);
    await expect(
      saveOutline(api, user, { outlineId: mine.id, nodes: [line('Dato >> Valor')] }, at(2)),
    ).rejects.toThrow('mazos que creaste');
    await expect(
      syncOutlineCards(api, user, { ...forged, nodes: [line('Dato >> Valor')] }, at(2)),
    ).rejects.toThrow('mazos que creaste');
    await expect(moveOutline(api, user, mine.id, theirs.id, at(2))).rejects.toThrow(
      'mazos que creaste',
    );
    expect(await snapshot(api)).toBe(before);
    expect(await api.repos.notes.listAll()).toHaveLength(0);
  });

  it('si el mazo ya no existe falla con un mensaje claro sin escribir nada, y moverlo lo arregla con los mismos IDs', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    const node = newId();
    await saveOutline(
      api,
      user,
      { outlineId: outline.id, nodes: [line('A <> B', [], node)] },
      at(1),
    );
    const noteId = (await notesOf(api, outline.id)).get(node)?.id ?? '';
    const cardIds = idsOf(await cardsOf(api, noteId));

    await deleteManualDeck(api, user, outline.deckId, at(2));
    const before = await snapshot(api);
    const edit = [line('A <> B editado', [], node), line('Nueva >> Línea')];
    await expect(
      saveOutline(api, user, { outlineId: outline.id, nodes: edit }, at(3)),
    ).rejects.toThrow('El mazo de este apunte ya no existe');
    await expect(syncOutlineCards(api, user, outline, at(3))).rejects.toThrow('ya no existe');
    // Ni el texto del apunte ni nada más cambió
    expect(await snapshot(api)).toBe(before);
    expect((await api.repos.outlines.get(outline.id))?.nodes).toEqual([line('A <> B', [], node)]);

    const target = await createManualDeck(api, user, { name: 'Nuevo mazo' }, at(4));
    const moved = await moveOutline(api, user, outline.id, target.id, at(5));
    expect(moved.outline.deckId).toBe(target.id);
    expect(moved.sync).toMatchObject({ created: 0, updated: 1, deleted: 0 });
    expect(await api.repos.notes.get(noteId)).toMatchObject({ deckId: target.id });
    const revived = await cardsOf(api, noteId, { live: true });
    expect(idsOf(revived)).toEqual(cardIds);
    expect(revived.every((card) => card.deckId === target.id)).toBe(true);
    // Y ya se puede volver a guardar
    const saved = await saveOutline(api, user, { outlineId: outline.id, nodes: edit }, at(6));
    expect(saved.sync).toMatchObject({ created: 1, updated: 1 });
  });

  it('no pisa un apunte que otra ventana guardó después y avisa con un error propio', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    const first = await saveOutline(
      api,
      user,
      { outlineId: outline.id, nodes: [line('Uno >> 1')], expectedUpdatedAt: outline.updatedAt },
      at(1),
    );
    // La otra ventana sigue con la fecha de antes de ese guardado
    const nueva = line('Dos >> 2');
    await expect(
      saveOutline(
        api,
        user,
        { outlineId: outline.id, nodes: [nueva], expectedUpdatedAt: outline.updatedAt },
        at(2),
      ),
    ).rejects.toBeInstanceOf(OutlineConflictError);
    expect((await api.repos.outlines.get(outline.id))?.nodes).toEqual(first.outline.nodes);
    // Con la fecha vigente sí guarda, y cada guardado trae la fecha para el siguiente
    const second = await saveOutline(
      api,
      user,
      {
        outlineId: outline.id,
        nodes: [nueva],
        expectedUpdatedAt: first.outline.updatedAt,
      },
      at(3),
    );
    expect(second.outline.updatedAt).toBe(at(3).toISOString());
  });

  it('dos guardados a la vez no dejan dos notas ni dos cartas de la misma línea', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    const node = newId();
    const nodes = [line('Pregunta >> Respuesta', [], node)];
    await Promise.all([
      saveOutline(api, user, { outlineId: outline.id, nodes }, at(1)),
      saveOutline(api, user, { outlineId: outline.id, nodes }, at(1)),
      saveOutline(api, user, { outlineId: outline.id, nodes }, at(1)),
    ]);
    const notes = (await api.repos.notes.listAllByOutline(outline.id)).filter(isLive);
    expect(notes).toHaveLength(1);
    const cards = await cardsOf(api, notes[0]?.id ?? '', { live: true });
    expect(cards).toHaveLength(1);
  });

  it('rechaza lo que pasa de los límites y no escribe nada', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    await saveOutline(api, user, { outlineId: outline.id, nodes: [line('Dato >> Valor')] }, at(1));
    const before = await snapshot(api);
    const save = (nodes: OutlineNode[], title?: string) =>
      saveOutline(
        api,
        user,
        { outlineId: outline.id, nodes, ...(title === undefined ? {} : { title }) },
        at(2),
      );

    const many = Array.from({ length: OUTLINE_LIMITS.maxNodes + 1 }, () => line('x'));
    await expect(save(many)).rejects.toThrow('2,000 líneas');
    let deep: OutlineNode = line('hoja');
    for (let level = 1; level < OUTLINE_LIMITS.maxDepth + 1; level += 1) deep = line('x', [deep]);
    await expect(save([deep])).rejects.toThrow('8 niveles');
    await expect(save([line('x'.repeat(3001))])).rejects.toThrow('3,000 caracteres');
    const twin = newId();
    await expect(
      save([line('uno', [], twin), line('dos', [line('tres', [], twin)])]),
    ).rejects.toThrow('mismo ID');
    await expect(save([], '   ')).rejects.toThrow('vacío');
    await expect(save([], 'x'.repeat(121))).rejects.toThrow('120');
    await expect(save([{ id: 'no-es-un-id', text: 'x', children: [] }])).rejects.toThrow();
    expect(await snapshot(api)).toBe(before);
  });

  it('acepta justo 2,000 líneas, 8 niveles y 3,000 caracteres', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    let deep: OutlineNode = line('hoja >> Valor');
    for (let level = 1; level < OUTLINE_LIMITS.maxDepth; level += 1) deep = line('x', [deep]);
    // 8 líneas de la cadena, la del texto largo y el resto sin marca, hasta las 2,000
    const flat = Array.from({ length: OUTLINE_LIMITS.maxNodes - OUTLINE_LIMITS.maxDepth - 1 }, () =>
      line('x'),
    );
    const long = 'a'.repeat(OUTLINE_LIMITS.maxFieldLength - ' >> Ok'.length);
    const { sync } = await saveOutline(
      api,
      user,
      { outlineId: outline.id, nodes: [deep, ...flat, line(`${long} >> Ok`)] },
      at(1),
    );
    // Dos tarjetas, la de la hoja y la del texto largo, que con su marca mide justo 3,000
    expect(sync).toMatchObject({ created: 2, issues: [] });
    expect((await api.repos.outlines.get(outline.id))?.nodes).toHaveLength(flat.length + 2);
  });

  it('un apunte que no existe o ya está borrado no se guarda ni resucita sus tarjetas', async () => {
    const { api, user } = setup();
    await expect(saveOutline(api, user, { outlineId: newId(), nodes: [] }, at(1))).rejects.toThrow(
      'No se encontró',
    );
    const outline = await start(api, user);
    await saveOutline(api, user, { outlineId: outline.id, nodes: [line('Dato >> Valor')] }, at(2));
    await deleteOutline(api, user, outline.id, { keepCards: false }, at(3));
    await expect(
      saveOutline(api, user, { outlineId: outline.id, nodes: [] }, at(4)),
    ).rejects.toThrow('No se encontró');
    // Sincronizar con el apunte que quedó marcado como borrado no revive lo que se borró con él
    const deleted = await api.repos.outlines.getRaw(outline.id);
    await expect(syncOutlineCards(api, user, deleted as Outline, at(5))).rejects.toThrow(
      'No se encontró',
    );
    expect(await api.repos.cards.list()).toHaveLength(0);
    expect(await api.repos.notes.list()).toHaveLength(0);
  });
});

describe('el historial de repaso sigue a las cartas', () => {
  const stateOf = (reps: number): FsrsCardState => ({
    due: '2026-11-01T12:00:00.000Z',
    stability: 12.5 + reps,
    difficulty: 5.5,
    scheduledDays: 12,
    learningSteps: 0,
    reps,
    lapses: 0,
    state: 'review',
    lastReview: '2026-10-08T12:00:00.000Z',
  });

  async function reviewed(api: Api, user: User, cards: readonly Card[]) {
    const clock = fixedClock('2026-10-08T12:00:00.000Z');
    for (const [index, card] of cards.entries()) {
      clock.advance(60_000);
      await api.recordEvent(
        makeEvent(
          'card_reviewed',
          {
            cardId: card.id,
            deckId: card.deckId,
            source: 'card',
            rating: 'good',
            confidence: null,
            msToReveal: 1500,
            msToRate: 800,
            stateBefore: null,
            stateAfter: stateOf(index + 1),
          },
          { userId: user.id, clock },
        ),
      );
    }
  }

  const statesOf = async (api: Api, user: User) =>
    latestCardStates(await api.repos.events.query({ userId: user.id }));

  it('editar el texto de la línea, quitar la marca y volver a ponerla conservan el estado de cada carta', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    const [both, cloze] = [newId(), newId()];
    const write = (nodes: OutlineNode[], minute: number) =>
      saveOutline(api, user, { outlineId: outline.id, nodes }, at(minute));
    await write(
      [line('Troponina :: Marcador', [], both), line('La {{c1::urea}} sube', [], cloze)],
      1,
    );

    const notes = await notesOf(api, outline.id);
    const cards = [
      ...(await cardsOf(api, notes.get(both)?.id ?? '')),
      ...(await cardsOf(api, notes.get(cloze)?.id ?? '')),
    ];
    expect(cards).toHaveLength(3);
    await reviewed(api, user, cards);
    const states = await statesOf(api, user);
    expect(states.size).toBe(3);
    const eventsBefore = JSON.stringify(await api.repos.events.query({ userId: user.id }));

    const assertIntact = async () => {
      expect(await statesOf(api, user)).toEqual(states);
      for (const card of cards) {
        const stored = await api.repos.cards.get(card.id);
        expect(stored, 'la carta sigue viva').toBeDefined();
        expect(stored?.noteId).toBe(card.noteId);
        expect(await api.repos.notes.get(card.noteId)).toBeDefined();
        expect(states.get(card.id)).toBeDefined();
      }
    };

    // Editar el texto de la línea
    await write(
      [
        line('Troponina I :: Marcador específico', [], both),
        line('La {{c1::urea}} baja', [], cloze),
      ],
      2,
    );
    await assertIntact();

    // Quitar la marca. Las cartas salen del repaso, pero el estado sigue en la bitácora
    await write([line('Troponina I', [], both), line('La urea baja', [], cloze)], 3);
    expect(await api.repos.cards.list()).toHaveLength(0);
    expect(await statesOf(api, user)).toEqual(states);

    // Volver a poner la marca
    await write(
      [line('Troponina I :: De nuevo', [], both), line('La {{c1::urea}} sube otra vez', [], cloze)],
      4,
    );
    await assertIntact();
    expect(JSON.stringify(await api.repos.events.query({ userId: user.id }))).toBe(eventsBefore);
  });
});

describe('borrar un apunte', () => {
  async function withCards() {
    const { api, user } = setup();
    const outline = await start(api, user);
    const [one, two, gone] = [newId(), newId(), newId()];
    await saveOutline(
      api,
      user,
      {
        outlineId: outline.id,
        nodes: [
          line('Uno :: 1', [], one),
          line('Dos >> 2', [], two),
          line('Quitada >> Antes', [], gone),
        ],
      },
      at(1),
    );
    // Una nota que ya estaba con marca de borrado desde antes
    await saveOutline(
      api,
      user,
      { outlineId: outline.id, nodes: [line('Uno :: 1', [], one), line('Dos >> 2', [], two)] },
      at(2),
    );
    const loose = await saveManualNote(api, user, {
      deckId: outline.deckId,
      draft: { kind: 'basic', front: 'Suelta', back: 'Si' },
    });
    return { api, user, outline, ids: { one, two, gone }, loose };
  }

  it('sin conservar tarjetas marca el apunte, sus notas y sus cartas, y no vuelve a estampar lo que ya estaba borrado', async () => {
    const { api, user, outline, ids, loose } = await withCards();
    const goneNote = (await notesOf(api, outline.id)).get(ids.gone);
    expect(goneNote?.deletedAt).toBe(at(2).toISOString());
    const looseBefore = JSON.stringify(await api.repos.notes.getRaw(loose.id));

    await deleteOutline(api, user, outline.id, { keepCards: false }, at(5));
    expect(await api.repos.outlines.get(outline.id)).toBeUndefined();
    expect(await api.repos.outlines.getRaw(outline.id)).toMatchObject({
      deletedAt: at(5).toISOString(),
      updatedAt: at(5).toISOString(),
    });
    const notes = await notesOf(api, outline.id);
    expect(notes.get(ids.one)?.deletedAt).toBe(at(5).toISOString());
    expect(notes.get(ids.two)?.deletedAt).toBe(at(5).toISOString());
    // La que ya estaba borrada conserva su fecha de borrado de antes
    expect(notes.get(ids.gone)?.deletedAt).toBe(at(2).toISOString());
    for (const note of notes.values()) {
      const stamps = (await cardsOf(api, note.id)).map((card) => card.deletedAt);
      expect(stamps.every((stamp) => typeof stamp === 'string')).toBe(true);
    }
    const goneCards = await cardsOf(api, goneNote?.id ?? '');
    expect(goneCards.every((card) => card.deletedAt === at(2).toISOString())).toBe(true);
    expect(await api.repos.cards.list()).toHaveLength(1); // Solo la de la nota suelta
    expect(JSON.stringify(await api.repos.notes.getRaw(loose.id))).toBe(looseBefore);
    // Nada se borró de verdad
    expect(await api.repos.notes.listAll()).toHaveLength(4);
    expect(await api.repos.cards.listAll()).toHaveLength(5);
    // Borrarlo otra vez no hace nada
    const before = await snapshot(api);
    await deleteOutline(api, user, outline.id, { keepCards: false }, at(9));
    expect(await snapshot(api)).toBe(before);
  });

  it('conservando tarjetas las notas siguen vivas, sueltas y editables, con las mismas cartas', async () => {
    const { api, user, outline, ids } = await withCards();
    const notes = await notesOf(api, outline.id);
    const oneId = notes.get(ids.one)?.id ?? '';
    const cardIds = idsOf(await cardsOf(api, oneId, { live: true }));
    expect(cardIds).toHaveLength(2);

    await deleteOutline(api, user, outline.id, { keepCards: true }, at(5));
    expect(await api.repos.outlines.get(outline.id)).toBeUndefined();
    expect(await api.repos.notes.listAllByOutline(outline.id)).toHaveLength(1); // La borrada de antes
    for (const nodeId of [ids.one, ids.two]) {
      const id = notes.get(nodeId)?.id ?? '';
      const kept = await api.repos.notes.get(id);
      expect(kept).toBeDefined();
      expect(kept?.outlineId).toBeNull();
      expect(kept?.outlineNodeId).toBeNull();
      expect(kept?.updatedAt).toBe(at(5).toISOString());
      expect(kept?.deckId).toBe(outline.deckId);
      expect(kept && isFromOutline(kept)).toBe(false);
    }
    expect(idsOf(await cardsOf(api, oneId, { live: true }))).toEqual(cardIds);
    // La nota que ya estaba borrada sigue borrada
    expect(await api.repos.notes.get(notes.get(ids.gone)?.id ?? '')).toBeUndefined();

    // Ya son tarjetas normales. Se pueden editar a mano y conservan sus cartas
    await saveManualNote(api, user, {
      deckId: outline.deckId,
      noteId: oneId,
      draft: { kind: 'basic_reverse', front: 'Uno editado', back: '1' },
    });
    expect(idsOf(await cardsOf(api, oneId, { live: true }))).toEqual(cardIds);
    const edited = await api.repos.notes.get(oneId);
    expect(edited && isFromOutline(edited)).toBe(false);
  });

  it('un apunte que no existe no hace nada y se repite sin problema', async () => {
    const { api, user } = setup();
    await expect(
      deleteOutline(api, user, newId(), { keepCards: false }, at(1)),
    ).resolves.toBeUndefined();
  });
});

describe('rendimiento', () => {
  it('500 tarjetas se crean, se confirman sin cambios y se editan en lotes y en poco tiempo', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    // 500 tarjetas y líneas sin marca hasta llegar al tope de 2,000 líneas
    const marked = Array.from({ length: OUTLINE_LIMITS.maxCards }, (_, index) =>
      line(`Pregunta ${index} #Tema::${index % 10} >> Respuesta ${index}`),
    );
    const plain = Array.from({ length: OUTLINE_LIMITS.maxNodes - marked.length }, (_, index) =>
      line(`Línea de contexto ${index}`),
    );
    const nodes = [line('Raíz #Raíz', marked), ...plain.slice(1)];

    let started = performance.now();
    const created = await saveOutline(api, user, { outlineId: outline.id, nodes }, at(1));
    const createMs = performance.now() - started;
    expect(created.sync).toMatchObject({ created: 500, updated: 0, deleted: 0, unchanged: 0 });
    expect(await api.repos.cards.list()).toHaveLength(500);
    expect((await api.repos.notes.list()).every((note) => note.tags[0] === 'Raíz')).toBe(true);

    started = performance.now();
    const same = await saveOutline(api, user, { outlineId: outline.id, nodes }, at(2));
    const sameMs = performance.now() - started;
    expect(same.sync).toMatchObject({ created: 0, updated: 0, deleted: 0, unchanged: 500 });

    // Cambia una de cada diez y quita una de cada cincuenta
    const edited = marked.map((node, index) =>
      index % 50 === 0
        ? line(`Sin marca ${index}`, [], node.id)
        : index % 10 === 0
          ? line(`${node.text} editada`, [], node.id)
          : node,
    );
    started = performance.now();
    const changed = await saveOutline(
      api,
      user,
      { outlineId: outline.id, nodes: [line('Raíz #Raíz', edited), ...plain.slice(1)] },
      at(3),
    );
    const editMs = performance.now() - started;
    expect(changed.sync).toMatchObject({ created: 0, deleted: 10, updated: 40, unchanged: 450 });
    expect(await api.repos.notes.listAll()).toHaveLength(500);
    expect(await api.repos.cards.list()).toHaveLength(490);

    // Un tope generoso para no fallar en un CI lento, lo normal es una fracción de esto
    expect(createMs).toBeLessThan(8000);
    expect(sameMs).toBeLessThan(4000);
    expect(editMs).toBeLessThan(6000);
  }, 30_000);

  it('500 notas de dos cartas, mil cartas, también se sincronizan en lotes y en poco tiempo', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    const nodes = Array.from({ length: OUTLINE_LIMITS.maxCards }, (_, index) =>
      line(`Concepto ${index} :: Definición ${index}`),
    );
    let started = performance.now();
    const created = await saveOutline(api, user, { outlineId: outline.id, nodes }, at(1));
    const createMs = performance.now() - started;
    expect(created.sync).toMatchObject({ created: 500, issues: [] });
    expect(await api.repos.cards.list()).toHaveLength(1000);

    // Todas pasan de :: a >>, así que se va la carta 1 de cada una
    started = performance.now();
    const forward = nodes.map((node) => line(node.text.replace('::', '>>'), [], node.id));
    const changed = await saveOutline(api, user, { outlineId: outline.id, nodes: forward }, at(2));
    const changeMs = performance.now() - started;
    expect(changed.sync).toMatchObject({ created: 0, updated: 500, deleted: 0 });
    expect(await api.repos.cards.list()).toHaveLength(500);
    expect(await api.repos.cards.listAll()).toHaveLength(1000);
    expect(createMs).toBeLessThan(8000);
    expect(changeMs).toBeLessThan(8000);
  }, 30_000);

  it('la tarjeta 501 no se crea y queda como aviso', async () => {
    const { api, user } = setup();
    const outline = await start(api, user);
    const nodes = Array.from({ length: OUTLINE_LIMITS.maxCards + 1 }, (_, index) =>
      line(`P${index} >> R${index}`),
    );
    const { sync } = await saveOutline(api, user, { outlineId: outline.id, nodes }, at(1));
    expect(sync.created).toBe(500);
    expect(sync.issues).toEqual([{ nodeId: nodes[500]?.id, code: 'too_many_cards' }]);
  }, 30_000);
});

describe('exportar los datos', () => {
  it('incluye los apuntes vivos del alumno y no los de otros ni los borrados', async () => {
    const { api, user } = setup();
    const mine = await start(api, user, 'Mío');
    const gone = await start(api, user, 'Borrado');
    await deleteOutline(api, user, gone.id, { keepCards: false }, at(1));
    await start(api, makeUser(), 'De otro');
    await saveOutline(api, user, { outlineId: mine.id, nodes: [line('Dato >> Valor')] }, at(2));
    const data = await exportUserData(api.repos, user.id);
    expect(data.outlines.map((outline: Outline) => outline.title)).toEqual(['Mío']);
    expect(data.outlines[0]?.nodes).toHaveLength(1);
  });
});
