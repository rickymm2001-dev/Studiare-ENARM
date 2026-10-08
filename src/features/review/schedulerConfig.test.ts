import { describe, expect, it } from 'vitest';
import { NO_EASY_DAYS } from '@/engines/easyDays';
import { UserSettingsSchema } from '@/data/schemas/people';
import { makeUser } from '@/data/testing/fixtures';
import type { ReadySession } from '../shared/RequireSession';
import { schedulerConfig, UNLIMITED_NEW_CARDS_PER_DAY } from './schedulerConfig';

function sessionWith(settings: Parameters<typeof UserSettingsSchema.parse>[0]) {
  const user = makeUser({ settings: UserSettingsSchema.parse(settings) });
  return { user, settings: user.settings } as Pick<ReadySession, 'user' | 'settings'>;
}

describe('configuración del programador', () => {
  it('pasa los días fáciles del alumno al programador', () => {
    const config = schedulerConfig(sessionWith({ easyDays: { ...NO_EASY_DAYS, sun: 'minimum' } }));
    expect(config.easyDays).toMatchObject({ sun: 'minimum', mon: 'normal' });
  });

  it('con límite usa el número de nuevas del alumno', () => {
    expect(schedulerConfig(sessionWith({ newCardsPerDay: 12 })).thresholds.newCardsPerDay).toBe(12);
  });

  it('sin límite de nuevas usa un tope práctico y conserva el número guardado', () => {
    const session = sessionWith({ newCardsPerDay: 12, unlimitedNewCards: true });
    expect(schedulerConfig(session).thresholds.newCardsPerDay).toBe(UNLIMITED_NEW_CARDS_PER_DAY);
    expect(session.settings.newCardsPerDay).toBe(12);
  });
});
