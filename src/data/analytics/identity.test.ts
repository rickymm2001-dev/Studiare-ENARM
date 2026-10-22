// El identificador seudónimo y el aviso del permiso al servidor (B15, 1.3)
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsIdentitySchema } from '@/data/cloud/engagementContracts';
import { fetchAnalyticsIdentity, readIdentity, sendAnalyticsConsent } from './identity';

const ID = '2f5b0c38-6a52-4a1f-9d57-3c7a9d1f0b11';

describe('readIdentity', () => {
  // Lo que se acepta es lo mismo que acepta el esquema de los contratos, que no va en el JavaScript inicial
  const samples: unknown[] = [
    { analyticsId: ID, consent: true },
    { analyticsId: ID, consent: false },
    { analyticsId: ID, consent: true, extra: 'se quita' },
    { analyticsId: ID.toUpperCase(), consent: true },
    { analyticsId: 'no-es-uuid', consent: true },
    { analyticsId: ID },
    { consent: true },
    { analyticsId: ID, consent: 'true' },
    { analyticsId: 7, consent: true },
    { analyticsId: `${ID} `, consent: true },
    { analyticsId: ID.replace(/-/g, ''), consent: true },
    [],
    null,
    undefined,
    'texto',
    42,
  ];
  for (const [index, sample] of samples.entries()) {
    it(`coincide con el esquema del contrato en la muestra ${String(index + 1)}`, () => {
      const parsed = AnalyticsIdentitySchema.safeParse(sample);
      expect(readIdentity(sample)).toEqual(parsed.success ? parsed.data : null);
    });
  }
});

describe('llamadas al servidor', () => {
  const reply = (data: unknown, error: unknown = null) =>
    ({ rpc: vi.fn(() => Promise.resolve({ data, error })) }) as never;

  it('pide el identificador con analytics_identity y sin argumentos', async () => {
    const cloud = reply({ analyticsId: ID, consent: false });
    await expect(fetchAnalyticsIdentity(cloud)).resolves.toEqual({
      analyticsId: ID,
      consent: false,
    });
    expect((cloud as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      'analytics_identity',
    );
  });

  it('avisa el permiso con set_analytics_consent y p_granted', async () => {
    const cloud = reply({ analyticsId: ID, consent: true });
    await expect(sendAnalyticsConsent(cloud, true)).resolves.toEqual({
      analyticsId: ID,
      consent: true,
    });
    expect((cloud as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      'set_analytics_consent',
      { p_granted: true },
    );
  });

  it('un error, una respuesta rara o una excepción dan null y nunca lanzan', async () => {
    await expect(fetchAnalyticsIdentity(reply(null, { code: '42883' }))).resolves.toBeNull();
    await expect(
      fetchAnalyticsIdentity(reply({ analyticsId: 'x', consent: true })),
    ).resolves.toBeNull();
    const throwing = { rpc: () => Promise.reject(new Error('sin red')) } as never;
    await expect(fetchAnalyticsIdentity(throwing)).resolves.toBeNull();
    await expect(sendAnalyticsConsent(throwing, false)).resolves.toBeNull();
  });
});
