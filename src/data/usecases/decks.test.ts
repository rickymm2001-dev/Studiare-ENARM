import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { loadDemoDecks } from '@/demo/content/decks';
import { makeUser, testApi } from '../testing/fixtures';
import { followDeck } from './decks';

const disposers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

describe('seguir mazos precargados', () => {
  it('volver a seguir un mazo no regresa a borrador lo que un médico ya decidió', async () => {
    const api = testApi('real');
    disposers.push(api.dispose);
    const user = makeUser();
    await api.repos.users.put(user);
    const [file] = await loadDemoDecks();
    if (!file) throw new Error('Sin mazos de demostración');

    const followed = await followDeck(api, user, file);
    const notes = await api.repos.notes.list();
    expect(notes.length).toBeGreaterThan(2);
    expect(notes.every((note) => note.editorialStatus === 'draft')).toBe(true);

    const [approved, rejected] = notes;
    if (!approved || !rejected) throw new Error('Sin notas');
    await api.repos.notes.put({ ...approved, editorialStatus: 'approved' });
    await api.repos.notes.put({ ...rejected, editorialStatus: 'rejected' });

    await followDeck(api, followed, file);
    const after = new Map((await api.repos.notes.list()).map((note) => [note.id, note]));
    expect(after.size).toBe(notes.length);
    expect(after.get(approved.id)?.editorialStatus).toBe('approved');
    expect(after.get(rejected.id)?.editorialStatus).toBe('rejected');
    expect([...after.values()].filter((note) => note.editorialStatus === 'draft').length).toBe(
      notes.length - 2,
    );
  });
});
