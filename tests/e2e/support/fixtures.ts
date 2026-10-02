// Fixtures compartidas de las pruebas de punta a punta.
// Cada prueba falla si la página escribe errores en la consola o lanza excepciones.
import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';

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

/** Cero violaciones serias o críticas de accesibilidad (14.1) */
export async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
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
