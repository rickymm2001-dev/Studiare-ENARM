// Invitaciones del registro y conteos de cómo nos conocieron, del lado del admin (B9)
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  inviteEmail,
  listInvitations,
  normalizeInvitationEmail,
  readRegistrationOpen,
  revokeInvitation,
  setRegistrationOpen,
} from './invitations';
import { readSignupSourceCounts } from './signupSources';

type Reply = { data?: unknown; error: { code?: string; message?: string } | null } | 'throw';

/** Un cliente que anota cada llamada y responde lo que se le diga */
function stub(replies: Record<string, Reply>) {
  const calls: unknown[][] = [];
  const answer = (key: string) => {
    const reply = replies[key] ?? { data: null, error: null };
    return reply === 'throw'
      ? Promise.reject(new TypeError('Failed to fetch'))
      : Promise.resolve({ data: reply.data ?? null, error: reply.error });
  };
  const chain = (table: string) => {
    const builder = {
      insert: (row: unknown) => {
        calls.push([table, 'insert', row]);
        return answer(`${table}.insert`);
      },
      delete: () => ({
        eq: (column: string, value: unknown) => {
          calls.push([table, 'delete', column, value]);
          return answer(`${table}.delete`);
        },
      }),
      upsert: (row: unknown) => {
        calls.push([table, 'upsert', row]);
        return answer(`${table}.upsert`);
      },
      select: () => ({
        eq: (column: string, value: unknown) => ({
          maybeSingle: () => {
            calls.push([table, 'select', column, value]);
            return answer(`${table}.select`);
          },
        }),
      }),
    };
    return builder;
  };
  const cloud = {
    from: chain,
    rpc: (name: string) => {
      calls.push(['rpc', name]);
      return answer(name);
    },
  } as unknown as SupabaseClient;
  return { cloud, calls };
}

describe('invitaciones', () => {
  it('lista con quién ya creó su cuenta y traduce los rechazos', async () => {
    const ok = stub({
      admin_list_invitations: {
        data: [{ email: 'ana@x.mx', invited_at: '2026-10-13T09:00:00Z', registered: true }],
        error: null,
      },
    });
    expect(await listInvitations(ok.cloud)).toEqual({
      ok: true,
      invitations: [{ email: 'ana@x.mx', invitedAt: '2026-10-13T09:00:00Z', registered: true }],
    });
    for (const [error, reason] of [
      [{ code: '42501' }, 'not_admin'],
      [{ code: '28000' }, 'no_session'],
      [{ message: 'Failed to fetch' }, 'network'],
      [{ code: 'XX000' }, 'unknown'],
    ] as const) {
      expect(await listInvitations(stub({ admin_list_invitations: { error } }).cloud)).toEqual({
        ok: false,
        reason,
      });
    }
    expect(await listInvitations(stub({ admin_list_invitations: 'throw' }).cloud)).toEqual({
      ok: false,
      reason: 'network',
    });
  });

  it('invita el correo limpio y distingue uno repetido o inválido', async () => {
    expect(normalizeInvitationEmail('  Ana@X.MX ')).toBe('ana@x.mx');
    expect(normalizeInvitationEmail('sin-arroba')).toBeNull();
    const ok = stub({});
    expect(await inviteEmail(ok.cloud, '  Ana@X.MX ')).toEqual({ ok: true });
    expect(ok.calls).toEqual([['signup_invitations', 'insert', { email: 'ana@x.mx' }]]);
    expect(await inviteEmail(stub({}).cloud, 'nada')).toEqual({ ok: false, reason: 'invalid' });
    const duplicate = stub({ 'signup_invitations.insert': { error: { code: '23505' } } });
    expect(await inviteEmail(duplicate.cloud, 'ana@x.mx')).toEqual({
      ok: false,
      reason: 'duplicate',
    });
    const denied = stub({ 'signup_invitations.insert': { error: { code: '42501' } } });
    expect(await inviteEmail(denied.cloud, 'ana@x.mx')).toEqual({
      ok: false,
      reason: 'not_admin',
    });
  });

  it('quita una invitación por su correo', async () => {
    const ok = stub({});
    expect(await revokeInvitation(ok.cloud, 'ana@x.mx')).toEqual({ ok: true });
    expect(ok.calls).toEqual([['signup_invitations', 'delete', 'email', 'ana@x.mx']]);
  });

  it('el registro abierto es solo true en registration_open, y el admin lo cambia', async () => {
    const open = stub({ 'platform_settings.select': { data: { value: true }, error: null } });
    expect(await readRegistrationOpen(open.cloud)).toBe(true);
    const closed = stub({ 'platform_settings.select': { data: { value: 'true' }, error: null } });
    expect(await readRegistrationOpen(closed.cloud)).toBe(false);
    expect(await readRegistrationOpen(stub({}).cloud)).toBe(false);
    const failed = stub({ 'platform_settings.select': { error: { code: 'XX' } } });
    expect(await readRegistrationOpen(failed.cloud)).toBeNull();

    const change = stub({});
    expect(await setRegistrationOpen(change.cloud, true)).toBe(true);
    expect(change.calls[0]).toMatchObject([
      'platform_settings',
      'upsert',
      { key: 'registration_open', value: true },
    ]);
    const denied = stub({ 'platform_settings.upsert': { error: { code: '42501' } } });
    expect(await setRegistrationOpen(denied.cloud, false)).toBe(false);
  });
});

describe('cómo nos conocieron, en conteos', () => {
  it('lee los conteos por canal y por código, y nada más', async () => {
    const ok = stub({
      admin_signup_source_counts: { data: [{ channel: 'instagram', total: '3' }], error: null },
      admin_influencer_code_counts: { data: [{ code: 'ANA_2026', total: 2 }], error: null },
    });
    expect(await readSignupSourceCounts(ok.cloud)).toEqual({
      ok: true,
      counts: {
        channels: [{ channel: 'instagram', total: 3 }],
        codes: [{ code: 'ANA_2026', total: 2 }],
      },
    });
    const denied = stub({ admin_signup_source_counts: { error: { code: '42501' } } });
    expect(await readSignupSourceCounts(denied.cloud)).toEqual({
      ok: false,
      reason: 'not_admin',
    });
    const odd = stub({
      admin_signup_source_counts: { data: [{ channel: 'radio', total: 1 }], error: null },
      admin_influencer_code_counts: { data: [], error: null },
    });
    expect(await readSignupSourceCounts(odd.cloud)).toEqual({ ok: false, reason: 'unknown' });
  });
});
