import { describe, expect, it } from 'vitest';
import type { AppEvent } from '@/data/schemas/events';
import { UserSettingsSchema } from '@/data/schemas/people';
import {
  CONSENT_MATCH_WINDOW_MS,
  PROFILE_EVENT_TYPES,
  SYNCED_SETTING_KEYS,
  applySettingValues,
  isProfileEventType,
  isSyncedSettingKey,
  localValueOf,
  planBaseline,
  planProfile,
  replayProfile,
  type LocalProfile,
} from './profileReplay';

const USER = '01J0000000000000000000USER';
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Un ULID válido y fijo a partir de un número, para armar eventos que se ordenan por su id */
function idOf(n: number): string {
  let rest = n;
  let out = '';
  for (let index = 0; index < 24; index += 1) {
    out = (CROCKFORD[rest % 32] as string) + out;
    rest = Math.floor(rest / 32);
  }
  return `01${out}`;
}

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 15, 12, 0, seconds)).toISOString();

function setting(id: number, seconds: number, key: string, value: unknown): AppEvent {
  return {
    id: idOf(id),
    type: 'settings_changed',
    userId: USER,
    at: at(seconds),
    tz: 'America/Merida',
    schemaVersion: 1,
    sessionId: null,
    payload: { key, value: value as never },
  };
}

function consent(
  id: number,
  seconds: number,
  purpose: 'party' | 'ai_analysis' | 'anonymized_improvement',
  status: 'granted' | 'revoked',
  noticeVersion = '2026-10-15b',
): AppEvent {
  return {
    id: idOf(id),
    type: 'consent_changed',
    userId: USER,
    at: at(seconds),
    tz: 'America/Merida',
    schemaVersion: 1,
    sessionId: null,
    payload: { purpose, status, noticeVersion },
  };
}

function score(id: number, seconds: number, year = 2026): AppEvent {
  return {
    id: idOf(id),
    type: 'official_score_submitted',
    userId: USER,
    at: at(seconds),
    tz: 'America/Merida',
    schemaVersion: 1,
    sessionId: null,
    payload: { year },
  };
}

const factoryLocal = (overrides: Partial<LocalProfile> = {}): LocalProfile => ({
  settings: UserSettingsSchema.parse({}),
  examDate: null,
  dailyMinutes: null,
  consents: [],
  officialScoreSubmittedAt: null,
  ...overrides,
});

describe('qué claves viajan', () => {
  it('son las de los ajustes, la fecha del ENARM y los minutos al día, sin el alias', () => {
    expect(SYNCED_SETTING_KEYS).toContain('settings.desiredRetention');
    expect(SYNCED_SETTING_KEYS).toContain('settings.followedDecks');
    expect(SYNCED_SETTING_KEYS).toContain('examDate');
    expect(SYNCED_SETTING_KEYS).toContain('dailyMinutes');
    expect(isSyncedSettingKey('alias')).toBe(false);
    expect(isSyncedSettingKey('settings.noExiste')).toBe(false);
    expect(isSyncedSettingKey('toString')).toBe(false);
    expect(Object.keys(UserSettingsSchema.shape)).toHaveLength(SYNCED_SETTING_KEYS.length - 2);
  });

  it('los tres tipos de evento que rearman el perfil', () => {
    expect([...PROFILE_EVENT_TYPES]).toEqual([
      'settings_changed',
      'consent_changed',
      'official_score_submitted',
    ]);
    expect(isProfileEventType('settings_changed')).toBe(true);
    expect(isProfileEventType('card_reviewed')).toBe(false);
  });
});

describe('ajustes desde la bitácora', () => {
  it('gana el evento más reciente de cada clave', () => {
    const replay = replayProfile([
      setting(1, 10, 'settings.newCardsPerDay', 30),
      setting(2, 30, 'settings.newCardsPerDay', 15),
      setting(3, 20, 'settings.newCardsPerDay', 40),
      setting(4, 5, 'settings.reviewsPerDay', 100),
    ]);
    expect(replay.settings['settings.newCardsPerDay']).toMatchObject({
      value: 15,
      eventId: idOf(2),
    });
    expect(replay.settings['settings.reviewsPerDay']).toMatchObject({ value: 100 });
  });

  it('con la misma hora gana el evento de id mayor, sin importar el orden', () => {
    const low = setting(5, 10, 'settings.optionsShown', 5);
    const high = setting(9, 10, 'settings.optionsShown', 6);
    expect(replayProfile([low, high]).settings['settings.optionsShown']?.value).toBe(6);
    expect(replayProfile([high, low]).settings['settings.optionsShown']?.value).toBe(6);
  });

  it('un valor que no cumple el campo se ignora y gana el anterior válido', () => {
    const replay = replayProfile([
      setting(1, 10, 'settings.desiredRetention', 0.85),
      // Fuera del rango 0.80 a 0.97
      setting(2, 20, 'settings.desiredRetention', 0.5),
      // Con otro tipo
      setting(3, 30, 'settings.desiredRetention', 'alto'),
      setting(4, 40, 'settings.desiredRetention', null),
    ]);
    expect(replay.settings['settings.desiredRetention']).toMatchObject({
      value: 0.85,
      eventId: idOf(1),
    });
  });

  it('si ningún valor es válido no hay ajuste, pero la clave cuenta como con evento', () => {
    const replay = replayProfile([setting(1, 10, 'settings.optionsShown', 99)]);
    expect(replay.settings['settings.optionsShown']).toBeUndefined();
    expect(replay.keysWithEvents).toEqual(['settings.optionsShown']);
  });

  it('ignora el alias y las claves que esta versión no conoce', () => {
    const replay = replayProfile([
      setting(1, 10, 'alias', 'Otro'),
      setting(2, 20, 'settings.futuro', true),
      setting(3, 30, 'constructor', 1),
    ]);
    expect(replay.settings).toEqual({});
    expect(replay.keysWithEvents).toEqual([]);
  });

  it('acepta null en la fecha del ENARM y en los minutos al día, y valida su forma', () => {
    const replay = replayProfile([
      setting(1, 10, 'examDate', '2027-09-13'),
      setting(2, 20, 'examDate', null),
      setting(3, 30, 'dailyMinutes', 90),
      setting(4, 40, 'dailyMinutes', 2),
      setting(5, 50, 'examDate', 'mañana'),
    ]);
    expect(replay.settings.examDate?.value).toBeNull();
    expect(replay.settings.dailyMinutes?.value).toBe(90);
  });

  it('el valor queda normalizado con el esquema del campo', () => {
    const replay = replayProfile([
      setting(1, 10, 'settings.spacing', { hard: 1, good: 1.5, easy: 2 }),
      setting(2, 20, 'settings.dailyGoal', { metric: 'questions', value: 12 }),
      // Con una llave de más, que el esquema estricto no acepta
      setting(3, 30, 'settings.cardTimer', { enabled: true, seconds: 30, autoReveal: false, x: 1 }),
    ]);
    expect(replay.settings['settings.spacing']?.value).toEqual({ hard: 1, good: 1.5, easy: 2 });
    expect(replay.settings['settings.dailyGoal']?.value).toEqual({
      metric: 'questions',
      value: 12,
    });
    expect(replay.settings['settings.cardTimer']).toBeUndefined();
  });

  it('un evento repetido cuenta una sola vez y la lista vacía no afirma nada', () => {
    const event = setting(1, 10, 'settings.reviewsPerDay', 80);
    expect(
      replayProfile([event, event, { ...event }]).settings['settings.reviewsPerDay']?.value,
    ).toBe(80);
    const empty = replayProfile([]);
    expect(empty.settings).toEqual({});
    expect(empty.decisions).toEqual([]);
    expect(empty.current).toEqual({
      party: false,
      ai_analysis: false,
      anonymized_improvement: false,
    });
    expect(empty.officialScore).toBeNull();
    expect(empty.lastScoreRevocationAt).toBeNull();
  });
});

describe('permisos desde la bitácora', () => {
  it('una decisión por evento, de la más antigua a la más reciente, y vale la última', () => {
    const replay = replayProfile([
      consent(3, 30, 'party', 'revoked'),
      consent(1, 10, 'party', 'granted'),
      consent(2, 20, 'ai_analysis', 'granted'),
    ]);
    expect(replay.decisions.map((decision) => decision.id)).toEqual([idOf(1), idOf(2), idOf(3)]);
    expect(replay.decisions[0]).toEqual({
      id: idOf(1),
      purpose: 'party',
      status: 'granted',
      noticeVersion: '2026-10-15b',
      decidedAt: at(10),
    });
    expect(replay.current).toEqual({
      party: false,
      ai_analysis: true,
      anonymized_improvement: false,
    });
  });

  it('con la misma hora gana el id mayor', () => {
    const replay = replayProfile([
      consent(8, 10, 'party', 'revoked'),
      consent(4, 10, 'party', 'granted'),
    ]);
    expect(replay.current.party).toBe(false);
  });
});

describe('puntaje oficial desde la bitácora', () => {
  it('vale la última captura y solo viaja su año', () => {
    const replay = replayProfile([score(1, 10, 2025), score(2, 20, 2026)]);
    expect(replay.officialScore).toEqual({ year: 2026, eventId: idOf(2), at: at(20) });
  });

  it('retirar el permiso de mejora deja sin vigencia las capturas anteriores', () => {
    const replay = replayProfile([
      consent(1, 5, 'anonymized_improvement', 'granted'),
      score(2, 10),
      consent(3, 20, 'anonymized_improvement', 'revoked'),
    ]);
    expect(replay.officialScore).toBeNull();
    expect(replay.lastScoreRevocationAt).toBe(at(20));
  });

  it('darlo otra vez no revive la captura de antes, pero una captura nueva sí vale', () => {
    const base = [
      consent(1, 5, 'anonymized_improvement', 'granted'),
      score(2, 10, 2025),
      consent(3, 20, 'anonymized_improvement', 'revoked'),
      consent(4, 30, 'anonymized_improvement', 'granted'),
    ];
    expect(replayProfile(base).officialScore).toBeNull();
    expect(replayProfile([...base, score(5, 40, 2026)]).officialScore).toMatchObject({
      year: 2026,
      eventId: idOf(5),
    });
  });

  it('retirar otro permiso no toca el puntaje', () => {
    const replay = replayProfile([score(1, 10), consent(2, 20, 'party', 'revoked')]);
    expect(replay.officialScore).not.toBeNull();
    expect(replay.lastScoreRevocationAt).toBeNull();
  });
});

describe('qué cambiar en este dispositivo', () => {
  it('solo cambia lo que difiere y deja intacto lo que la bitácora no menciona', () => {
    const replay = replayProfile([
      setting(1, 10, 'settings.newCardsPerDay', 35),
      setting(2, 20, 'settings.reviewsPerDay', 200),
      setting(3, 30, 'examDate', '2027-09-13'),
    ]);
    const local = factoryLocal({
      settings: UserSettingsSchema.parse({ optionsShown: 6 }),
    });
    const plan = planProfile(replay, local);
    expect(plan.settingChanges).toEqual([
      { key: 'examDate', from: null, to: '2027-09-13' },
      { key: 'settings.newCardsPerDay', from: 20, to: 35 },
    ]);
    const next = applySettingValues(
      local,
      plan.settingChanges.map((change) => ({ key: change.key, value: change.to })),
    );
    expect(next.settings.newCardsPerDay).toBe(35);
    // Lo que no tiene evento se queda
    expect(next.settings.optionsShown).toBe(6);
    expect(next.examDate).toBe('2027-09-13');
  });

  it('un valor igual con las llaves en otro orden no cuenta como cambio', () => {
    const replay = replayProfile([
      setting(1, 10, 'settings.dailyGoal', { value: 20, metric: 'cards' }),
    ]);
    expect(planProfile(replay, factoryLocal()).settingChanges).toEqual([]);
  });

  it('agrega una fila de permiso por cada evento que este dispositivo no tiene', () => {
    const replay = replayProfile([
      consent(1, 10, 'party', 'granted'),
      consent(2, 20, 'anonymized_improvement', 'granted'),
    ]);
    const plan = planProfile(replay, factoryLocal());
    expect(plan.consentRows.map((row) => row.id)).toEqual([idOf(1), idOf(2)]);
    // Repetirlo con las filas ya guardadas no agrega nada
    const stored = plan.consentRows.map((row) => ({ ...row }));
    expect(planProfile(replay, factoryLocal({ consents: stored })).consentRows).toEqual([]);
  });

  it('reconoce la fila de antes que cuenta la misma decisión con otro id y no la duplica', () => {
    const replay = replayProfile([consent(1, 10, 'party', 'granted')]);
    const legacy = {
      id: idOf(777),
      purpose: 'party' as const,
      status: 'granted' as const,
      noticeVersion: '2026-10-15b',
      decidedAt: new Date(Date.parse(at(10)) - 40).toISOString(),
    };
    expect(planProfile(replay, factoryLocal({ consents: [legacy] })).consentRows).toEqual([]);
    // Otra decisión, otra versión del aviso o una hora lejana no es la misma
    for (const other of [
      { ...legacy, purpose: 'ai_analysis' as const },
      { ...legacy, status: 'revoked' as const },
      { ...legacy, noticeVersion: '2026-09-01' },
      {
        ...legacy,
        decidedAt: new Date(Date.parse(at(10)) - CONSENT_MATCH_WINDOW_MS - 1).toISOString(),
      },
    ]) {
      expect(planProfile(replay, factoryLocal({ consents: [other] })).consentRows).toHaveLength(1);
    }
  });

  it('una fila de antes cuenta una sola decisión', () => {
    const replay = replayProfile([
      consent(1, 10, 'party', 'granted'),
      consent(2, 11, 'party', 'granted'),
    ]);
    const legacy = {
      id: idOf(777),
      purpose: 'party' as const,
      status: 'granted' as const,
      noticeVersion: '2026-10-15b',
      decidedAt: at(10),
    };
    const plan = planProfile(replay, factoryLocal({ consents: [legacy] }));
    expect(plan.consentRows.map((row) => row.id)).toEqual([idOf(2)]);
  });

  it('borra el puntaje de este dispositivo si el permiso se retiró después de capturarlo', () => {
    const replay = replayProfile([consent(1, 20, 'anonymized_improvement', 'revoked')]);
    expect(
      planProfile(replay, factoryLocal({ officialScoreSubmittedAt: at(10) })).removeOfficialScore,
    ).toBe(true);
    expect(
      planProfile(replay, factoryLocal({ officialScoreSubmittedAt: at(20) })).removeOfficialScore,
    ).toBe(true);
    // Una captura posterior al retiro se queda, y sin puntaje no hay nada que borrar
    expect(
      planProfile(replay, factoryLocal({ officialScoreSubmittedAt: at(30) })).removeOfficialScore,
    ).toBe(false);
    expect(planProfile(replay, factoryLocal()).removeOfficialScore).toBe(false);
    // Sin ningún retiro en la bitácora nunca se borra, aunque no haya evento de la captura
    expect(
      planProfile(replayProfile([]), factoryLocal({ officialScoreSubmittedAt: at(10) }))
        .removeOfficialScore,
    ).toBe(false);
  });
});

describe('línea base de los ajustes que nacieron sin evento', () => {
  it('solo registra lo distinto de fábrica que no tiene ningún evento', () => {
    const local = factoryLocal({
      settings: UserSettingsSchema.parse({
        dailyGoal: { metric: 'questions', value: 30 },
        newCardsPerDay: 35,
        optionsShown: 5,
      }),
      examDate: '2027-09-13',
    });
    // optionsShown ya tiene un evento, aunque su valor no sirva, y no se pisa
    const replay = replayProfile([setting(1, 10, 'settings.newCardsPerDay', 50)]);
    const created = planBaseline(
      { ...replay, keysWithEvents: [...replay.keysWithEvents, 'settings.optionsShown'] },
      local,
    );
    expect(created).toEqual([
      { key: 'examDate', value: '2027-09-13' },
      { key: 'settings.dailyGoal', value: { metric: 'questions', value: 30 } },
    ]);
  });

  it('un dispositivo de fábrica no registra nada', () => {
    expect(planBaseline(replayProfile([]), factoryLocal())).toEqual([]);
  });
});

describe('leer y poner valores', () => {
  it('localValueOf lee la fecha, los minutos y cada ajuste, y no conoce otras claves', () => {
    const local = factoryLocal({ examDate: '2027-09-13', dailyMinutes: 75 });
    expect(localValueOf(local, 'examDate')).toBe('2027-09-13');
    expect(localValueOf(local, 'dailyMinutes')).toBe(75);
    expect(localValueOf(local, 'settings.reviewsPerDay')).toBe(200);
    expect(localValueOf(local, 'alias')).toBeUndefined();
  });

  it('applySettingValues no aplica un conjunto de ajustes que dejaría de cumplir el esquema', () => {
    const local = factoryLocal();
    const next = applySettingValues(local, [{ key: 'settings.optionsShown', value: 99 }]);
    expect(next.settings).toEqual(local.settings);
  });
});
