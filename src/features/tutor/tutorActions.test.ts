import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { UserSettingsSchema } from '@/data/schemas/people';
import { makeUser, testApi } from '@/data/testing/fixtures';
import { enableNegationHighlight, shortenPomodoro } from './tutorActions';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

function setup(settings: Parameters<typeof UserSettingsSchema.parse>[0] = {}) {
  const api = testApi('real');
  disposers.push(api.dispose);
  return { api, user: makeUser({ settings: UserSettingsSchema.parse(settings) }) };
}

describe('acciones del tutor', () => {
  it('enciende el resaltado de negaciones en práctica y en examen y lo guarda', async () => {
    const { api, user } = setup({ negationHighlightPractice: false, negationHighlightExam: false });
    const next = await enableNegationHighlight(api, user);
    expect(next.settings).toMatchObject({
      negationHighlightPractice: true,
      negationHighlightExam: true,
    });
    expect((await api.repos.users.get(user.id))?.settings.negationHighlightExam).toBe(true);
    const changed = (await api.repos.events.query({ userId: user.id })).filter(
      (event) => event.type === 'settings_changed',
    );
    expect(changed.length).toBeGreaterThan(0);
  });

  it('acorta el Pomodoro a 25 minutos de enfoque y 5 de descanso sin alargar lo que ya era corto', async () => {
    const long = setup({
      pomodoro: {
        focusMinutes: 50,
        shortBreakMinutes: 3,
        longBreakMinutes: 15,
        cyclesBeforeLong: 4,
        sound: true,
        notifications: false,
      },
    });
    const first = await shortenPomodoro(long.api, long.user);
    expect(first).toMatchObject({ focus: 25, rest: 5 });
    expect(first.user.settings.pomodoro).toMatchObject({ focusMinutes: 25, shortBreakMinutes: 5 });

    const short = setup({
      pomodoro: {
        focusMinutes: 20,
        shortBreakMinutes: 10,
        longBreakMinutes: 15,
        cyclesBeforeLong: 4,
        sound: false,
        notifications: false,
      },
    });
    const second = await shortenPomodoro(short.api, short.user);
    expect(second).toMatchObject({ focus: 20, rest: 10 });
    expect(second.user.settings.pomodoro.sound).toBe(false);
  });
});
