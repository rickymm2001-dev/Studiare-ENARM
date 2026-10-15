import 'fake-indexeddb/auto';
import { zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deckIds } from '@/demo/content/deckEntities';
import type { DeckCatalogEntry, DeckCatalogSubjectInfo } from '../bank/contracts';
import type { DeckSubjectFile } from '../schemas/deckCatalog';
import { makeUser, testApi } from '../testing/fixtures';
import {
  askPersistentStorage,
  CatalogDeckError,
  downloadCatalogSubject,
  refollowCatalogDeck,
  removeCatalogDownloads,
  sha256Hex,
  subjectStates,
  type CatalogFiles,
} from './catalogDecks';

const disposers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

/** Un submazo simulado del catálogo, con una nota básica con imagen y una cloze */
function subjectFile(overrides: Partial<DeckSubjectFile> = {}): DeckSubjectFile {
  const image = '/deck-media/paco-mi/infectologia/m-0001.png';
  return {
    version: 1,
    deckKey: 'paco-mi',
    deckVersion: 2,
    subjectKey: 'infectologia',
    name: 'Infectología',
    branch: 'internal_medicine',
    topic: 'infectious_diseases',
    author: 'Paco',
    status: 'pending_physician_review',
    media: [image],
    notes: [
      {
        key: 'paco-mi-000000000001',
        sourceTag: 'Medicina-Interna::Infectología::Sepsis',
        tags: ['Medicina Interna'],
        branch: 'internal_medicine',
        topic: 'infectious_diseases',
        kind: 'basic',
        front: `[Prueba] Frente simulado <img src="${image}">`,
        back: '[Prueba] Reverso simulado',
      },
      {
        key: 'paco-mi-000000000002',
        sourceTag: 'Medicina-Interna::Infectología::Sepsis',
        tags: ['Medicina Interna'],
        branch: 'internal_medicine',
        topic: 'infectious_diseases',
        kind: 'cloze',
        text: '[Prueba] {{c1::Hueco}} simulado {{c2::otro}}',
        extra: '',
        ordinals: [1, 2],
      },
    ],
    ...overrides,
  };
}

/** Un bucket en memoria que responde como downloadDeckFile */
function bucket(objects: Record<string, Uint8Array<ArrayBuffer>>) {
  const downloads: string[] = [];
  const records: unknown[] = [];
  const files: CatalogFiles = {
    download(path) {
      downloads.push(path);
      const found = objects[path];
      if (found) return Promise.resolve(found);
      return Promise.reject(
        Object.assign(new Error('Object not found'), { missing: true, network: false }),
      );
    },
    record(input) {
      records.push(input);
      return Promise.resolve(true);
    },
  };
  return { files, downloads, records };
}

async function setup(
  file: DeckSubjectFile,
  objects: (json: Uint8Array<ArrayBuffer>) => Record<string, Uint8Array<ArrayBuffer>>,
) {
  const api = testApi('real');
  disposers.push(api.dispose);
  const user = makeUser();
  await api.repos.users.put(user);
  const json = encode(file);
  const subject: DeckCatalogSubjectInfo = {
    subjectKey: file.subjectKey,
    name: file.name,
    branch: file.branch,
    topic: file.topic,
    notes: file.notes.length,
    cards: 3,
    bytes: json.length,
    mediaParts: 1,
    sha256: await sha256Hex(json),
  };
  const deck: DeckCatalogEntry = {
    deckKey: file.deckKey,
    name: 'Medicina interna (Paco)',
    author: 'Paco',
    description: 'Mazo de Paco, compartido con su autorización.',
    version: file.deckVersion,
    notes: file.notes.length,
    cards: 3,
    bytes: json.length,
    subjects: [subject],
    preview: [],
  };
  return { api, user, deck, subject, ...bucket(objects(json)) };
}

const png = new Uint8Array([137, 80, 78, 71]);
const zipOf = (entries: Record<string, Uint8Array>) => new Uint8Array(zipSync(entries));

describe('bajar un submazo del catálogo (4.8)', () => {
  it('guarda notas, tarjetas e imágenes con las claves de la demo, sigue el mazo y anota la bajada', async () => {
    const file = subjectFile();
    const { api, user, deck, subject, files, records } = await setup(file, (json) => ({
      'paco-mi/v2/infectologia.json': json,
      'paco-mi/v2/infectologia.media-1.zip': zipOf({ 'm-0001.png': png, 'otro.png': png }),
    }));
    const result = await downloadCatalogSubject({ api, user, deck, subject, files });
    expect(result).toMatchObject({ notes: 2, images: 1 });
    const note = await api.repos.notes.get(deckIds.note('paco-mi-000000000001'));
    expect(note).toMatchObject({ origin: 'preloaded', isDemo: false });
    expect(await api.repos.cards.list()).toHaveLength(3);
    expect((await api.repos.decks.get(deckIds.deck('paco-mi')))?.isDemo).toBe(false);
    const image = await api.repos.deckMedia.get('/deck-media/paco-mi/infectologia/m-0001.png');
    expect(image).toMatchObject({ type: 'image/png', deckVersion: 2 });
    // Solo las imágenes que el submazo dice que usa
    expect(
      await api.repos.deckMedia.get('/deck-media/paco-mi/infectologia/otro.png'),
    ).toBeUndefined();
    expect((await api.repos.users.get(user.id))?.settings.followedDecks).toContain('paco-mi');
    expect((await api.repos.bankState.get('decks'))?.downloads).toEqual([
      expect.objectContaining({ deckKey: 'paco-mi', subjectKey: 'infectologia', version: 2 }),
    ]);
    await vi.waitFor(() => {
      expect(records).toEqual([
        expect.objectContaining({ deckKey: 'paco-mi', version: 2, subjectKey: 'infectologia' }),
      ]);
    });
  });

  it('junta en orden el .json partido de más de 5 MB', async () => {
    const file = subjectFile();
    const { api, user, deck, subject, files, downloads } = await setup(file, (json) => {
      const middle = Math.floor(json.length / 2);
      return {
        'paco-mi/v2/infectologia.part-1.json': json.slice(0, middle),
        'paco-mi/v2/infectologia.part-2.json': json.slice(middle),
        'paco-mi/v2/infectologia.media-1.zip': zipOf({ 'm-0001.png': png }),
      };
    });
    await downloadCatalogSubject({ api, user, deck, subject, files });
    expect(downloads.slice(0, 4)).toEqual([
      'paco-mi/v2/infectologia.json',
      'paco-mi/v2/infectologia.part-1.json',
      'paco-mi/v2/infectologia.part-2.json',
      'paco-mi/v2/infectologia.part-3.json',
    ]);
    expect(await api.repos.notes.list()).toHaveLength(2);
  });

  it('no guarda nada si la huella no cuadra, si el archivo es de otro submazo o si falta algo', async () => {
    const file = subjectFile();
    const first = await setup(file, (json) => ({ 'paco-mi/v2/infectologia.json': json }));
    await expect(
      downloadCatalogSubject({
        ...first,
        subject: { ...first.subject, sha256: '0'.repeat(64) },
      }),
    ).rejects.toEqual(new CatalogDeckError('corrupt'));
    // Falta el paquete de imágenes
    await expect(downloadCatalogSubject(first)).rejects.toMatchObject({ reason: 'missing' });
    expect(await first.api.repos.notes.list()).toEqual([]);

    const other = subjectFile({ subjectKey: 'cardiologia' });
    const second = await setup(other, (json) => ({ 'paco-mi/v2/cardiologia.json': json }));
    await expect(
      downloadCatalogSubject({
        ...second,
        subject: { ...second.subject, subjectKey: 'cardiologia' },
      }),
    ).rejects.toBeDefined();
    const moved = await setup(file, (json) => ({ 'paco-mi/v2/infectologia.json': json }));
    await expect(
      downloadCatalogSubject({ ...moved, deck: { ...moved.deck, version: 3 } }),
    ).rejects.toMatchObject({ reason: 'missing' });
    const broken = await setup(file, () => ({ 'paco-mi/v2/infectologia.json': encode('[') }));
    await expect(
      downloadCatalogSubject({
        ...broken,
        subject: { ...broken.subject, sha256: await sha256Hex(encode('[')) },
      }),
    ).rejects.toMatchObject({ reason: 'corrupt' });
  });

  it('sin conexión o sin permiso lo dice con su motivo', async () => {
    const file = subjectFile();
    const { api, user, deck, subject } = await setup(file, () => ({}));
    const failing = (error: object): CatalogFiles => ({
      download: () => Promise.reject(Object.assign(new Error('x'), error)),
      record: () => true,
    });
    await expect(
      downloadCatalogSubject({ api, user, deck, subject, files: failing({ network: true }) }),
    ).rejects.toMatchObject({ reason: 'network' });
    await expect(
      downloadCatalogSubject({ api, user, deck, subject, files: failing({ network: false }) }),
    ).rejects.toMatchObject({ reason: 'denied' });
  });

  it('quitar descargas borra las imágenes y las bajadas, deja de seguirlo y conserva las notas', async () => {
    const file = subjectFile();
    const { api, user, deck, subject, files } = await setup(file, (json) => ({
      'paco-mi/v2/infectologia.json': json,
      'paco-mi/v2/infectologia.media-1.zip': zipOf({ 'm-0001.png': png }),
    }));
    await downloadCatalogSubject({ api, user, deck, subject, files });
    const followed = (await api.repos.users.get(user.id)) ?? user;
    expect(await removeCatalogDownloads(api, followed, 'paco-mi')).toBe(1);
    expect(await api.repos.deckMedia.get('/deck-media/paco-mi/infectologia/m-0001.png')).toBe(
      undefined,
    );
    expect((await api.repos.bankState.get('decks'))?.downloads).toEqual([]);
    const after = (await api.repos.users.get(user.id)) ?? user;
    expect(after.settings.followedDecks).not.toContain('paco-mi');
    // Las notas y las tarjetas se quedan con sus claves, así sus repasos siguen al volver a bajarlo
    expect(await api.repos.notes.get(deckIds.note('paco-mi-000000000001'))).toBeDefined();
    expect(await api.repos.cards.list()).toHaveLength(3);

    await refollowCatalogDeck(api, after, 'paco-mi');
    expect((await api.repos.users.get(user.id))?.settings.followedDecks).toEqual(['paco-mi']);
  });

  it('una versión nueva marca para actualizar solo los submazos con otro .json', () => {
    const deck = {
      deckKey: 'paco-mi',
      subjects: [
        { subjectKey: 'a', sha256: 'a'.repeat(64) },
        { subjectKey: 'b', sha256: 'c'.repeat(64) },
        { subjectKey: 'c', sha256: 'd'.repeat(64) },
      ] as DeckCatalogSubjectInfo[],
    };
    const downloaded = (subjectKey: string, sha: string) => ({
      deckKey: 'paco-mi',
      subjectKey,
      version: 1,
      sha256: sha.repeat(64),
      bytes: 10,
      at: '2026-10-20T15:00:00.000Z',
    });
    expect(
      Object.fromEntries(
        subjectStates(deck, [
          downloaded('a', 'a'),
          downloaded('b', 'b'),
          { ...downloaded('c', 'd'), deckKey: 'otro-mazo' },
        ]),
      ),
    ).toEqual({ a: 'current', b: 'update', c: 'none' });
  });

  it('pide almacenamiento persistente una sola vez y sigue si el navegador no sabe', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    expect(await askPersistentStorage({ persisted: () => Promise.resolve(false), persist })).toBe(
      true,
    );
    expect(await askPersistentStorage({ persisted: () => Promise.resolve(true), persist })).toBe(
      true,
    );
    expect(persist).toHaveBeenCalledOnce();
    expect(await askPersistentStorage(undefined)).toBe(false);
    expect(
      await askPersistentStorage({
        persisted: () => Promise.reject(new Error('no')),
        persist,
      }),
    ).toBe(false);
  });
});
