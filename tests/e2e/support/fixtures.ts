// Fixtures compartidas de las pruebas de punta a punta.
// Cada prueba falla si la página escribe errores en la consola o lanza excepciones, salvo los que la
// propia prueba declara con la opción expectedPageErrors.
import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { TOUR_AUTO_OFFER_OFF, TOUR_STORAGE_KEY } from '@/features/tour/steps';
import { t } from '@/i18n/es-MX';

/** Opciones de las pruebas. Cada spec las cambia con test.use({ ... }) */
export interface E2eOptions {
  /**
   * Si el recorrido guiado aparece solo al terminar el registro (B15, 4.1). false por omisión, así
   * ninguna prueba que no sea del recorrido lo ve aparecer encima de lo que prueba. Solo
   * tests/e2e/tour.spec.ts lo prende con test.use({ tourAutoOffer: true }), y entonces el navegador queda
   * como el de quien llega por primera vez, sin estado del recorrido
   */
  tourAutoOffer: boolean;
  /**
   * Errores de la página que la prueba provoca a propósito, por ejemplo uno forzado para ver que se
   * reporta (tests/e2e/cloud/error-monitoring.spec.ts). Un texto es una parte del mensaje y una expresión
   * regular se prueba contra el mensaje completo. Cualquier otro error de consola o excepción sigue
   * tumbando la prueba. Se declara con test.use({ expectedPageErrors: [/Error de prueba/] })
   */
  expectedPageErrors: readonly (string | RegExp)[];
}

/** Los errores que la prueba no declaró como esperados. Los que queden tumban la prueba */
export function unexpectedPageErrors(
  errors: readonly string[],
  expected: readonly (string | RegExp)[],
): string[] {
  const matches = (message: string, pattern: string | RegExp): boolean =>
    typeof pattern === 'string'
      ? message.includes(pattern)
      : // Sin g ni y, que guardan estado entre una prueba y otra
        new RegExp(pattern.source, pattern.flags.replaceAll(/[gy]/g, '')).test(message);
  return errors.filter((message) => !expected.some((pattern) => matches(message, pattern)));
}

/**
 * Deja el recorrido guiado sin ofrecerse solo en este contexto, antes de que cargue cualquier página (B15,
 * 4.1 y 6.4). Escribe TOUR_AUTO_OFFER_OFF en TOUR_STORAGE_KEY solo si la clave no existe, así lo que la app
 * guarda después, como el recorrido que el alumno vuelve a ver desde Configuración, sobrevive a una
 * recarga. Con autoOffer en true no escribe nada, que es el estado de quien llega por primera vez
 */
export async function presetTourOffer(context: BrowserContext, autoOffer = false): Promise<void> {
  if (autoOffer) return;
  await context.addInitScript(
    ({ key, value }) => {
      try {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // En about:blank y sin almacenamiento no hay recorrido que apagar
      }
    },
    { key: TOUR_STORAGE_KEY, value: TOUR_AUTO_OFFER_OFF },
  );
}

export const test = base.extend<{ consoleErrors: string[] } & E2eOptions>({
  tourAutoOffer: [false, { option: true }],
  expectedPageErrors: [[], { option: true }],
  // Sustituye al contexto de Playwright para apagar el recorrido antes de la primera carga
  context: async ({ context, tourAutoOffer }, use) => {
    await presetTourOffer(context, tourAutoOffer);
    await use(context);
  },
  consoleErrors: [
    async ({ page, expectedPageErrors }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => {
        errors.push(error.message);
      });
      await use(errors);
      expect(
        unexpectedPageErrors(errors, expectedPageErrors),
        'errores en la consola del navegador',
      ).toEqual([]);
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
 * Supabase configurado la cuenta vive solo en este navegador, así que no hay correo que confirmar.
 * El recorrido guiado aparece solo al terminar el registro (B15, 4.1), y aquí se apaga antes de empezar,
 * incluso en las capturas y las auditorías que usan el test de Playwright y no el de estas fixtures.
 * Solo con tour en true se deja prendido, para quien prueba el recorrido
 */
export async function signUp(
  page: Page,
  alias = 'Ana',
  options: { tour?: boolean } = {},
): Promise<void> {
  await presetTourOffer(page.context(), options.tour === true);
  await page.goto(SCREENS.onboarding.path);
  await page.getByLabel(t.onboarding.alias, { exact: true }).fill(alias);
  await page.getByLabel(t.account.email, { exact: true }).fill(`${alias.toLowerCase()}@ejemplo.mx`);
  await page.getByLabel(t.accounts.signup.adultAccept(18)).check();
  await page.getByLabel(t.onboarding.privacyAccept).check();
  await page.getByRole('button', { name: t.onboarding.create }).click();
  await expect(page.getByRole('heading', { level: 2, name: t.home.reviewsTitle })).toBeVisible();
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
