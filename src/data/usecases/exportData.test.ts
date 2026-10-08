import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import { makeUser, testApi } from '../testing/fixtures';
import { exportUserData } from './exportData';
import { createOutline, saveOutline } from './outlines';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

it('exporta lo que el alumno creó y nada de lo de otra persona', async () => {
  const api = testApi('real');
  disposers.push(api.dispose);
  const user = makeUser();
  const other = makeUser();
  await api.repos.users.put(user);
  const mine = await createOutline(api, user, { title: 'Mío' });
  await saveOutline(api, user, mine.id, {
    lines: [{ id: mine.lines[0]?.id ?? '', depth: 0, text: 'A :: B', noteId: null }],
  });
  const theirs = await createOutline(api, other, { title: 'De otra persona' });
  await saveOutline(api, other, theirs.id, {
    lines: [{ id: theirs.lines[0]?.id ?? '', depth: 0, text: 'C :: D', noteId: null }],
  });

  const data = await exportUserData(api.repos, user.id);
  expect(data.format).toBe('enarm-prototipo-export-v2');
  expect(data.content.outlines.map((page) => page.title)).toEqual(['Mío']);
  expect(data.content.notes).toHaveLength(1);
  expect(data.content.cards).toHaveLength(1);
  // El mazo raíz Apuntes y el del apunte
  expect(data.content.decks.map((deck) => deck.name).sort()).toEqual(['Apuntes', 'Mío']);
  expect(JSON.stringify(data)).not.toContain('De otra persona');
});
