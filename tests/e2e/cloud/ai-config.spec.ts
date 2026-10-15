// La configuración de la IA alojada con la nube simulada (B12, 2.4 y 5.5). El admin ajusta los límites de
// la nube desde Configuración y la función los aplica. Con un tope de una generación de tarjetas al día, la
// segunda de una alumna recibe el aviso del servidor. Cambiar el razonamiento de un motor que ya está abierto
// a los alumnos avisa que lo cierra hasta una auditoría corta, y al guardar el servidor lo cierra de verdad.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { adminText } from '@/i18n/admin';
import { t } from '@/i18n/es-MX';
import { enterTeam } from '../support/bankTeam';
import { enterWithLink, expect, openSecondDevice, test } from '../support/cloudFixtures';
import { attachAi } from '../support/fakeSupabase';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const text = adminText.adminConfig.aiForm;
const ADMIN = 'admin.config@ejemplo.mx';
const ANA = 'ana.config@ejemplo.mx';
const DAY_MS = 86_400_000;

/** El aviso del servidor cuando se pasa de las generaciones de tarjetas del día (supabase/functions/_shared/ai/messages.ts) */
const GENERATION_MESSAGE =
  'Llegaste al límite de generaciones de tarjetas con IA de hoy. Vuelve mañana.';

const MATERIAL =
  'La metformina es el tratamiento de primera línea de la diabetes mellitus tipo 2. ' +
  'La dosis inicial habitual es de 500 mg cada 12 horas con los alimentos. ' +
  'Nunca debe usarse con una tasa de filtrado glomerular menor de 30 ml/min. ' +
  'La retinopatía diabética se caracteriza por microaneurismas y hemorragias retinianas en el fondo de ojo.';

const formRegion = (page: Page) => page.getByRole('region', { name: text.title });

test.describe('Configuración de la IA alojada', () => {
  test('el admin baja el tope de generaciones de tarjetas y la segunda de una alumna recibe el aviso del servidor', async ({
    page,
    browser,
    cloud,
    consoleErrors,
  }) => {
    test.setTimeout(180_000);
    const ai = attachAi(cloud);
    await ai.openEngines('flashcards');
    cloud.createUser({ email: ADMIN, alias: 'Admin', role: 'admin' });
    cloud.createUser({ email: ANA, alias: 'Ana' });
    cloud.setSubscription(ANA, {
      plan: 'monthly',
      status: 'active',
      provider: 'stripe',
      currentPeriodEnd: new Date(Date.now() + 20 * DAY_MS).toISOString(),
    });

    // El admin ve la configuración que tiene la función y cambia el tope de generaciones por día
    const staff = await openSecondDevice(browser, cloud, consoleErrors);
    await enterTeam(staff.page, cloud, ADMIN);
    await staff.page.goto(SCREENS.adminSettings.path);
    const form = formRegion(staff.page);
    await expect(form).toBeVisible({ timeout: 30_000 });
    await expect(form.getByText(t.ai.badge.real)).toBeVisible();
    await expect(form.getByText(text.cloudLimitsTitle)).toBeVisible();
    await expectNoSeriousA11yViolations(staff.page);
    const generations = form.getByLabel(text.cardGenerations);
    await expect(generations).toHaveValue(String(ai.config.limits.cardGenerationsPerDay));
    await generations.fill('1');
    await form.getByRole('button', { name: text.save, exact: true }).click();
    await expect(form.getByText(text.saved)).toBeVisible();
    expect(ai.config.limits.cardGenerationsPerDay).toBe(1);

    // La alumna genera una vez. La segunda generación del día la frena el servidor, no la app
    await enterWithLink(page, cloud, ANA, 'Ana');
    await page.goto(SCREENS.decks.path);
    const cards = page.getByRole('region', { name: t.aiCards.title });
    await cards.getByLabel(t.aiCards.textLabel).fill(MATERIAL);
    await cards.getByRole('button', { name: t.aiCards.generate }).click();
    await expect(cards.getByRole('heading', { name: t.aiCards.resultTitle })).toBeVisible({
      timeout: 30_000,
    });
    await cards.getByRole('button', { name: t.aiCards.again }).first().click();
    await cards.getByLabel(t.aiCards.textLabel).fill(MATERIAL);
    await cards.getByRole('button', { name: t.aiCards.generate }).click();
    await expect(cards.getByRole('alert')).toHaveText(GENERATION_MESSAGE, {
      timeout: 30_000,
    });
    const answers = ai.engineCalls().map((call) => call.status);
    expect(answers.at(-1)).toBe(429);
    expect(answers.filter((status) => status === 200).length).toBeGreaterThan(0);
    await expectNoSeriousA11yViolations(page);
    await staff.context.close();
  });

  test('cambiar el razonamiento de un motor abierto avisa que lo cierra y el servidor lo cierra de verdad', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(120_000);
    const ai = attachAi(cloud);
    await ai.openEngines('flashcards', 'bias_tips');
    cloud.createUser({ email: ADMIN, alias: 'Admin', role: 'admin' });
    await enterTeam(page, cloud, ADMIN);
    expect(ai.gate.state.engines.flashcards?.thinking).toBe('adaptive');

    await page.goto(SCREENS.adminSettings.path);
    const form = formRegion(page);
    await expect(form).toBeVisible({ timeout: 30_000 });
    // Sin cambios no hay aviso
    await expect(form.getByText(/queda cerrado para los alumnos/)).toHaveCount(0);
    const cardsGroup = form.getByRole('group', { name: adminText.adminCosts.engines.flashcards });
    await cardsGroup.getByLabel(text.thinking).selectOption('off');
    await expect(
      form.getByText(text.gateAffected(adminText.adminCosts.engines.flashcards)),
    ).toBeVisible();
    // El otro motor abierto no cambió y no se nombra
    await expect(
      form.getByText(text.gateAffected(adminText.adminCosts.engines.bias_tips)),
    ).toHaveCount(0);
    await form.getByRole('button', { name: text.save, exact: true }).click();
    await expect(form.getByText(text.saved)).toBeVisible();

    // El servidor ya cuenta el motor cerrado para alumnos y el otro sigue abierto. Los médicos siguen
    const health = await page.evaluate(async () => {
      const response = await fetch('https://fakeproj.supabase.co/functions/v1/ai-proxy/health');
      return (await response.json()) as { engines: Record<string, string> };
    });
    expect(health.engines.flashcards).toBe('gated');
    expect(health.engines.bias_tips).toBe('open');
    expect(ai.config.models.flashcards.thinking).toBe('off');
  });
});
