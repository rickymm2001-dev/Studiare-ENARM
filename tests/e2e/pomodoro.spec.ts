// Pomodoro en Repasar (9.2, D-062, D-063). Con enfoque y descanso corto de un minuto, el bloque se
// inicia, se pausa, se salta y el descanso termina solo cuando el reloj avanza, con su aviso en la
// página. Cada paso queda en la bitácora como evento. Con el permiso de notificaciones negado, el
// ajuste se apaga solo, lo demás se guarda y el aviso dentro de la página sigue funcionando. Sus
// ajustes viven en Ajustes del repaso, en Repasar (B3 del plan del cambio).
import type { Locator, Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { followSmallestDeck, readTable } from './support/b1';
import {
  expect,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  signUp,
  test,
} from './support/fixtures';

const MINUTE_MS = 60_000;

interface PomodoroEvent {
  type: string;
  payload: { phase?: string; plannedMinutes?: number };
}

/** La parte del Pomodoro en Ajustes del repaso, que se abre con ?ajustes en Repasar */
const pomodoroSettings = (page: Page) =>
  page
    .getByRole('dialog', { name: t.settingsPage.reviewSettings.title })
    .getByRole('region', { name: t.settings.pomodoroTitle });

/** Deja enfoque y descanso corto de un minuto, lo mínimo que acepta el ajuste */
async function setShortPomodoro(page: Page, extra?: (settings: Locator) => Promise<void>) {
  await page.goto(`${SCREENS.review.path}?ajustes=1`);
  const settings = pomodoroSettings(page);
  await settings.getByLabel(t.pomodoro.focusMinutes).fill('1');
  await settings.getByLabel(t.pomodoro.shortBreakMinutes).fill('1');
  if (extra) await extra(settings);
  await settings.getByRole('button', { name: t.settings.saveChanges }).click();
  return settings;
}

async function startReviewSession(page: Page) {
  await page.goto(SCREENS.review.path);
  await page.getByRole('button', { name: /^Repasar [\d,]+ tarjetas?$/ }).click();
  await expect(page.getByRole('button', { name: t.review.show })).toBeVisible();
}

/** Abre la píldora del Pomodoro, que empieza minimizada como un ícono hasta que el alumno la abre */
async function openPomodoro(page: Page): Promise<Locator> {
  await page
    .getByRole('button', { name: t.pomodoro.show('01:00', t.pomodoro.phases.focus) })
    .click();
  const pill = page.getByRole('group', { name: t.pomodoro.label });
  await expect(pill).toBeVisible();
  return pill;
}

/** Los eventos del Pomodoro en el orden en que se guardaron, con su fase y sus minutos planeados */
async function pomodoroEvents(page: Page) {
  const events = await readTable<PomodoroEvent>(page, 'events');
  return events
    .filter((event) => event.type.startsWith('pomodoro_'))
    .map((event) => [event.type, event.payload.phase, event.payload.plannedMinutes]);
}

/** El aviso de fin de fase que aparece en la página */
const phaseNotice = (page: Page, phase: string) =>
  page.getByRole('status').filter({ hasText: t.pomodoro.finished(phase) });

test('un bloque corto se inicia, se pausa, se salta y el descanso termina solo, y cada paso queda en la bitácora', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);
  await followSmallestDeck(page);
  const settings = await setShortPomodoro(page);
  await expect(settings.getByText(t.pomodoro.saved)).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await startReviewSession(page);
  await expectNoSeriousA11yViolations(page);
  const pill = await openPomodoro(page);
  // Abierta, con el reloj y sus botones, el encabezado de la sesión se parte en dos renglones en el
  // teléfono en lugar de salirse de la pantalla (hallazgo H24 de B1)
  await expectNoHorizontalOverflow(page);

  // Iniciar y pausar. En pausa el botón ofrece continuar y al continuar vuelve a ofrecer pausar
  await pill.getByRole('button', { name: t.pomodoro.start }).click();
  await expect(pill.getByRole('button', { name: t.pomodoro.pause })).toBeVisible();
  await pill.getByRole('button', { name: t.pomodoro.pause }).click();
  await expect(pill.getByRole('button', { name: t.pomodoro.resume })).toBeVisible();
  await pill.getByRole('button', { name: t.pomodoro.resume }).click();
  await expect(pill.getByRole('button', { name: t.pomodoro.pause })).toBeVisible();

  // Saltar interrumpe el enfoque y deja listo el descanso corto, sin arrancarlo
  await pill.getByRole('button', { name: t.pomodoro.skip }).click();
  await expect(pill.getByText(t.pomodoro.phases.short_break, { exact: true })).toBeVisible();
  await expect(pill.getByRole('button', { name: t.pomodoro.start })).toBeVisible();

  // El descanso corre y, con el reloj un minuto adelante, termina solo con su aviso. El reloj fijo
  // solo mueve la fecha, los temporizadores siguen
  await pill.getByRole('button', { name: t.pomodoro.start }).click();
  await expect(pill.getByRole('button', { name: t.pomodoro.pause })).toBeVisible();
  await page.clock.setFixedTime(new Date(Date.now() + MINUTE_MS + 5_000));
  const notice = phaseNotice(page, t.pomodoro.phases.short_break);
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(t.pomodoro.next(t.pomodoro.phases.focus));
  await expect(notice.getByRole('button', { name: t.pomodoro.startFocus })).toBeVisible();
  await expect(pill.getByText(t.pomodoro.phases.focus, { exact: true })).toBeVisible();
  await expect(pill.getByRole('button', { name: t.pomodoro.start })).toBeVisible();
  // Minimizada, el ícono dice cuánto queda de la fase que sigue y el aviso se queda
  await pill.getByRole('button', { name: t.pomodoro.minimize }).click();
  await expect(
    page.getByRole('button', { name: t.pomodoro.show('01:00', t.pomodoro.phases.focus) }),
  ).toBeVisible();
  await expect(notice).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await notice.getByRole('button', { name: t.pomodoro.dismiss }).click();
  await expect(notice).toHaveCount(0);
  // El repaso sigue donde estaba
  await expect(page.getByRole('button', { name: t.review.show })).toBeVisible();

  // Cada paso quedó en la bitácora, con su fase y el minuto planeado
  expect(await pomodoroEvents(page)).toEqual([
    ['pomodoro_started', 'focus', 1],
    ['pomodoro_interrupted', 'focus', 1],
    ['pomodoro_started', 'short_break', 1],
    ['pomodoro_completed', 'short_break', 1],
  ]);
});

test('con el permiso de notificaciones negado el ajuste se apaga solo, lo demás se guarda y el aviso en la página sigue', async ({
  page,
}) => {
  test.setTimeout(180_000);
  // El navegador niega las notificaciones, como cuando la persona ya dijo que no
  await page.addInitScript(() => {
    // Mismas propiedades que usa la app. Construir una notificación nunca debe pasar con el permiso negado
    const denied = Object.assign(
      function Notification() {
        throw new Error('Notificaciones negadas');
      },
      { permission: 'denied', requestPermission: () => Promise.resolve('denied') },
    );
    Object.defineProperty(window, 'Notification', {
      value: denied,
      configurable: true,
      writable: true,
    });
  });
  await signUp(page);
  await followSmallestDeck(page);

  const settings = await setShortPomodoro(page, async (form) => {
    await form.getByRole('checkbox', { name: t.pomodoro.notifications }).check();
  });
  await expect(settings.getByText(t.pomodoro.notificationsDenied)).toBeVisible();
  await expect(
    settings.getByRole('checkbox', { name: t.pomodoro.notifications }),
  ).not.toBeChecked();
  await expectNoSeriousA11yViolations(page);

  // Lo demás sí quedó guardado y la notificación sigue apagada. La dirección conserva el panel abierto
  await page.reload();
  const reloaded = pomodoroSettings(page);
  await expect(reloaded.getByLabel(t.pomodoro.focusMinutes)).toHaveValue('1');
  await expect(
    reloaded.getByRole('checkbox', { name: t.pomodoro.notifications }),
  ).not.toBeChecked();

  // Un enfoque completo avisa dentro de la página, ofrece el descanso y nada se rompe
  await startReviewSession(page);
  const pill = await openPomodoro(page);
  await pill.getByRole('button', { name: t.pomodoro.start }).click();
  await expect(pill.getByRole('button', { name: t.pomodoro.pause })).toBeVisible();
  await page.clock.setFixedTime(new Date(Date.now() + MINUTE_MS + 5_000));
  const notice = phaseNotice(page, t.pomodoro.phases.focus);
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('button', { name: t.pomodoro.startBreak })).toBeVisible();
  expect(await pomodoroEvents(page)).toEqual([
    ['pomodoro_started', 'focus', 1],
    ['pomodoro_completed', 'focus', 1],
  ]);
});
