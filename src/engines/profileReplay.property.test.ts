// Propiedades del rearmado del perfil (B14, 2.2 del plan), con fast-check
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ConsentPurposeSchema } from '@/data/schemas/common';
import type { AppEvent } from '@/data/schemas/events';
import { UserSettingsSchema } from '@/data/schemas/people';
import {
  SYNCED_SETTING_KEYS,
  applySettingValues,
  localValueOf,
  planProfile,
  replayProfile,
  type ConsentRow,
  type LocalProfile,
} from './profileReplay';

const USER = '01J0000000000000000000USER';
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function idOf(n: number): string {
  let rest = n;
  let out = '';
  for (let index = 0; index < 24; index += 1) {
    out = (CROCKFORD[rest % 32] as string) + out;
    rest = Math.floor(rest / 32);
  }
  return `01${out}`;
}

const at = (seconds: number) =>
  new Date(Date.UTC(2026, 9, 15, 12, 0, 0) + seconds * 1000).toISOString();
const envelope = { userId: USER, tz: 'America/Merida', schemaVersion: 1 as const, sessionId: null };

/** Valores que unas veces cumplen el campo y otras no, para probar que los inválidos se ignoran */
const valueFor: Record<string, fc.Arbitrary<unknown>> = {
  'settings.desiredRetention': fc.oneof(
    fc.double({ min: 0.8, max: 0.97, noNaN: true }),
    fc.constant(2),
    fc.constant('x'),
  ),
  'settings.newCardsPerDay': fc.oneof(
    fc.integer({ min: 0, max: 500 }),
    fc.constant(-3),
    fc.constant(null),
  ),
  'settings.optionsShown': fc.oneof(fc.integer({ min: 2, max: 10 }), fc.constant(99)),
  'settings.followedDecks': fc.oneof(
    fc.array(fc.constantFrom('cardio', 'pediatria', 'cirugia'), { maxLength: 3 }),
    fc.constant('cardio'),
  ),
  'settings.cardConfidenceStep': fc.oneof(fc.boolean(), fc.constant(1)),
  examDate: fc.oneof(fc.constantFrom('2027-09-13', '2027-09-14', null), fc.constant('pronto')),
  dailyMinutes: fc.oneof(fc.integer({ min: 5, max: 720 }), fc.constant(1), fc.constant(null)),
  alias: fc.string({ maxLength: 8 }),
};
const SETTING_KEYS = Object.keys(valueFor);

const settingEvent = fc
  .record({
    n: fc.integer({ min: 1, max: 5000 }),
    seconds: fc.integer({ min: 0, max: 30 }),
    key: fc.constantFrom(...SETTING_KEYS),
  })
  .chain(({ n, seconds, key }) =>
    (valueFor[key] as fc.Arbitrary<unknown>).map((value): AppEvent => ({
      ...envelope,
      id: idOf(n),
      type: 'settings_changed',
      at: at(seconds),
      payload: { key, value: value as never },
    })),
  );

const consentEvent = fc
  .record({
    n: fc.integer({ min: 5001, max: 9000 }),
    seconds: fc.integer({ min: 0, max: 30 }),
    // Todas las finalidades del esquema, así una nueva entra sola a la propiedad (B15)
    purpose: fc.constantFrom(...ConsentPurposeSchema.options),
    status: fc.constantFrom('granted' as const, 'revoked' as const),
    noticeVersion: fc.constantFrom('2026-09-01', '2026-10-15b'),
  })
  .map(({ n, seconds, purpose, status, noticeVersion }): AppEvent => ({
    ...envelope,
    id: idOf(n),
    type: 'consent_changed',
    at: at(seconds),
    payload: { purpose, status, noticeVersion },
  }));

const scoreEvent = fc
  .record({ n: fc.integer({ min: 9001, max: 12000 }), seconds: fc.integer({ min: 0, max: 30 }) })
  .map(({ n, seconds }): AppEvent => ({
    ...envelope,
    id: idOf(n),
    type: 'official_score_submitted',
    at: at(seconds),
    payload: { year: 2026 },
  }));

/** Eventos con ids distintos, como los de una bitácora real */
const events = fc
  .array(fc.oneof(settingEvent, consentEvent, scoreEvent), { maxLength: 40 })
  .map((list) => [...new Map(list.map((event) => [event.id, event])).values()]);

const factoryLocal = (overrides: Partial<LocalProfile> = {}): LocalProfile => ({
  settings: UserSettingsSchema.parse({}),
  examDate: null,
  dailyMinutes: null,
  consents: [],
  officialScoreSubmittedAt: null,
  ...overrides,
});

/** Lo local que hay después de aplicar un plan */
function applied(local: LocalProfile, replay: ReturnType<typeof replayProfile>): LocalProfile {
  const plan = planProfile(replay, local);
  const next = applySettingValues(
    local,
    plan.settingChanges.map((change) => ({ key: change.key, value: change.to })),
  );
  const rows: ConsentRow[] = [...local.consents, ...plan.consentRows.map((row) => ({ ...row }))];
  return {
    ...next,
    consents: rows,
    officialScoreSubmittedAt: plan.removeOfficialScore ? null : local.officialScoreSubmittedAt,
  };
}

const shuffled = (list: readonly AppEvent[], seed: number): AppEvent[] =>
  [...list]
    .map((event, index) => ({ event, sort: Math.sin(seed * 9301 + index * 49297) }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ event }) => event);

describe('propiedades del rearmado del perfil', () => {
  it('cualquier orden de los mismos eventos, también con repetidos, da el mismo resultado', () => {
    fc.assert(
      fc.property(events, fc.integer({ min: 1, max: 1000 }), (list, seed) => {
        const expected = replayProfile(list);
        expect(replayProfile(shuffled(list, seed))).toEqual(expected);
        expect(replayProfile([...shuffled(list, seed + 1), ...list])).toEqual(expected);
      }),
      { numRuns: 300 },
    );
  });

  it('el valor vigente de cada clave siempre cumple el campo de su esquema y es de un evento de esa clave', () => {
    fc.assert(
      fc.property(events, (list) => {
        const replay = replayProfile(list);
        for (const winner of Object.values(replay.settings)) {
          expect(SYNCED_SETTING_KEYS).toContain(winner.key);
          const source = list.find((event) => event.id === winner.eventId);
          expect(source?.type).toBe('settings_changed');
          expect(source?.type === 'settings_changed' ? source.payload.key : '').toBe(winner.key);
        }
        const applied = applySettingValues(
          factoryLocal(),
          Object.values(replay.settings).map((winner) => ({
            key: winner.key,
            value: winner.value,
          })),
        );
        // El conjunto completo sigue siendo un conjunto de ajustes válido
        expect(UserSettingsSchema.safeParse(applied.settings).success).toBe(true);
        expect(alias(replay)).toBe(false);
      }),
      { numRuns: 300 },
    );
  });

  it('dos dispositivos con la misma bitácora terminan con lo mismo, partan de donde partan', () => {
    const start = fc.record({
      newCardsPerDay: fc.integer({ min: 0, max: 500 }),
      optionsShown: fc.integer({ min: 2, max: 10 }),
      examDate: fc.constantFrom('2027-09-13', null),
      dailyMinutes: fc.constantFrom(30, 90, null),
    });
    fc.assert(
      fc.property(events, start, start, (list, a, b) => {
        const replay = replayProfile(list);
        const device = (seed: typeof a): LocalProfile =>
          factoryLocal({
            settings: UserSettingsSchema.parse({
              newCardsPerDay: seed.newCardsPerDay,
              optionsShown: seed.optionsShown,
            }),
            examDate: seed.examDate,
            dailyMinutes: seed.dailyMinutes,
          });
        const first = applied(device(a), replay);
        const second = applied(device(b), replay);
        // Cada clave con un valor vigente en la bitácora queda igual en los dos
        for (const key of Object.keys(replay.settings)) {
          expect(localValueOf(first, key)).toEqual(localValueOf(second, key));
          expect(localValueOf(first, key)).toEqual(replay.settings[key]?.value);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('aplicar el plan una vez deja un plan vacío', () => {
    fc.assert(
      fc.property(events, (list) => {
        const replay = replayProfile(list);
        const once = applied(factoryLocal({ officialScoreSubmittedAt: at(15) }), replay);
        const again = planProfile(replay, once);
        expect(again.settingChanges).toEqual([]);
        expect(again.consentRows).toEqual([]);
        expect(again.removeOfficialScore).toBe(false);
      }),
      { numRuns: 300 },
    );
  });

  it('el permiso vigente de cada finalidad es el de su decisión más reciente', () => {
    fc.assert(
      fc.property(events, (list) => {
        const replay = replayProfile(list);
        for (const purpose of ConsentPurposeSchema.options) {
          const own = replay.decisions.filter((decision) => decision.purpose === purpose);
          expect(replay.current[purpose]).toBe(own.at(-1)?.status === 'granted');
        }
        // Las decisiones salen en orden de tiempo
        const times = replay.decisions.map((decision) => decision.decidedAt);
        expect([...times].sort()).toEqual(times);
      }),
      { numRuns: 300 },
    );
  });

  it('una captura de puntaje es vigente solo si es posterior al último retiro del permiso de mejora', () => {
    fc.assert(
      fc.property(events, (list) => {
        const replay = replayProfile(list);
        const revocations = list
          .filter(
            (event) =>
              event.type === 'consent_changed' &&
              event.payload.purpose === 'anonymized_improvement' &&
              event.payload.status === 'revoked',
          )
          .map((event) => event.at)
          .sort();
        expect(replay.lastScoreRevocationAt).toBe(revocations.at(-1) ?? null);
        const scores = list.filter((event) => event.type === 'official_score_submitted');
        const valid = scores.filter(
          (event) =>
            replay.lastScoreRevocationAt === null || event.at > replay.lastScoreRevocationAt,
        );
        expect(replay.officialScore === null).toBe(valid.length === 0);
        if (replay.officialScore) {
          expect(
            valid
              .map((event) => event.at)
              .sort()
              .at(-1),
          ).toBe(replay.officialScore.at);
        }
      }),
      { numRuns: 300 },
    );
  });
});

/** El alias nunca entra a lo vigente */
function alias(replay: ReturnType<typeof replayProfile>): boolean {
  return Object.hasOwn(replay.settings, 'alias');
}
