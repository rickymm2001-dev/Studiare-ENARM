// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { strToU8 } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { createCardSanitizer } from '../content/cardHtml';
import { parseCsv } from '../import/csv';
import { buildLegacyApkg, loadSqlForTests, standardModels } from '../import/testing/fixtures';
import { parseApkg } from '../import/apkg';
import type { ParsedImport } from '../import/types';
import { makeUser, testApi } from '../testing/fixtures';
import { exportDecksCsv } from './exportDecks';
import {
  ImportBlockedError,
  importParsed,
  type ImportOptions,
  type ImportResult,
} from './importDeck';
import { draftOf, createManualDeck, saveManualNote } from './manualDecks';
import { clozeOrdinals } from './manualDecks';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

const sanitizer = createCardSanitizer(window);
const options = (overrides: Partial<ImportOptions> = {}): ImportOptions => ({
  deckName: 'Mi mazo importado',
  rightsConfirmed: true,
  // Las imágenes no se importan todavía, así que el saneador las quita todas
  sanitize: (html) => sanitizer.sanitize(html, () => null),
  ...overrides,
});

function setup() {
  const api = testApi('real');
  disposers.push(api.dispose);
  return { api, user: makeUser() };
}

const csv = (text: string): ParsedImport => parseCsv(strToU8(text), 'tarjetas.csv');

async function ownDeckNames(api: ReturnType<typeof setup>['api']) {
  return (await api.repos.decks.list()).map((deck) => deck.name).sort();
}

describe('guardar una importación', () => {
  it('exige confirmar el derecho de uso y un nombre', async () => {
    const { api, user } = setup();
    const parsed = csv('Frente,Reverso\na,b\n');
    await expect(
      importParsed(api, user, parsed, options({ rightsConfirmed: false })),
    ).rejects.toMatchObject({ reason: 'rights_required' });
    await expect(
      importParsed(api, user, parsed, options({ deckName: '   ' })),
    ).rejects.toMatchObject({
      reason: 'empty_name',
    });
    expect(await api.repos.notes.list()).toHaveLength(0);
    expect(await api.repos.decks.list()).toHaveLength(0);
  });

  it('crea un mazo privado del alumno con sus notas y cartas nuevas', async () => {
    const { api, user } = setup();
    const result = await importParsed(
      api,
      user,
      csv(
        'Tipo,Frente,Reverso,Etiquetas\nBasic,Triada de Beck,Hipotensión,cardio\nInversa,Metformina,Biguanida,\nCloze,La {{c1::troponina}} sube a las {{c2::3 h}},Extra,\n',
      ),
      options(),
    );
    expect(result).toMatchObject({
      decksCreated: 0,
      notesCreated: 3,
      cardsCreated: 5,
      duplicates: 0,
      repaired: 0,
      rejected: [],
    });
    const [deck] = await api.repos.decks.list();
    expect(deck).toMatchObject({
      name: 'Mi mazo importado',
      origin: 'imported',
      visibility: 'private',
      ownerId: user.id,
      isDemo: false,
      parentId: null,
    });
    const notes = await api.repos.notes.list();
    expect(notes.every((note) => note.deckId === deck?.id && note.origin === 'imported')).toBe(
      true,
    );
    expect(notes.every((note) => note.editorialStatus === 'draft')).toBe(true);
    expect(notes.find((note) => note.kind === 'basic')?.tags).toEqual(['cardio']);
    expect(notes.find((note) => note.kind === 'cloze')?.deckId).toBe(deck?.id);
    // Las tarjetas empiezan nuevas, sin ningún estado de repaso
    expect(await api.repos.caches.cardState.list()).toHaveLength(0);
    const cloze = notes.find((note) => note.kind === 'cloze');
    expect(cloze && 'text' in cloze ? clozeOrdinals(cloze.text) : []).toEqual([1, 2]);
  });

  it('el texto plano se escapa y el HTML peligroso se sanea', async () => {
    const { api, user } = setup();
    const evil = csv('Frente,Reverso\n<img src=x onerror=alert(1)>,<script>alert(2)</script>ok\n');
    await importParsed(api, user, evil, options());
    const [note] = await api.repos.notes.list();
    expect(JSON.stringify(note)).not.toContain('<img');
    expect(JSON.stringify(note)).not.toContain('<script');
    expect(draftOf(note as NonNullable<typeof note>)).toMatchObject({
      front: '<img src=x onerror=alert(1)>',
    });

    // Con HTML declarado, el saneador quita lo peligroso y deja el formato
    const html = csv(
      '#html:true\nFrente,Reverso\n<b onclick="x()">Dosis</b> <script>alert(1)</script><a href="http://x">enlace</a><img src="http://x/a.png">,Respuesta\n',
    );
    await importParsed(api, user, html, options({ deckName: 'Con HTML' }));
    const notes = await api.repos.notes.list();
    const withHtml = notes.find((entry) => entry.kind !== 'cloze' && entry.front.includes('Dosis'));
    expect(withHtml && 'front' in withHtml ? withHtml.front : '').toBe('<b>Dosis</b> enlace');
  });

  it('un paquete de Anki conserva el árbol de mazos con submazos', async () => {
    const { api, user } = setup();
    const parsed = parseApkg(
      await buildLegacyApkg({
        models: standardModels,
        notes: [
          { guid: 'a', model: 'basic', fields: ['uno', 'dos'], deck: 'ENARM::Cardio::Arritmias' },
          { guid: 'b', model: 'basic', fields: ['tres', 'cuatro'], deck: 'ENARM::Cardio' },
          { guid: 'c', model: 'basic', fields: ['cinco', 'seis'], deck: 'Default' },
        ],
      }),
      await loadSqlForTests(),
      'a.apkg',
    );
    const result = await importParsed(api, user, parsed, options({ deckName: 'Anki' }));
    expect(result.decksCreated).toBe(3);
    expect(await ownDeckNames(api)).toEqual(['Anki', 'Arritmias', 'Cardio', 'ENARM']);
    const decks = await api.repos.decks.list();
    const byName = new Map(decks.map((deck) => [deck.name, deck]));
    expect(byName.get('ENARM')?.parentId).toBe(byName.get('Anki')?.id);
    expect(byName.get('Cardio')?.parentId).toBe(byName.get('ENARM')?.id);
    expect(byName.get('Arritmias')?.parentId).toBe(byName.get('Cardio')?.id);
    const notes = await api.repos.notes.list();
    expect(notes.find((note) => note.sourceGuid === 'a')?.deckId).toBe(byName.get('Arritmias')?.id);
    expect(notes.find((note) => note.sourceGuid === 'c')?.deckId).toBe(byName.get('Anki')?.id);
  });

  it('las filas con problemas se reportan y no frenan a las demás', async () => {
    const { api, user } = setup();
    const result = await importParsed(
      api,
      user,
      csv('Frente,Reverso\nbien,bien\n,sin frente\nsin reverso,\n'),
      options(),
    );
    expect(result.notesCreated).toBe(1);
    expect(result.rejected).toEqual([
      { position: 3, code: 'empty_front' },
      { position: 4, code: 'empty_back' },
    ]);
  });

  it('un campo demasiado largo después de sanear se rechaza', async () => {
    const { api, user } = setup();
    const long = 'x'.repeat(20_001);
    const result = await importParsed(
      api,
      user,
      csv(`Frente,Reverso\n${long},a\nbien,bien\n`),
      options(),
    );
    expect(result.notesCreated).toBe(1);
    expect(result.rejected).toEqual([{ position: 2, code: 'too_long' }]);
  });

  it('un archivo sin nada guardable avisa en lugar de crear un mazo vacío', async () => {
    const { api, user } = setup();
    await expect(
      importParsed(api, user, csv('Frente,Reverso\n,solo reverso\n'), options()),
    ).rejects.toBeInstanceOf(ImportBlockedError);
    expect(await api.repos.decks.list()).toHaveLength(0);
  });
});

describe('volver a importar no duplica', () => {
  const file = 'Guid,Frente,Reverso\ng1,Uno,Dos\ng2,Tres,Cuatro\n';

  it('el mismo archivo dos veces deja las mismas notas y reutiliza el mazo', async () => {
    const { api, user } = setup();
    const first = await importParsed(api, user, csv(file), options());
    const second = await importParsed(api, user, csv(file), options());
    expect(first.notesCreated).toBe(2);
    expect(second).toMatchObject({ notesCreated: 0, duplicates: 2, cardsCreated: 0, repaired: 0 });
    expect(second.rootDeckId).toBe(first.rootDeckId);
    expect(await api.repos.notes.list()).toHaveLength(2);
    expect(await api.repos.decks.list()).toHaveLength(1);
  });

  it('sin identificador, se compara por el texto', async () => {
    const { api, user } = setup();
    await importParsed(api, user, csv('Frente,Reverso\nUno,Dos\n'), options());
    const again = await importParsed(
      api,
      user,
      csv('Frente,Reverso\nUNO!,dos\nUno,Otra respuesta\n'),
      options({ deckName: 'Otro mazo' }),
    );
    // Mismo frente y misma respuesta sin importar mayúsculas ni puntuación es duplicado.
    // El mismo frente con otra respuesta es otra tarjeta
    expect(again).toMatchObject({ notesCreated: 1, duplicates: 1 });
  });

  it('las notas repetidas dentro del mismo archivo se juntan', async () => {
    const { api, user } = setup();
    const result = await importParsed(
      api,
      user,
      csv('Guid,Frente,Reverso\ng1,Uno,Dos\ng1,Uno cambiado,Dos\ng2,Tres,Cuatro\n'),
      options(),
    );
    expect(result).toMatchObject({ notesCreated: 2, duplicates: 1 });
  });

  it('completa las cartas que una interrupción dejó sin guardar', async () => {
    const { api, user } = setup();
    const first = await importParsed(api, user, csv(file), options());
    const cards = await api.repos.cards.list();
    // Se pierde una carta, como si la importación se hubiera cortado a la mitad
    const lost = cards[0];
    expect(lost).toBeDefined();
    await api.repos.cards.putMany([
      { ...(lost as NonNullable<typeof lost>), deletedAt: '2026-10-08T12:00:00.000Z' },
    ]);
    // Una carta con marca de borrado no cuenta, así que el relleno solo corre con las que faltan
    const raw = await api.repos.cards.listAll();
    await api.repos.cards.putMany(raw.filter((card) => card.id !== lost?.id));
    const second = await importParsed(api, user, csv(file), options());
    expect(second.duplicates).toBe(2);
    expect(second.repaired).toBe(1);
    expect(second.rootDeckId).toBe(first.rootDeckId);
    expect(await api.repos.cards.list()).toHaveLength(2);
  });

  it('un lote grande entra por tandas y queda completo', async () => {
    const { api, user } = setup();
    const rows = Array.from({ length: 1200 }, (_, index) => `f${index},r${index}`).join('\n');
    const result = await importParsed(api, user, csv(`Frente,Reverso\n${rows}\n`), options());
    expect(result.notesCreated).toBe(1200);
    expect(await api.repos.notes.list()).toHaveLength(1200);
    expect(await api.repos.cards.list()).toHaveLength(1200);
  }, 60_000);
});

describe('importar es de cada alumno', () => {
  it('no mezcla con los mazos de otra persona y no los toca', async () => {
    const { api, user } = setup();
    const other = makeUser();
    await importParsed(api, other, csv('Guid,Frente,Reverso\ng1,Uno,Dos\n'), options());
    const mine = await importParsed(api, user, csv('Guid,Frente,Reverso\ng1,Uno,Dos\n'), options());
    // El mismo identificador en otra cuenta no es un duplicado
    expect(mine.notesCreated).toBe(1);
    expect((await api.repos.decks.list()).filter((deck) => deck.ownerId === user.id)).toHaveLength(
      1,
    );
  });
});

describe('exportar a CSV y volver a importar', () => {
  it('lo exportado se lee igual y al importarlo no duplica nada', async () => {
    const { api, user } = setup();
    const deck = await createManualDeck(api, user, { name: 'Cardiología' });
    const child = await createManualDeck(api, user, { name: 'Arritmias', parentId: deck.id });
    await saveManualNote(api, user, {
      deckId: deck.id,
      draft: { kind: 'basic', front: 'Una "pregunta", con coma', back: 'Línea 1\nLínea 2' },
      tags: ['cardio::urgencias'],
    });
    await saveManualNote(api, user, {
      deckId: child.id,
      draft: { kind: 'cloze', text: 'La {{c1::amiodarona}} alarga el QT', extra: 'Extra' },
    });
    await saveManualNote(api, user, {
      deckId: child.id,
      draft: { kind: 'basic_reverse', front: 'Metformina', back: 'Biguanida' },
    });

    const exported = await exportDecksCsv(api, user, undefined, new Date('2026-10-08T12:00:00Z'));
    expect(exported.notes).toBe(3);
    expect(exported.fileName).toBe('Studiare-2026-10-08.csv');
    expect(exported.content.startsWith('#separator:Comma\r\n#html:true\r\n#guid column:1')).toBe(
      true,
    );

    const parsed = parseCsv(strToU8(exported.content), exported.fileName);
    expect(parsed.errors).toEqual([]);
    expect(parsed.notes.map((note) => note.kind).sort()).toEqual([
      'basic',
      'basic_reverse',
      'cloze',
    ]);
    expect(parsed.notes.find((note) => note.kind === 'cloze')?.deckPath).toEqual([
      'Cardiología',
      'Arritmias',
    ]);

    const result = await importParsed(api, user, parsed, options({ deckName: 'Cardiología' }));
    expect(result.notesCreated).toBe(0);
    expect(result.duplicates).toBe(3);
    expect(await api.repos.notes.list()).toHaveLength(3);
  });

  it('exportar un mazo lleva sus submazos y nada de lo demás', async () => {
    const { api, user } = setup();
    const a = await createManualDeck(api, user, { name: 'A' });
    const b = await createManualDeck(api, user, { name: 'B' });
    const sub = await createManualDeck(api, user, { name: 'Sub', parentId: a.id });
    for (const deckId of [a.id, b.id, sub.id]) {
      await saveManualNote(api, user, {
        deckId,
        draft: { kind: 'basic', front: `en ${deckId}`, back: 'x' },
      });
    }
    const exported = await exportDecksCsv(api, user, a.id);
    expect(exported.notes).toBe(2);
    expect(exported.content).not.toContain(b.id);
    expect(exported.fileName.startsWith('A-')).toBe(true);
  });

  it('no exporta lo precargado ni lo de otra persona', async () => {
    const { api, user } = setup();
    const other = makeUser();
    const theirs = await createManualDeck(api, other, { name: 'Ajeno' });
    await saveManualNote(api, other, {
      deckId: theirs.id,
      draft: { kind: 'basic', front: 'secreto ajeno', back: 'x' },
    });
    const exported = await exportDecksCsv(api, user, undefined);
    expect(exported.notes).toBe(0);
    expect(exported.content).not.toContain('secreto ajeno');
  });
});

describe('resultados', () => {
  it('el tipo ImportResult describe todo lo que se guardó', () => {
    const result: ImportResult = {
      rootDeckId: 'x',
      decksCreated: 0,
      notesCreated: 0,
      cardsCreated: 0,
      duplicates: 0,
      repaired: 0,
      rejected: [],
    };
    expect(Object.keys(result)).toHaveLength(7);
  });
});
