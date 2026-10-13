import { describe, expect, it, vi } from 'vitest';
import { weekStartOf, studyDayOf } from '@/engines/studyDay';
import { makeFakeCloud, type FakeCloud } from '../testing/fakeCloud';
import {
  createPartyChallenge,
  createPartyDuel,
  createPartyGroup,
  fetchPartyOverview,
  joinPartyGroup,
  leaveAllPartyGroups,
  leavePartyGroup,
  normalizeInviteCode,
  partyFailureOf,
  publishPartyNumbers,
  submitPartyDuelResult,
} from './party';

const ANA = '2f6c4b1e-8a3d-4c7e-9b10-6d2e5f7a8b01';
const BRUNO = '7a1d3c5e-2b4f-4a6c-8e9d-0f1a2b3c4d5e';
const CARLA = '9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const week = () => weekStartOf(studyDayOf(new Date(), 'America/Merida'));
const questions = Array.from({ length: 20 }, (_, index) => `01J${String(index).padStart(23, '0')}`);

/** Una nube falsa con tres alumnos. as cambia de alumno como si fuera otro navegador */
function threeStudents() {
  const fake = makeFakeCloud({ session: { id: ANA, email: 'ana@ejemplo.mx' } });
  fake.aliases.set(ANA, 'Ana');
  fake.aliases.set(BRUNO, 'Bruno');
  fake.aliases.set(CARLA, 'Carla');
  const as = (id: string) => {
    fake.session = { id, email: `${id}@ejemplo.mx` };
    return fake.cloud;
  };
  return { fake, as };
}

async function groupOfAna(fake: FakeCloud, as: (id: string) => FakeCloud['cloud']) {
  const created = await createPartyGroup(as(ANA), 'Guardia');
  if (!created.ok || created.value.status !== 'created') throw new Error('no se creó el grupo');
  const joined = await joinPartyGroup(as(BRUNO), created.value.inviteCode.toLowerCase());
  expect(joined).toEqual({ ok: true, value: { status: 'joined', groupId: created.value.groupId } });
  expect(fake.party.activeMembers('Guardia')).toEqual([ANA, BRUNO]);
  return created.value;
}

describe('grupos de Party en la nube', () => {
  it('crea un grupo con código y lo devuelve en el resumen con alias y XP de la semana', async () => {
    const { fake, as } = threeStudents();
    const group = await groupOfAna(fake, as);
    expect(group.inviteCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);

    expect(
      await publishPartyNumbers(as(ANA), { weekStart: week(), weeklyXp: 120, contributions: [] }),
    ).toEqual({ ok: true, value: 1 });
    const overview = await fetchPartyOverview(as(BRUNO), week());
    if (!overview.ok) throw new Error('el resumen falló');
    expect(overview.value.weekStart).toBe(week());
    const [only] = overview.value.groups;
    expect(only).toMatchObject({ id: group.groupId, name: 'Guardia', isOwner: false });
    expect(only?.members.map((member) => [member.alias, member.weeklyXp, member.isSelf])).toEqual([
      ['Ana', 120, false],
      ['Bruno', 0, true],
    ]);
    // Nada de correos en lo que manda el servidor
    expect(JSON.stringify(overview.value)).not.toContain('@');
  });

  it('quien no está en el grupo no lo ve, y un código malo no mete a nadie', async () => {
    const { fake, as } = threeStudents();
    await groupOfAna(fake, as);
    expect(await joinPartyGroup(as(CARLA), 'ZQZQ22')).toEqual({
      ok: true,
      value: { status: 'not_found' },
    });
    expect(await fetchPartyOverview(as(CARLA), week())).toEqual({
      ok: true,
      value: { weekStart: week(), groups: [] },
    });
  });

  it('salir quita el grupo del resumen y el mismo código lo vuelve a abrir', async () => {
    const { fake, as } = threeStudents();
    const group = await groupOfAna(fake, as);
    expect(await leavePartyGroup(as(BRUNO), group.groupId)).toEqual({ ok: true, value: true });
    expect(await leavePartyGroup(as(BRUNO), group.groupId)).toEqual({ ok: true, value: false });
    const after = await fetchPartyOverview(as(BRUNO), week());
    expect(after.ok && after.value.groups).toEqual([]);
    expect(await joinPartyGroup(as(BRUNO), group.inviteCode)).toMatchObject({
      ok: true,
      value: { status: 'joined' },
    });
    expect(await leaveAllPartyGroups(as(BRUNO))).toEqual({ ok: true, value: 1 });
  });

  it('normaliza lo que escribe el alumno', () => {
    expect(normalizeInviteCode(' ab-c 234 ')).toBe('ABC234');
  });
});

describe('retos y duelos en la nube', () => {
  it('suma los aportes de los miembros y dice el propio', async () => {
    const { fake, as } = threeStudents();
    const group = await groupOfAna(fake, as);
    const created = await createPartyChallenge(as(ANA), {
      groupId: group.groupId,
      title: 'Mil tarjetas',
      metric: 'cards',
      target: 1000,
    });
    if (!created.ok || created.value.status !== 'created') throw new Error('no se creó el reto');
    const { challengeId } = created.value;
    const contributions = (amount: number) => [{ challengeId, amount }];
    await publishPartyNumbers(as(ANA), {
      weekStart: week(),
      weeklyXp: 50,
      contributions: contributions(40),
    });
    await publishPartyNumbers(as(BRUNO), {
      weekStart: week(),
      weeklyXp: 30,
      contributions: contributions(25),
    });
    const overview = await fetchPartyOverview(as(ANA), week());
    expect(overview.ok && overview.value.groups[0]?.challenges[0]).toMatchObject({
      title: 'Mil tarjetas',
      metric: 'cards',
      target: 1000,
      total: 65,
      mine: 40,
      createdBySelf: true,
    });
  });

  it('cada quien manda su resultado una vez y el del rival se ve solo después del propio', async () => {
    const { fake, as } = threeStudents();
    const group = await groupOfAna(fake, as);
    const created = await createPartyDuel(as(ANA), {
      groupId: group.groupId,
      opponentId: BRUNO,
      questionIds: questions,
    });
    if (!created.ok || created.value.status !== 'created') throw new Error('no se creó el duelo');
    const duelId = created.value.duelId;

    expect(await submitPartyDuelResult(as(ANA), { duelId, correct: 14, totalMs: 600_000 })).toEqual(
      { ok: true, value: 'saved' },
    );
    expect(await submitPartyDuelResult(as(ANA), { duelId, correct: 20, totalMs: 1 })).toEqual({
      ok: true,
      value: 'already',
    });
    const before = await fetchPartyOverview(as(BRUNO), week());
    expect(before.ok && before.value.groups[0]?.duels[0]).toMatchObject({
      id: duelId,
      questionIds: questions,
      mine: null,
      rival: null,
    });
    await submitPartyDuelResult(as(BRUNO), { duelId, correct: 12, totalMs: 500_000 });
    const after = await fetchPartyOverview(as(BRUNO), week());
    expect(after.ok && after.value.groups[0]?.duels[0]).toMatchObject({
      mine: { correct: 12, answered: 20, totalMs: 500_000 },
      rival: { correct: 14, answered: 20, totalMs: 600_000 },
    });
    expect(fake.party.duelResults(ANA).map((row) => [row.userId, row.correct])).toEqual([
      [ANA, 14],
      [BRUNO, 12],
    ]);
    // Alguien de fuera no participa
    expect(await submitPartyDuelResult(as(CARLA), { duelId, correct: 1, totalMs: 1 })).toEqual({
      ok: false,
      reason: 'not_member',
    });
  });

  it('retar a quien ya no está en el grupo lo dice', async () => {
    const { fake, as } = threeStudents();
    const group = await groupOfAna(fake, as);
    expect(
      await createPartyDuel(as(ANA), {
        groupId: group.groupId,
        opponentId: CARLA,
        questionIds: questions,
      }),
    ).toEqual({ ok: true, value: { status: 'rival_gone' } });
  });
});

describe('errores', () => {
  it('traduce el código de la base a una causa', () => {
    expect(partyFailureOf({ code: '28000' })).toBe('no_session');
    expect(partyFailureOf({ code: 'PGRST301' })).toBe('no_session');
    expect(partyFailureOf({ code: '42501' })).toBe('other_device');
    expect(partyFailureOf({ code: 'PT001' })).toBe('closed');
    expect(partyFailureOf({ code: 'PT002' })).toBe('not_member');
    expect(partyFailureOf({ code: '22023' })).toBe('invalid');
    expect(partyFailureOf({ code: 'PGRST202' })).toBe('unavailable');
    expect(partyFailureOf({ message: 'Failed to fetch' })).toBe('network');
    expect(partyFailureOf({ code: 'XX000' })).toBe('unknown');
  });

  it('una semana que no empieza en lunes la rechaza el servidor', async () => {
    const { as } = threeStudents();
    expect(await fetchPartyOverview(as(ANA), '2026-10-13')).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('sin sesión, sin red o con una respuesta de otra forma no rompe nada', async () => {
    const { fake, as } = threeStudents();
    as(ANA);
    fake.session = null;
    expect(await fetchPartyOverview(fake.cloud, week())).toEqual({
      ok: false,
      reason: 'no_session',
    });
    fake.session = { id: ANA, email: 'ana@ejemplo.mx' };
    fake.failParty = 'error';
    expect(await createPartyGroup(fake.cloud, 'x')).toEqual({ ok: false, reason: 'network' });
    fake.failParty = 'throw';
    expect(await joinPartyGroup(fake.cloud, 'ABC234')).toEqual({ ok: false, reason: 'network' });
    const odd = { rpc: vi.fn().mockResolvedValue({ data: { groups: 'no' }, error: null }) };
    expect(await fetchPartyOverview(odd as never, week())).toEqual({
      ok: false,
      reason: 'unknown',
    });
  });

  it('manda los argumentos con los nombres de la función de la base', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 3, error: null });
    await publishPartyNumbers({ rpc } as never, {
      weekStart: '2026-10-12',
      weeklyXp: 80,
      contributions: [{ challengeId: ANA, amount: 5 }],
    });
    expect(rpc).toHaveBeenCalledWith('party_publish', {
      p_week_start: '2026-10-12',
      p_xp: 80,
      p_progress: [{ challengeId: ANA, amount: 5 }],
    });
  });
});
