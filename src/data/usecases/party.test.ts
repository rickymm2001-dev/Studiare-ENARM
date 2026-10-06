import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { newId, testApi } from '../testing/fixtures';
import { createChallenge, createDuel, createGroup } from './party';
import { makeUser } from '../testing/fixtures';

const apis: ReturnType<typeof testApi>[] = [];
function setup() {
  const api = testApi();
  apis.push(api);
  return api;
}
afterEach(async () => {
  await Promise.all(apis.splice(0).map((api) => api.dispose()));
});

describe('duelos de Party', () => {
  it('guarda el duelo con su rival y las preguntas fijadas', async () => {
    const api = setup();
    const user = makeUser();
    const group = await createGroup(api, user, { name: 'Guardia', withSimulatedFriends: true });
    const rival = (await api.repos.memberships.list()).find((member) => member.isSimulated);
    if (!rival) throw new Error('el grupo debía traer compañeros simulados');
    const ids = [newId(), newId(), newId()];
    const id = newId();
    const duel = await createDuel(api, group, {
      id,
      title: ' Duelo contra Ana R. ',
      opponent: rival,
      questionIds: ids,
    });
    expect(duel).toMatchObject({
      id,
      kind: 'duel',
      title: 'Duelo contra Ana R.',
      metric: 'accuracy',
      target: 3,
      opponentId: rival.id,
      questionIds: ids,
      isSimulated: true,
    });
    expect(await api.repos.challenges.get(id)).toEqual(duel);
  });

  it('un duelo sin preguntas no se crea', async () => {
    const api = setup();
    const user = makeUser();
    const group = await createGroup(api, user, { name: 'Guardia', withSimulatedFriends: true });
    const rival = (await api.repos.memberships.list()).find((member) => member.isSimulated);
    if (!rival) throw new Error('el grupo debía traer compañeros simulados');
    await expect(
      createDuel(api, group, { id: newId(), title: 'Vacío', opponent: rival, questionIds: [] }),
    ).rejects.toThrow();
  });

  it('el esquema no deja un duelo sin rival ni un reto colectivo con rival', async () => {
    const api = setup();
    const user = makeUser();
    const group = await createGroup(api, user, { name: 'Guardia', withSimulatedFriends: false });
    const base = {
      id: newId(),
      groupId: group.id,
      title: 'Reto',
      metric: 'accuracy' as const,
      target: 5,
      isSimulated: false,
      startsAt: '2026-10-01T15:00:00.000Z',
      endsAt: '2026-10-08T15:00:00.000Z',
    };
    await expect(api.repos.challenges.put({ ...base, kind: 'duel' })).rejects.toThrow();
    await expect(
      api.repos.challenges.put({ ...base, kind: 'collective', opponentId: newId() }),
    ).rejects.toThrow();
    // Un reto colectivo de siempre sigue funcionando
    const collective = await createChallenge(api, group, {
      title: 'Tarjetas',
      metric: 'cards',
      target: 100,
    });
    expect(collective.kind).toBe('collective');
    expect(collective).not.toHaveProperty('opponentId');
  });
});
