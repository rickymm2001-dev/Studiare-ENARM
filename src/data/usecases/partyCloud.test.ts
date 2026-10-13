import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { studyDayOf, weekStartOf } from '@/engines/studyDay';
import { uuidToUlid } from '../cloud/cloudIds';
import type { PartyOverview } from '../cloud/party';
import { makeFakeCloud } from '../testing/fakeCloud';
import { makeUser, testApi } from '../testing/fixtures';
import {
  createCloudGroup,
  exportMyPartyData,
  joinCloudGroup,
  leaveCloudGroup,
  pendingNumbers,
  publishMyNumbers,
  stopSharingParty,
  submitPlayedDuels,
  withPublishedNumbers,
} from './partyCloud';

const ANA = '2f6c4b1e-8a3d-4c7e-9b10-6d2e5f7a8b01';
const BRUNO = '7a1d3c5e-2b4f-4a6c-8e9d-0f1a2b3c4d5e';
const CHALLENGE = '5b2a1c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d';
const GROUP = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

const apis: ReturnType<typeof testApi>[] = [];
function setup() {
  const api = testApi();
  apis.push(api);
  const fake = makeFakeCloud({ session: { id: ANA, email: 'ana@ejemplo.mx' } });
  fake.aliases.set(ANA, 'Ana');
  fake.aliases.set(BRUNO, 'Bruno');
  return { api, fake };
}
afterEach(async () => {
  await Promise.all(apis.splice(0).map((api) => api.dispose()));
});

function overviewWith(options: {
  selfXp: number;
  mine: number | null;
  total: number;
}): PartyOverview {
  return {
    weekStart: '2026-10-12',
    groups: [
      {
        id: GROUP,
        name: 'Guardia',
        inviteCode: 'ABC234',
        isOwner: true,
        joinedAt: '2026-10-12T15:00:00.000Z',
        members: [
          {
            userId: ANA,
            alias: 'Ana',
            isSelf: true,
            weeklyXp: options.selfXp,
            joinedAt: '2026-10-12T15:00:00.000Z',
          },
          {
            userId: BRUNO,
            alias: 'Bruno',
            isSelf: false,
            weeklyXp: 70,
            joinedAt: '2026-10-12T16:00:00.000Z',
          },
        ],
        challenges: [
          {
            id: CHALLENGE,
            title: 'Mil tarjetas',
            metric: 'cards',
            target: 1000,
            startsAt: '2026-10-12T15:00:00.000Z',
            endsAt: '2026-10-19T15:00:00.000Z',
            createdBySelf: true,
            total: options.total,
            mine: options.mine,
          },
        ],
        duels: [],
      },
    ],
  };
}

describe('grupos de la nube y la bitácora', () => {
  it('crear, entrar y salir quedan en la bitácora con el id del grupo como ULID', async () => {
    const { api, fake } = setup();
    const ana = makeUser({ alias: 'Ana' });
    const created = await createCloudGroup(api, fake.cloud, ana, '  Guardia  ');
    if (!created.ok || created.value.status !== 'created') throw new Error('no se creó el grupo');
    expect(fake.party.codeOf('Guardia')).toBe(created.value.inviteCode);

    fake.session = { id: BRUNO, email: 'bruno@ejemplo.mx' };
    const bruno = makeUser({ alias: 'Bruno' });
    const joined = await joinCloudGroup(api, fake.cloud, bruno, ` ${created.value.inviteCode} `);
    expect(joined).toEqual({
      ok: true,
      value: { status: 'joined', groupId: created.value.groupId },
    });
    expect(await leaveCloudGroup(api, fake.cloud, bruno, created.value.groupId)).toEqual({
      ok: true,
      value: true,
    });

    const ulid = uuidToUlid(created.value.groupId);
    const rows = async (userId: string) =>
      (await api.repos.events.query({ userId })).map((event) => [
        event.type,
        (event.payload as { groupId: string }).groupId,
      ]);
    expect(await rows(ana.id)).toEqual([['party_joined', ulid]]);
    expect(await rows(bruno.id)).toEqual([
      ['party_joined', ulid],
      ['party_left', ulid],
    ]);
  });

  it('un código con forma inválida ni se manda, para no gastar los intentos del servidor', async () => {
    const { api, fake } = setup();
    expect(await joinCloudGroup(api, fake.cloud, makeUser(), 'O0I1L1')).toEqual({
      ok: true,
      value: { status: 'invalid' },
    });
    const user = makeUser();
    expect(await joinCloudGroup(api, fake.cloud, user, 'abc')).toEqual({
      ok: true,
      value: { status: 'invalid' },
    });
    expect(fake.rpcCalls).toEqual([]);
    expect(await api.repos.events.query({ userId: user.id })).toEqual([]);
  });

  it('dejar de compartir saca de todos los grupos', async () => {
    const { api, fake } = setup();
    await createCloudGroup(api, fake.cloud, makeUser(), 'Uno');
    await createCloudGroup(api, fake.cloud, makeUser(), 'Dos');
    expect(await stopSharingParty(fake.cloud)).toEqual({ ok: true, value: 2 });
    expect(fake.party.activeMembers('Uno')).toEqual([]);
  });
});

describe('cifras propias', () => {
  it('solo publica lo que cambió', () => {
    const contributions = new Map([[CHALLENGE, 30]]);
    expect(
      pendingNumbers(overviewWith({ selfXp: 120, mine: 30, total: 50 }), {
        weeklyXp: 120,
        contributions,
      }),
    ).toBeNull();
    expect(
      pendingNumbers(overviewWith({ selfXp: 100, mine: 30, total: 50 }), {
        weeklyXp: 120,
        contributions,
      }),
    ).toEqual({ weekStart: '2026-10-12', weeklyXp: 120, contributions: [] });
    expect(
      pendingNumbers(overviewWith({ selfXp: 120, mine: null, total: 20 }), {
        weeklyXp: 120,
        contributions,
      }),
    ).toEqual({
      weekStart: '2026-10-12',
      weeklyXp: 120,
      contributions: [{ challengeId: CHALLENGE, amount: 30 }],
    });
    // Un reto que ya no está en el resumen no se publica
    expect(
      pendingNumbers(overviewWith({ selfXp: 120, mine: 30, total: 50 }), {
        weeklyXp: 120,
        contributions: new Map([['otro', 9]]),
      }),
    ).toBeNull();
  });

  it('sin grupos no hay nada que publicar', () => {
    expect(
      pendingNumbers(
        { weekStart: '2026-10-12', groups: [] },
        { weeklyXp: 10, contributions: new Map() },
      ),
    ).toBeNull();
  });

  it('el resumen queda al día con lo publicado, sin contar dos veces el aporte propio', () => {
    const updated = withPublishedNumbers(overviewWith({ selfXp: 100, mine: 20, total: 50 }), {
      weekStart: '2026-10-12',
      weeklyXp: 140,
      contributions: [{ challengeId: CHALLENGE, amount: 35 }],
    });
    const [group] = updated.groups;
    expect(group?.members.map((member) => member.weeklyXp)).toEqual([140, 70]);
    expect(group?.challenges[0]).toMatchObject({ total: 65, mine: 35 });
  });

  it('publica en la nube y no llama al servidor si nada cambió', async () => {
    const { api, fake } = setup();
    await createCloudGroup(api, fake.cloud, makeUser(), 'Guardia');
    const weekStart = weekStartOf(studyDayOf(new Date(), 'America/Merida'));
    const { fetchPartyOverview } = await import('../cloud/party');
    const loaded = await fetchPartyOverview(fake.cloud, weekStart);
    if (!loaded.ok) throw new Error('el resumen falló');
    const mine = { weeklyXp: 90, contributions: new Map<string, number>() };
    const published = await publishMyNumbers(fake.cloud, loaded.value, mine);
    expect(published.ok && published.value.groups[0]?.members[0]?.weeklyXp).toBe(90);
    expect(fake.party.publishedXp('Guardia', ANA)).toBe(90);
    const calls = fake.rpcCalls.length;
    if (!published.ok) throw new Error('no se publicó');
    await publishMyNumbers(fake.cloud, published.value, mine);
    expect(fake.rpcCalls.length).toBe(calls);
  });
});

describe('duelos jugados', () => {
  it('manda cada resultado y cuenta solo los que guardó', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: 'saved', error: null })
      .mockResolvedValueOnce({ data: 'already', error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    const saved = await submitPlayedDuels({ rpc } as never, [
      { duelId: 'a', correct: 3, totalMs: 1000 },
      { duelId: 'b', correct: 4, totalMs: 2000 },
      { duelId: 'c', correct: 5, totalMs: 3000 },
    ]);
    expect(saved).toBe(1);
    expect(rpc).toHaveBeenNthCalledWith(1, 'party_submit_duel_result', {
      p_duel: 'a',
      p_correct: 3,
      p_total_ms: 1000,
    });
  });
});

describe('exportar mis datos de Party', () => {
  it('trae las filas propias de la nube y, si la nube falla, dice por qué', async () => {
    const { api, fake } = setup();
    const created = await createCloudGroup(api, fake.cloud, makeUser(), 'Guardia');
    if (!created.ok || created.value.status !== 'created') throw new Error('sin grupo');
    const exported = await exportMyPartyData(fake.cloud);
    expect(exported).toMatchObject({
      status: 'included',
      data: { memberships: [{ groupName: 'Guardia', isOwner: true, leftAt: null }] },
    });
    fake.failParty = 'error';
    expect(await exportMyPartyData(fake.cloud)).toEqual({
      status: 'unavailable',
      reason: 'network',
    });
  });
});
