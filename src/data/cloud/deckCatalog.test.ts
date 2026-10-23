import { describe, expect, it } from 'vitest';
import { fakeRpc, FakeDbError } from '../testing/bankCloud';
import {
  DeckFileError,
  downloadDeckFile,
  fetchDeckCatalog,
  recordDeckDownload,
} from './deckCatalog';

const deck = {
  deckKey: 'paco-mi',
  name: 'Medicina interna (Paco)',
  author: 'Paco',
  description: '',
  version: 1,
  notes: 2,
  cards: 3,
  bytes: 1200,
  subjects: [
    {
      subjectKey: 'infectologia',
      name: 'Infectología',
      branch: 'internal_medicine',
      topic: 'infectious_diseases',
      notes: 2,
      cards: 3,
      bytes: 1200,
      mediaParts: 1,
      sha256: 'a'.repeat(64),
    },
  ],
  preview: [{ kind: 'basic', front: '[Prueba] Frente', back: '' }, { kind: 'raro' }],
};

describe('catálogo de mazos del alumno', () => {
  it('lee la lista y deja fuera la nota de muestra que no entiende', async () => {
    const cloud = fakeRpc({ deck_catalog_list: () => ({ canDownload: false, decks: [deck] }) });
    const reply = await fetchDeckCatalog(cloud);
    expect(reply.ok && reply.value.canDownload).toBe(false);
    expect(reply.ok && reply.value.decks[0]?.preview).toEqual([
      { kind: 'basic', front: '[Prueba] Frente', back: '' },
    ]);
    expect(await fetchDeckCatalog(fakeRpc({ deck_catalog_list: () => ({ decks: 1 }) }))).toEqual({
      ok: false,
      reason: 'unknown',
    });
    expect(
      await fetchDeckCatalog(fakeRpc({ deck_catalog_list: () => new FakeDbError('42501') })),
    ).toEqual({ ok: false, reason: 'other_device' });
  });

  it('lee el permiso de cada mazo y, sin él, deja el de toda la lista', async () => {
    const cloud = fakeRpc({
      deck_catalog_list: () => ({
        canDownload: false,
        decks: [
          { ...deck, canDownload: true },
          { ...deck, deckKey: 'paco-gyo' },
        ],
      }),
    });
    const reply = await fetchDeckCatalog(cloud);
    expect(reply.ok && reply.value.canDownload).toBe(false);
    // Un servidor anterior no manda el permiso por mazo y entonces cada mazo usa el de la lista
    expect(reply.ok && reply.value.decks.map((item) => item.canDownload)).toEqual([
      true,
      undefined,
    ]);
    const wrong = await fetchDeckCatalog(
      fakeRpc({
        deck_catalog_list: () => ({ canDownload: false, decks: [{ ...deck, canDownload: 'sí' }] }),
      }),
    );
    expect(wrong).toEqual({ ok: false, reason: 'unknown' });
  });

  it('anota la bajada con los nombres de la base y no lanza si falla', async () => {
    const cloud = fakeRpc({ record_deck_download: () => null });
    expect(
      await recordDeckDownload(cloud, {
        deckKey: 'paco-mi',
        version: 1,
        subjectKey: 'infectologia',
        bytes: 99,
      }),
    ).toBe(true);
    expect(cloud.calls[0]?.args).toEqual({
      p_deck_key: 'paco-mi',
      p_version: 1,
      p_subject_key: 'infectologia',
      p_bytes: 99,
    });
    expect(
      await recordDeckDownload(fakeRpc({}), {
        deckKey: 'paco-mi',
        version: 1,
        subjectKey: 'x',
        bytes: 1,
      }),
    ).toBe(false);
  });

  it('baja del bucket deck-catalog y distingue lo que falta de la falta de red', async () => {
    const objects: Record<string, Blob> = { 'paco-mi/v1/a.json': new Blob(['{}']) };
    const asked: string[] = [];
    const storage = {
      storage: {
        from(bucket: string) {
          asked.push(bucket);
          return {
            download(path: string) {
              const data = objects[path];
              if (path === 'sin-red') return Promise.reject(new TypeError('Failed to fetch'));
              return Promise.resolve(
                data
                  ? { data, error: null }
                  : { data: null, error: { message: 'Object not found', status: 400 } },
              );
            },
          };
        },
      },
    } as never;
    expect(new TextDecoder().decode(await downloadDeckFile(storage, 'paco-mi/v1/a.json'))).toBe(
      '{}',
    );
    expect(asked).toEqual(['deck-catalog']);
    await expect(downloadDeckFile(storage, 'paco-mi/v1/b.json')).rejects.toMatchObject({
      missing: true,
      network: false,
    });
    await expect(downloadDeckFile(storage, 'sin-red')).rejects.toMatchObject({
      missing: false,
      network: true,
    });
    expect(new DeckFileError({ message: 'denied', statusCode: '403' })).toMatchObject({
      missing: false,
      network: false,
    });
    expect(new DeckFileError({ message: 'x', status: 404 }).missing).toBe(true);
  });
});
