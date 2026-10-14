// El doble de Party de las pruebas cierra Party como la base en el plan Gratis (B8 del plan del
// cambio, 20261021000001_free_plan_locks.sql) y sigue sus reglas con miembros en Gratis
// (20261021000002_free_plan_party_moderation.sql). Lo usan las pruebas unitarias y el Supabase simulado
// de las e2e, así que tiene que contestar igual que la base.
import { describe, expect, it } from 'vitest';
import { createFakePartyServer } from './fakePartyServer';

const ANA = '2f6c4b1e-8a3d-4c7e-9b10-6d2e5f7a8b01';
const BRUNO = '7a1d3c5e-2b4f-4a6c-8e9d-0f1a2b3c4d5e';
const CARLA = '9c2e4a6b-1d3f-4b5c-8a7e-2f4d6b8a0c12';

/** Ana administra Guardia. Bruno y Carla entran en ese orden. Pagan quienes estén en paid */
function guardia(paid: Set<string>) {
  let clock = Date.parse('2026-10-14T15:00:00.000Z');
  const party = createFakePartyServer({
    aliasOf: () => 'Alumno',
    isOpen: (userId) => paid.has(userId),
    now: () => (clock += 1000),
  });
  party.call('party_create_group', ANA, { p_name: 'Guardia' });
  const code = party.codeOf('Guardia');
  party.call('party_join_group', BRUNO, { p_code: code });
  party.call('party_join_group', CARLA, { p_code: code });
  const overview = party.call('party_overview', ANA, { p_week_start: '2026-10-12' });
  const groupId = (
    (overview as { data: { groups: { id: string }[] } }).data.groups[0] ?? { id: '' }
  ).id;
  return { party, groupId };
}

describe('Party cerrada en el doble de pruebas', () => {
  it('sin plan cada función contesta PT001 antes de tocar nada, salvo salir y exportar lo propio', () => {
    const paid = new Set([ANA]);
    const party = createFakePartyServer({
      aliasOf: (userId) => (userId === ANA ? 'Ana' : 'Bruno'),
      isOpen: (userId) => paid.has(userId),
    });
    const created = party.call('party_create_group', ANA, { p_name: 'Guardia' });
    const code = party.codeOf('Guardia');
    expect(created).toMatchObject({ data: { status: 'created' } });
    if (!code) throw new Error('El grupo no tiene código');

    expect(party.call('party_open', ANA, {})).toEqual({ data: true });
    expect(party.call('party_open', BRUNO, {})).toEqual({ data: false });
    for (const [name, args] of [
      ['party_join_group', { p_code: code }],
      ['party_create_group', { p_name: 'Otro' }],
      ['party_overview', { p_week_start: '2026-10-12' }],
      ['party_publish', { p_week_start: '2026-10-12', p_xp: 10, p_progress: [] }],
    ] as const) {
      expect(party.call(name, BRUNO, args), name).toMatchObject({ error: { code: 'PT001' } });
    }
    expect(party.activeMembers('Guardia')).toEqual([ANA]);
    // Salir y exportar lo propio no piden Party abierta
    expect(party.call('party_leave_all', BRUNO, {})).toEqual({ data: 0 });
    expect(party.call('party_export_mine', BRUNO, {})).toMatchObject({
      data: { memberships: [] },
    });

    // Con un plan de pago se abre en el acto
    paid.add(BRUNO);
    expect(party.call('party_join_group', BRUNO, { p_code: code })).toMatchObject({
      data: { status: 'joined' },
    });
    expect(party.activeMembers('Guardia')).toEqual([ANA, BRUNO]);
  });

  it('sin isOpen Party está abierta para todos, como antes de B8', () => {
    const party = createFakePartyServer({ aliasOf: () => 'Ana' });
    expect(party.call('party_open', ANA, {})).toEqual({ data: true });
    expect(party.call('party_create_group', ANA, { p_name: 'Guardia' })).toMatchObject({
      data: { status: 'created' },
    });
  });
});

describe('Party con miembros en Gratis en el doble de pruebas', () => {
  it('los duelos contra un rival en Gratis no cuentan para el tope, pero contra él sí hay tope', () => {
    const paid = new Set([ANA, BRUNO, CARLA]);
    const { party, groupId } = guardia(paid);
    paid.delete(BRUNO);
    const duel = (rival: string, question: string) =>
      party.call('party_create_duel', ANA, {
        p_group: groupId,
        p_opponent: rival,
        p_question_ids: [question],
      });
    for (let index = 0; index < 10; index += 1) {
      expect(duel(BRUNO, `PM-${index}`)).toMatchObject({ data: { status: 'created' } });
    }
    expect(duel(BRUNO, 'PM-10')).toEqual({ data: { status: 'limit' } });
    expect(duel(CARLA, 'PM-C')).toMatchObject({ data: { status: 'created' } });
    // Con Bruno de vuelta en un plan de pago sus duelos cuentan otra vez
    paid.add(BRUNO);
    expect(duel(CARLA, 'PM-C2')).toEqual({ data: { status: 'limit' } });
  });

  it('modera el miembro más antiguo con Party abierta mientras quien administra no la tenga', () => {
    const paid = new Set([ANA, BRUNO, CARLA]);
    const { party, groupId } = guardia(paid);
    const isOwner = (userId: string) =>
      (
        party.call('party_overview', userId, { p_week_start: '2026-10-12' }) as {
          data: { groups: { isOwner: boolean }[] };
        }
      ).data.groups[0]?.isOwner;
    expect(isOwner(ANA)).toBe(true);
    expect(party.call('party_rotate_code', BRUNO, { p_group: groupId })).toMatchObject({
      error: { code: 'PT005' },
    });

    // Ana y Bruno pasan a Gratis. Modera Carla, la más antigua con Party abierta
    paid.delete(ANA);
    paid.delete(BRUNO);
    expect(isOwner(CARLA)).toBe(true);
    expect(party.call('party_rotate_code', CARLA, { p_group: groupId })).toMatchObject({
      data: { status: 'rotated' },
    });
    expect(party.call('party_remove_member', CARLA, { p_group: groupId, p_member: BRUNO })).toEqual(
      { data: true },
    );
    expect(party.ownerOf('Guardia')).toBe(ANA);

    // Ana vuelve a pagar y modera otra vez
    paid.add(ANA);
    expect(isOwner(ANA)).toBe(true);
    expect(isOwner(CARLA)).toBe(false);
    expect(party.call('party_rotate_code', CARLA, { p_group: groupId })).toMatchObject({
      error: { code: 'PT005' },
    });
  });
});
