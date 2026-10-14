import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { weekStartOf, studyDayOf } from '@/engines/studyDay';
import { FAKE_PARTY_LIMITS } from '../testing/fakePartyServer';
import { makeFakeCloud, type FakeCloud } from '../testing/fakeCloud';
import {
  PARTY_CAPS,
  createPartyChallenge,
  createPartyDuel,
  createPartyGroup,
  deletePartyChallenge,
  fetchMyPartyExport,
  fetchPartyOverview,
  joinPartyGroup,
  leaveAllPartyGroups,
  leavePartyGroup,
  normalizeInviteCode,
  partyFailureOf,
  publishPartyNumbers,
  removePartyMember,
  rotatePartyCode,
  startPartyDuel,
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
  // Party es de los planes de pago (B8). Los tres pagan el mensual
  for (const id of [ANA, BRUNO, CARLA]) fake.plans.set(id, 'monthly');
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

    // Sin empezar el duelo en el servidor no se acepta el resultado
    expect(await submitPartyDuelResult(as(ANA), { duelId, correct: 14, totalMs: 600_000 })).toEqual(
      { ok: false, reason: 'not_started' },
    );
    expect(await startPartyDuel(as(ANA), duelId)).toEqual({ ok: true, value: 'started' });
    expect(await startPartyDuel(as(ANA), duelId)).toEqual({ ok: true, value: 'already' });
    expect(await submitPartyDuelResult(as(ANA), { duelId, correct: 14, totalMs: 600_000 })).toEqual(
      { ok: true, value: 'saved' },
    );
    expect(await submitPartyDuelResult(as(ANA), { duelId, correct: 20, totalMs: 60_000 })).toEqual({
      ok: true,
      value: 'already',
    });
    const before = await fetchPartyOverview(as(BRUNO), week());
    expect(before.ok && before.value.groups[0]?.duels[0]).toMatchObject({
      id: duelId,
      questionIds: questions,
      startedAt: null,
      mine: null,
      rival: null,
    });
    await startPartyDuel(as(BRUNO), duelId);
    // Menos de 3 segundos por acierto no se puede contestar
    expect(
      await submitPartyDuelResult(as(BRUNO), { duelId, correct: 12, totalMs: 35_999 }),
    ).toEqual({ ok: false, reason: 'implausible' });
    await submitPartyDuelResult(as(BRUNO), { duelId, correct: 12, totalMs: 500_000 });
    const after = await fetchPartyOverview(as(BRUNO), week());
    expect(after.ok && after.value.groups[0]?.duels[0]).toMatchObject({
      startedAt: expect.any(String) as string,
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

  it('el XP de la semana y los aportes tienen tope', async () => {
    const { fake, as } = threeStudents();
    const group = await groupOfAna(fake, as);
    const challenge = await createPartyChallenge(as(ANA), {
      groupId: group.groupId,
      title: 'Cien',
      metric: 'questions',
      target: 100,
    });
    if (!challenge.ok || challenge.value.status !== 'created') throw new Error('sin reto');
    const challengeId = challenge.value.challengeId;
    expect(
      await publishPartyNumbers(as(BRUNO), {
        weekStart: week(),
        weeklyXp: PARTY_CAPS.weeklyXp + 1,
        contributions: [],
      }),
    ).toEqual({ ok: false, reason: 'implausible' });
    expect(
      await publishPartyNumbers(as(BRUNO), {
        weekStart: week(),
        weeklyXp: 10,
        contributions: [{ challengeId, amount: 101 }],
      }),
    ).toEqual({ ok: false, reason: 'implausible' });
    // Todo o nada. El XP tampoco se guardó
    expect(fake.party.publishedXp('Guardia', BRUNO)).toBeNull();
    expect(
      await publishPartyNumbers(as(BRUNO), {
        weekStart: week(),
        weeklyXp: PARTY_CAPS.weeklyXp,
        contributions: [{ challengeId, amount: 100 }],
      }),
    ).toEqual({ ok: true, value: 2 });
  });

  it('quien administra cambia el código, quita miembros y borra retos', async () => {
    const { fake, as } = threeStudents();
    const group = await groupOfAna(fake, as);
    const challenge = await createPartyChallenge(as(BRUNO), {
      groupId: group.groupId,
      title: 'De Bruno',
      metric: 'cards',
      target: 50,
    });
    if (!challenge.ok || challenge.value.status !== 'created') throw new Error('sin reto');

    // Bruno no administra el grupo, pero borra su propio reto
    expect(await rotatePartyCode(as(BRUNO), group.groupId)).toEqual({
      ok: false,
      reason: 'not_owner',
    });
    expect(await removePartyMember(as(BRUNO), { groupId: group.groupId, memberId: ANA })).toEqual({
      ok: false,
      reason: 'not_owner',
    });
    expect(await deletePartyChallenge(as(BRUNO), challenge.value.challengeId)).toEqual({
      ok: true,
      value: true,
    });
    expect(await deletePartyChallenge(as(BRUNO), challenge.value.challengeId)).toEqual({
      ok: true,
      value: false,
    });
    const overview = await fetchPartyOverview(as(ANA), week());
    expect(overview.ok && overview.value.groups[0]?.challenges).toEqual([]);

    // Ana cambia el código. El de antes ya no abre el grupo
    const rotated = await rotatePartyCode(as(ANA), group.groupId);
    if (!rotated.ok) throw new Error('no se cambió el código');
    expect(rotated.value.inviteCode).not.toBe(group.inviteCode);
    expect(fake.party.codeOf('Guardia')).toBe(rotated.value.inviteCode);
    expect(await joinPartyGroup(as(CARLA), group.inviteCode)).toEqual({
      ok: true,
      value: { status: 'not_found' },
    });

    // Ana no se quita a sí misma y quita a Bruno
    expect(await removePartyMember(as(ANA), { groupId: group.groupId, memberId: ANA })).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(await removePartyMember(as(ANA), { groupId: group.groupId, memberId: BRUNO })).toEqual({
      ok: true,
      value: true,
    });
    expect(fake.party.activeMembers('Guardia')).toEqual([ANA]);
    const bruno = await fetchPartyOverview(as(BRUNO), week());
    expect(bruno.ok && bruno.value.groups).toEqual([]);
  });

  it('exporta solo las filas propias de Party', async () => {
    const { fake, as } = threeStudents();
    const group = await groupOfAna(fake, as);
    await publishPartyNumbers(as(BRUNO), { weekStart: week(), weeklyXp: 45, contributions: [] });
    const duel = await createPartyDuel(as(ANA), {
      groupId: group.groupId,
      opponentId: BRUNO,
      questionIds: questions,
    });
    if (!duel.ok || duel.value.status !== 'created') throw new Error('sin duelo');
    await startPartyDuel(as(BRUNO), duel.value.duelId);
    await submitPartyDuelResult(as(BRUNO), {
      duelId: duel.value.duelId,
      correct: 3,
      totalMs: 90_000,
    });

    const exported = await fetchMyPartyExport(as(BRUNO));
    if (!exported.ok) throw new Error('no se exportó');
    expect(exported.value.memberships).toEqual([
      expect.objectContaining({ groupId: group.groupId, groupName: 'Guardia', isOwner: false }),
    ]);
    expect(exported.value.weeklyXp).toEqual([expect.objectContaining({ xp: 45 })]);
    expect(exported.value.duels).toEqual([
      expect.objectContaining({
        duelId: duel.value.duelId,
        role: 'opponent',
        result: expect.objectContaining({ correct: 3, totalMs: 90_000 }) as unknown,
      }),
    ]);
    // Nada de Ana, ni su id
    expect(JSON.stringify(exported.value)).not.toContain(ANA);
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
    expect(partyFailureOf({ code: 'PT003' })).toBe('not_started');
    expect(partyFailureOf({ code: 'PT004' })).toBe('implausible');
    expect(partyFailureOf({ code: 'PT005' })).toBe('not_owner');
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

describe('los topes son los de la base', () => {
  it('PARTY_CAPS y el doble de pruebas usan los mismos números que party_limit', () => {
    const sql = readFileSync(
      join(
        import.meta.dirname,
        '..',
        '..',
        '..',
        'supabase',
        'migrations',
        '20261018000001_party_cloud.sql',
      ),
      'utf8',
    );
    expect(sql).toContain(`when 'weekly_xp' then ${String(PARTY_CAPS.weeklyXp)}`);
    expect(sql).toContain(`when 'duel_ms_per_correct' then ${String(PARTY_CAPS.duelMsPerCorrect)}`);
    expect(FAKE_PARTY_LIMITS.weeklyXp).toBe(PARTY_CAPS.weeklyXp);
    expect(FAKE_PARTY_LIMITS.duelMsPerCorrect).toBe(PARTY_CAPS.duelMsPerCorrect);
  });
});
