// Recordatorios de repaso por correo (B15, paquete B, 3.2, 3.3, 3.6 y 3.7). La sección vive en Ajustes del
// repaso, tras la bandera emailReminders, y guarda en el servidor con set_reminder_prefs. La app además sube una
// foto de conteos de tarjetas vencidas (put_due_snapshot), porque el servidor no ve las tarjetas de los mazos
// precargados. El enlace del pie del correo lleva a una página pública que da de baja con un clic confirmado.
// El Supabase simulado (fakeEngagement.ts) hace de servidor: guarda lo que la app manda y atiende
// email-unsubscribe, y ningún correo sale de verdad
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { UNSUBSCRIBE_PAGE_PATH } from '@/data/cloud/engagementContracts';
import { consentTexts } from '@/i18n/consents';
import { engagementTexts, hourLabel, maskEmail } from '@/i18n/engagement';
import { t } from '@/i18n/es-MX';
import { enterWithLink, expect, openSecondDevice, test } from '../support/cloudFixtures';
import type { FakeSupabaseServer } from '../support/fakeSupabase';
import { unsubscribeTokenOf } from '../support/fakeEngagement';
import {
  COMMON_EVENT_PROPERTIES,
  flushAnalytics,
  gotoWhenMeasuring,
  seedFlags,
} from '../support/fakeTelemetry';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const ANA = 'ana@ejemplo.mx';
const text = engagementTexts.reminders;
const off = engagementTexts.unsubscribe;
/** Ajustes del repaso abierto directo en los recordatorios, a donde lleva el enlace del correo */
const REMINDERS_PANEL = `${SCREENS.review.path}?ajustes=recordatorios`;

const panel = (page: Page) =>
  page.getByRole('dialog', { name: t.settingsPage.reviewSettings.title });
const section = (page: Page) => panel(page).getByRole('region', { name: text.title });

/** Los recordatorios que el servidor guardó para Ana, o undefined si nunca los guardó */
const savedPrefs = (cloud: FakeSupabaseServer) => {
  const userId = cloud.userIdOf(ANA);
  return userId === undefined ? undefined : cloud.engagement.prefs.get(userId)?.prefs;
};

/** Abre Ajustes del repaso en Recordatorios. Con measuredBy espera a que la medición esté lista, para lo que debe medirse */
async function openReminders(page: Page, measuredBy?: FakeSupabaseServer) {
  if (measuredBy) await gotoWhenMeasuring(page, measuredBy, REMINDERS_PANEL);
  else await page.goto(REMINDERS_PANEL);
  await expect(panel(page)).toBeVisible();
  await expect(section(page)).toBeVisible();
}

test.describe('Recordatorios por correo', () => {
  test('con la bandera apagada la sección no aparece en Ajustes del repaso', async ({
    page,
    cloud,
  }) => {
    // Sin seedFlags, el build de nube de las pruebas nace con emailReminders apagada
    await enterWithLink(page, cloud, ANA, 'Ana');
    await page.goto(REMINDERS_PANEL);
    await expect(panel(page)).toBeVisible();
    await expect(
      panel(page).getByRole('region', { name: t.settings.pomodoroTitle }),
    ).toBeAttached();
    await expect(page.getByText(text.title)).toHaveCount(0);
    expect(cloud.rpcCalls('my_reminder_prefs')).toHaveLength(0);
  });

  test('nacen apagados, se prenden con hora y días, se guardan en el servidor y sobreviven a recargar', async ({
    page,
    cloud,
  }) => {
    await seedFlags(page, cloud, { emailReminders: true });
    await enterWithLink(page, cloud, ANA, 'Ana');
    await openReminders(page);

    const box = section(page).getByRole('checkbox', { name: text.enable });
    await expect(box).not.toBeChecked();
    // Apagado no enseña hora ni días, y la pantalla cumple axe
    await expect(section(page).getByLabel(text.hour)).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);

    await box.check();
    const hour = section(page).getByLabel(text.hour);
    await expect(hour).toHaveValue('20');
    await hour.selectOption({ label: hourLabel(7) });
    await section(page).getByRole('button', { name: text.frequencies.weekdays }).click();
    // El correo se muestra oculto en su mayor parte
    await expect(section(page).getByText(text.sentTo(maskEmail(ANA)))).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await section(page).getByRole('button', { name: t.settings.saveChanges }).click();
    await expect(section(page).getByText(text.saved)).toBeVisible();

    // El servidor guardó la hora, los días de lunes a viernes y la zona horaria del navegador
    const timeZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(savedPrefs(cloud)).toMatchObject({
      enabled: true,
      hour: 7,
      days: [1, 2, 3, 4, 5],
      frequency: 'weekdays',
      onlyWhenDue: true,
      timeZone,
      unsubscribed: false,
    });

    // Al recargar, lo que ve es lo que guardó el servidor
    await page.reload();
    await expect(section(page).getByRole('checkbox', { name: text.enable })).toBeChecked();
    await expect(section(page).getByLabel(text.hour)).toHaveValue('7');
    await expect(
      section(page).getByRole('button', { name: text.frequencies.weekdays }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('al guardar sube la foto de tarjetas vencidas, solo con fechas y números', async ({
    page,
    cloud,
  }) => {
    await seedFlags(page, cloud, { emailReminders: true });
    await enterWithLink(page, cloud, ANA, 'Ana');
    await openReminders(page);
    await section(page).getByRole('checkbox', { name: text.enable }).check();
    await section(page).getByRole('button', { name: t.settings.saveChanges }).click();
    await expect(section(page).getByText(text.saved)).toBeVisible();

    const userId = cloud.userIdOf(ANA) ?? '';
    await expect.poll(() => cloud.engagement.snapshots.has(userId)).toBe(true);
    const snapshot = cloud.engagement.snapshots.get(userId);
    // Catorce días a partir de hoy, cada uno con un conteo, y cuántas nuevas hay disponibles
    expect(snapshot?.days).toHaveLength(14);
    for (const entry of snapshot?.days ?? []) {
      expect(Object.keys(entry).sort()).toEqual(['day', 'due']);
      expect(entry.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(Object.keys(snapshot ?? {}).sort()).toEqual([
      'computedAt',
      'days',
      'newAvailable',
      'timeZone',
    ]);
    // Cada llamada a put_due_snapshot trae solo la foto, sin tarjetas, textos ni correo
    const calls = cloud.rpcCalls('put_due_snapshot');
    expect(calls.length).toBeGreaterThan(0);
    expect(JSON.stringify(calls.map((call) => call.body))).not.toContain(ANA);
  });

  test('Días que elijas pide al menos un día y guarda los que se marcan', async ({
    page,
    cloud,
  }) => {
    await seedFlags(page, cloud, { emailReminders: true });
    await enterWithLink(page, cloud, ANA, 'Ana');
    await openReminders(page);
    await section(page).getByRole('checkbox', { name: text.enable }).check();
    await section(page).getByRole('button', { name: text.frequencies.custom }).click();

    // Sin ningún día marcado no se guarda
    for (const day of text.dayOrder) {
      const name = text.dayNames[day];
      await section(page)
        .getByRole('checkbox', { name: name.charAt(0).toUpperCase() + name.slice(1), exact: true })
        .uncheck();
    }
    await section(page).getByRole('button', { name: t.settings.saveChanges }).click();
    await expect(section(page).getByRole('alert')).toHaveText(text.needsDay);
    expect(cloud.rpcCalls('set_reminder_prefs')).toHaveLength(0);

    // Con lunes y jueves sí
    await section(page).getByRole('checkbox', { name: 'Lunes', exact: true }).check();
    await section(page).getByRole('checkbox', { name: 'Jueves', exact: true }).check();
    await section(page).getByRole('button', { name: t.settings.saveChanges }).click();
    await expect(section(page).getByText(text.saved)).toBeVisible();
    expect(savedPrefs(cloud)).toMatchObject({ enabled: true, days: [1, 4], frequency: 'custom' });
  });

  test('si el servidor aún no tiene las funciones, la sección avisa y deja reintentar sin romper el panel', async ({
    page,
    cloud,
  }) => {
    cloud.engagement.deployed = false;
    await seedFlags(page, cloud, { emailReminders: true });
    await enterWithLink(page, cloud, ANA, 'Ana');
    await openReminders(page);
    await expect(section(page).getByRole('alert')).toHaveText(text.loadFailed);
    await expectNoSeriousA11yViolations(page);
    // El resto del panel sigue entero
    await expect(
      panel(page).getByRole('spinbutton', { name: t.settings.newCardsPerDay }),
    ).toBeVisible();

    // Cuando el servidor ya las tiene, reintentar funciona
    cloud.engagement.deployed = true;
    await section(page).getByRole('button', { name: text.retry }).click();
    await expect(section(page).getByRole('checkbox', { name: text.enable })).toBeVisible();
  });

  test('darse de baja desde el enlace del correo pregunta primero, apaga los recordatorios y se puede volver a prender', async ({
    page,
    cloud,
    browser,
    consoleErrors,
  }) => {
    await seedFlags(page, cloud, { emailReminders: true });
    await enterWithLink(page, cloud, ANA, 'Ana');
    await openReminders(page);
    await section(page).getByRole('checkbox', { name: text.enable }).check();
    await section(page).getByRole('button', { name: t.settings.saveChanges }).click();
    await expect(section(page).getByText(text.saved)).toBeVisible();
    const userId = cloud.userIdOf(ANA) ?? '';
    const token = unsubscribeTokenOf(cloud.engagement, userId);
    expect(token).toMatch(/^[0-9a-f]{36}$/);

    // El enlace se abre en otro navegador, sin sesión, como quien toca el enlace del correo en el teléfono
    const mail = await openSecondDevice(browser, cloud, consoleErrors);
    try {
      await mail.page.goto(`${UNSUBSCRIBE_PAGE_PATH}?t=${token ?? ''}`);
      await expect(mail.page.getByRole('heading', { name: off.question })).toBeVisible();
      await expectNoSeriousA11yViolations(mail.page);
      // Abrir el enlace, como lo hace un revisor de enlaces del correo, no da de baja a nadie
      expect(savedPrefs(cloud)?.enabled).toBe(true);
      await mail.page.getByRole('button', { name: off.confirm }).click();
      await expect(mail.page.getByText(off.done)).toBeVisible();
      await expectNoSeriousA11yViolations(mail.page);
      expect(savedPrefs(cloud)).toMatchObject({ enabled: false, unsubscribed: true });
      // La ficha sale de la dirección al terminar
      await expect(mail.page).not.toHaveURL(/[?&]t=/);

      // Darse de baja otra vez dice que ya estaba
      await mail.page.goto(`${UNSUBSCRIBE_PAGE_PATH}?t=${token ?? ''}`);
      await mail.page.getByRole('button', { name: off.confirm }).click();
      await expect(mail.page.getByText(off.already)).toBeVisible();
    } finally {
      await mail.context.close();
    }

    // En la app, la sección dice que se dio de baja desde un correo, y prenderla de nuevo quita la baja
    await openReminders(page);
    await expect(section(page).getByRole('checkbox', { name: text.enable })).not.toBeChecked();
    await expect(section(page).getByText(text.unsubscribed)).toBeVisible();
    await section(page).getByRole('checkbox', { name: text.enable }).check();
    await section(page).getByRole('button', { name: t.settings.saveChanges }).click();
    await expect(section(page).getByText(text.saved)).toBeVisible();
    expect(savedPrefs(cloud)).toMatchObject({ enabled: true, unsubscribed: false });
    // Con una ficha nueva: la del correo viejo ya no da de baja a nadie
    expect(unsubscribeTokenOf(cloud.engagement, userId)).not.toBe(token);
  });

  test('un enlace de baja con otra forma no pide nada al servidor y manda a Ajustes del repaso', async ({
    page,
    cloud,
  }) => {
    await page.goto(`${UNSUBSCRIBE_PAGE_PATH}?t=no-es-una-ficha`);
    await expect(page.getByText(off.invalid)).toBeVisible();
    await expect(page.getByRole('button', { name: off.confirm })).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);
    expect(cloud.calls.filter((call) => call.path.includes('email-unsubscribe'))).toHaveLength(0);

    // Una ficha con la forma buena que el servidor no conoce también se dice sin dar pistas
    await page.goto(`${UNSUBSCRIBE_PAGE_PATH}?t=${'0'.repeat(36)}`);
    await page.getByRole('button', { name: off.confirm }).click();
    await expect(page.getByText(off.invalid)).toBeVisible();
  });

  test('guardar los recordatorios mide solo si quedó prendido, la frecuencia y la parte del día, con el permiso', async ({
    page,
    cloud,
  }) => {
    await seedFlags(page, cloud, { emailReminders: true, productAnalytics: true });
    await enterWithLink(page, cloud, ANA, 'Ana');
    // Sin el permiso de Medición de uso guardar no mide nada
    await openReminders(page);
    await section(page).getByRole('checkbox', { name: text.enable }).check();
    await section(page).getByRole('button', { name: t.settings.saveChanges }).click();
    await expect(section(page).getByText(text.saved)).toBeVisible();
    await flushAnalytics(page);
    expect(cloud.telemetry.posthog).toHaveLength(0);

    // Con el permiso, sí, y con propiedades de la lista cerrada
    await page.goto(`${SCREENS.settings.path}#privacidad`);
    await page.getByRole('checkbox', { name: consentTexts.purposes.product_analytics[0] }).check();
    await expect(page.getByText(t.settings.privacy.consentSaved)).toBeVisible();
    await expect
      .poll(() => cloud.engagement.identities.get(cloud.userIdOf(ANA) ?? '')?.consent)
      .toBe(true);
    await openReminders(page, cloud);
    await section(page).getByRole('button', { name: text.frequencies.weekdays }).click();
    await section(page)
      .getByLabel(text.hour)
      .selectOption({ label: hourLabel(7) });
    await section(page).getByRole('button', { name: t.settings.saveChanges }).click();
    await expect(section(page).getByText(text.saved)).toBeVisible();
    await expect
      .poll(async () => {
        await flushAnalytics(page);
        return cloud.telemetry
          .posthogEvents()
          .filter((item) => item.event === 'reminder_prefs_saved').length;
      })
      .toBe(1);
    const [event] = cloud.telemetry
      .posthogEvents()
      .filter((item) => item.event === 'reminder_prefs_saved');
    expect(event?.properties).toMatchObject({
      enabled: true,
      frequency: 'weekdays',
      hour_band: 'morning',
    });
    expect(Object.keys(event?.properties ?? {}).sort()).toEqual(
      [...COMMON_EVENT_PROPERTIES, 'enabled', 'frequency', 'hour_band'].sort(),
    );
    expect(JSON.stringify(cloud.telemetry.posthog)).not.toContain(ANA);
  });
});
