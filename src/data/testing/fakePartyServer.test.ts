// El doble de Party de las pruebas cierra Party como la base en el plan Gratis (B8 del plan del
// cambio, 20261021000001_free_plan_locks.sql). Lo usan las pruebas unitarias y el Supabase simulado de
// las e2e, así que tiene que contestar igual que party_open y party_caller.
import { describe, expect, it } from 'vitest';
import { createFakePartyServer } from './fakePartyServer';

const ANA = '2f6c4b1e-8a3d-4c7e-9b10-6d2e5f7a8b01';
const BRUNO = '7a1d3c5e-2b4f-4a6c-8e9d-0f1a2b3c4d5e';

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
