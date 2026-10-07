// Fixtures compartidas de las pruebas de punta a punta.
// Cada prueba falla si la página escribe errores en la consola o lanza excepciones.
import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';

export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => {
        errors.push(error.message);
      });
      await use(errors);
      expect(errors, 'errores en la consola del navegador').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * La página no se desborda a los lados. Un contenido más ancho que la pantalla hace que el teléfono
 * se aleje para acomodarlo y mueve los botones de lugar, además de dar scroll horizontal
 */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    screen: document.documentElement.clientWidth,
  }));
  expect(widths.content, 'ancho del contenido contra el de la pantalla').toBeLessThanOrEqual(
    widths.screen,
  );
}

/** Cero violaciones serias o críticas de accesibilidad (14.1) */
export async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  // axe falló una vez de forma intermitente en la primera prueba tras el build, con un JSON
  // incompleto. Se analiza solo cuando la página terminó de cargar y la red está quieta
  await page.waitForLoadState('networkidle');
  await expectNoHorizontalOverflow(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(
    serious.map(
      (violation) =>
        `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    ),
    'violaciones serias o críticas de axe',
  ).toEqual([]);
}

/** Deja preferencias guardadas antes de que cargue la app, como si el alumno ya las hubiera elegido */
export async function presetPreferences(
  page: Page,
  preferences: { theme?: string; role?: string; database?: string },
): Promise<void> {
  await page.addInitScript(
    (value) => {
      // Solo la primera carga de la prueba. Así los cambios que hace la prueba sí se recuerdan
      if (sessionStorage.getItem('enarm.e2e.preset') === '1') return;
      sessionStorage.setItem('enarm.e2e.preset', '1');
      localStorage.setItem('enarm.preferences.v1', JSON.stringify(value));
    },
    { theme: 'system', role: 'student', database: 'real', ...preferences },
  );
}

/**
 * Crea una cuenta local por la bienvenida y deja la sesión abierta en Inicio (flujo 1). Sin
 * Supabase configurado la cuenta vive solo en este navegador, así que no hay correo que confirmar
 */
export async function signUp(page: Page, alias = 'Ana'): Promise<void> {
  await page.goto(SCREENS.onboarding.path);
  await page.getByLabel(t.onboarding.alias, { exact: true }).fill(alias);
  await page.getByLabel(t.account.email, { exact: true }).fill(`${alias.toLowerCase()}@ejemplo.mx`);
  await page.getByLabel(t.onboarding.privacyAccept).check();
  await page.getByRole('button', { name: t.onboarding.create }).click();
  await expect(page.getByRole('heading', { level: 1, name: t.screens.home.title })).toBeVisible();
}

/**
 * Contesta la pregunta number de total de la práctica con la primera opción. La retroalimentación
 * va al final de la sesión (D-087), así que responder pasa directo a la siguiente pregunta o al
 * resumen. Espera a que la siguiente esté en pantalla antes de volver, para no contestar sobre la
 * pregunta que se está yendo
 */
export async function answerPracticeQuestion(
  page: Page,
  number: number,
  total: number,
): Promise<void> {
  const last = number === total;
  await page.getByRole('radio').first().check();
  await page
    .getByRole('button', {
      name: last ? t.simulator.answerAndFinish : t.simulator.answerAndNext,
    })
    .click();
  if (last) {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      t.screens.sessionSummary.title,
    );
  } else {
    await expect(
      page.getByText(t.simulator.progress(number + 1, total), { exact: true }),
    ).toBeVisible();
  }
}
