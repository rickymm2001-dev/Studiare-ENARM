import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { newId, testApi } from '../testing/fixtures';
import { createChallenge, createDuel, createGroup, joinGroupByCode } from './party';
import { MAX_GROUP_MEMBERS } from '@/engines/party';
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

describe('unirse a un grupo con su código', () => {
  async function groupWith(api: ReturnType<typeof testApi>) {
    const owner = makeUser({ alias: 'Dueña' });
    const group = await createGroup(api, owner, { name: 'Guardia', withSimulatedFriends: false });
    return { owner, group };
  }

  it('entra con el código aunque lo escriba en minúsculas y con espacios', async () => {
    const api = setup();
    const { group } = await groupWith(api);
    const guest = makeUser({ alias: 'Invitado' });
    expect(await joinGroupByCode(api, guest, ` ${group.inviteCode.toLowerCase()} `)).toBe('joined');
    const members = (await api.repos.memberships.list()).filter(
      (item) => item.groupId === group.id && item.leftAt === null,
    );
    expect(members.map((item) => item.alias).sort()).toEqual(['Dueña', 'Invitado']);
  });

  it('si ya está dentro lo avisa y no lo duplica', async () => {
    const api = setup();
    const { owner, group } = await groupWith(api);
    expect(await joinGroupByCode(api, owner, group.inviteCode)).toBe('already');
    const members = (await api.repos.memberships.list()).filter(
      (item) => item.groupId === group.id,
    );
    expect(members).toHaveLength(1);
  });

  it('un código con forma inválida o que no existe no mete a nadie', async () => {
    const api = setup();
    await groupWith(api);
    const guest = makeUser();
    expect(await joinGroupByCode(api, guest, 'abc')).toBe('invalid');
    expect(await joinGroupByCode(api, guest, 'O0I1L1')).toBe('invalid');
    expect(await joinGroupByCode(api, guest, 'ZZZZZZ')).toBe('not_found');
  });

  it('un grupo lleno no recibe a nadie más', async () => {
    const api = setup();
    const { group } = await groupWith(api);
    const now = new Date().toISOString();
    await api.repos.memberships.putMany(
      Array.from({ length: MAX_GROUP_MEMBERS - 1 }, (_, index) => ({
        id: newId(),
        groupId: group.id,
        userId: newId(),
        alias: `Persona ${index}`,
        isSimulated: false,
        joinedAt: now,
        leftAt: null,
      })),
    );
    expect(await joinGroupByCode(api, makeUser(), group.inviteCode)).toBe('full');
  });

  it('quien salió del grupo puede volver a entrar con el mismo código', async () => {
    const api = setup();
    const { group } = await groupWith(api);
    const guest = makeUser({ alias: 'Invitado' });
    expect(await joinGroupByCode(api, guest, group.inviteCode)).toBe('joined');
    const membership = (await api.repos.memberships.list()).find(
      (item) => item.userId === guest.id,
    );
    if (!membership) throw new Error('debía haber entrado');
    await api.repos.memberships.put({ ...membership, leftAt: new Date().toISOString() });
    expect(await joinGroupByCode(api, guest, group.inviteCode)).toBe('joined');
  });
});
