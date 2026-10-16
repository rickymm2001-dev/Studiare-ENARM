// La parte en inglés del examen completo (B13, paquete B, 6.3 del plan de B13). Un alumno de pago con el
// banco abierto, 250 preguntas en español y 12 casos de lectura con 30 reactivos de inglés, arma el examen de
// 280 con 250 en español y 30 en inglés y su tiempo, el navegador marca los de inglés, contesta de las dos
// secciones y los resultados cortan por sección con Inglés médico aparte de las siete ramas. Con solo 6
// reactivos de inglés la tarjeta avisa cuántos faltan, queda en Calibrando y el español no los rellena.
// Corre contra el Supabase simulado con el banco de tests/e2e/support/fakeBankStore.ts. Todo el texto es
// simulado y lleva [Prueba].
import type { Locator, Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { englishText } from '@/i18n/english';
import { t } from '@/i18n/es-MX';
import { finishExam, statValue } from '../support/b1';
import { expect, test } from '../support/cloudFixtures';
import {
  englishBank,
  enterWithOpenBank,
  examCard,
  examNavigator,
  isPhone,
  openSimulator,
  passageText,
} from '../support/english';
import { FAKE_ENGLISH_SOURCE, type FakeBankStore } from '../support/fakeBankStore';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const exam = englishText.exam;
const reading = englishText.reading;
const results = englishText.results;
const TOTAL = 280;
const CLINICAL_MS = 77_000;
const ENGLISH_MS = 90_000;

/** El idioma de cada versión que el servidor entregó */
const languagesRead = (store: FakeBankStore) =>
  store.reads.map((read) => store.versions.get(read.versionId)?.language);

/** Arma el examen con lo que dice la tarjeta y entra a él. Baja los cuerpos de todas las preguntas */
async function startExam(page: Page, total: number): Promise<void> {
  await examCard(page).getByRole('button', { name: t.exam.start }).click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.exam.path}$`), { timeout: 90_000 });
  await expect(page.getByRole('timer')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(t.exam.progress(1, total), { exact: true })).toBeVisible();
}

/** Abre el navegador de preguntas si está cerrado, y lo devuelve */
async function openNavigator(page: Page) {
  const navigator = examNavigator(page);
  if (!(await navigator.evaluate((element: HTMLDetailsElement) => element.open))) {
    await navigator.locator('summary').click();
  }
  return navigator;
}

/** El número de pregunta que dice la etiqueta de un botón del navegador, como Pregunta 12, en blanco */
async function numberOf(button: Locator): Promise<number> {
  const label = (await button.getAttribute('aria-label')) ?? '';
  const match = /^Pregunta (\d+),/.exec(label);
  if (!match) throw new Error(`Etiqueta inesperada en el navegador, ${label}`);
  return Number(match[1]);
}

test.describe('Examen completo con su parte en inglés', () => {
  test('el de 280 trae 250 en español y 30 en inglés, el navegador marca los de inglés y los resultados cortan por sección', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(480_000);
    const store = englishBank(cloud, { spanish: 250, cases: 12 });
    await enterWithOpenBank(page, cloud, 'monthly');
    await openSimulator(page);

    // La tarjeta dice la composición y el tiempo de las dos secciones, sin Calibrando
    const card = examCard(page);
    const size = card.getByRole('combobox', { name: t.exam.size });
    await expect(size).toHaveValue(String(TOTAL), { timeout: 60_000 });
    await expect(card.getByRole('checkbox', { name: exam.include })).toBeChecked();
    await expect(
      card.getByText(
        `${t.exam.timeTotal(250 * CLINICAL_MS + 30 * ENGLISH_MS)} · ${exam.composition(250, 30)}`,
      ),
    ).toBeVisible();
    await expect(card.getByText(t.states.calibrating.title)).toHaveCount(0);
    await expect(card.getByText(/Solo hay .+ de inglés/)).toHaveCount(0);
    await expect(card.getByText(exam.onlySpanish)).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);

    await startExam(page, TOTAL);
    // El servidor entregó las 280, 250 en español y 30 en inglés, con propósito de examen
    expect(store.reads).toHaveLength(TOTAL);
    expect(new Set(store.reads.map((read) => read.purpose))).toEqual(new Set(['exam']));
    expect(languagesRead(store).filter((language) => language === 'en')).toHaveLength(30);
    expect(languagesRead(store).filter((language) => language === 'es')).toHaveLength(250);

    // El navegador lista las 280 y marca las 30 de inglés con un ícono y la palabra Inglés
    const navigator = await openNavigator(page);
    await expect(navigator.locator('ol > li')).toHaveCount(TOTAL);
    const englishButtons = navigator.getByRole('button', { name: /, Inglés$/ });
    await expect(englishButtons).toHaveCount(30);
    await expect(navigator.locator('ol svg.lucide-languages')).toHaveCount(30);
    await expect(navigator.getByText(exam.navigatorTag, { exact: true })).toBeVisible();

    // Una pregunta de inglés lee el texto, la pregunta y las opciones en inglés, con su fuente
    const firstEnglish = await numberOf(englishButtons.first());
    await englishButtons.first().click();
    await expect(
      page.getByText(t.exam.progress(firstEnglish, TOTAL), { exact: true }),
    ).toBeVisible();
    const heading = page.getByRole('heading', {
      level: 2,
      name: new RegExp(`Pregunta ${firstEnglish} de ${TOTAL}`),
    });
    await expect(heading).toHaveAttribute('lang', 'en');
    await expect(heading.locator('span[lang="es"]')).toHaveCount(1);
    await expect(page.getByText(reading.label, { exact: true })).toBeVisible();
    // La primera pregunta de un texto lo trae a la vista en cualquier pantalla
    await expect(passageText(page)).toBeVisible();
    await expect(page.getByText(FAKE_ENGLISH_SOURCE)).toBeVisible();
    await expect(page.locator('label span[lang="en"]')).toHaveCount(4);
    // En el examen el reloj es el del examen completo, no hay tiempo sugerido por texto
    await expect(page.getByText(/Tiempo sugerido para este texto/)).toHaveCount(0);
    await page.getByRole('radio').first().check();
    await expectNoSeriousA11yViolations(page);

    // La segunda pregunta del texto. En el teléfono el texto va plegado y se abre con Ver el texto
    await page.getByRole('button', { name: t.exam.next, exact: true }).click();
    await expect(
      page.getByText(t.exam.progress(firstEnglish + 1, TOTAL), { exact: true }),
    ).toBeVisible();
    if (isPhone(page)) {
      const show = page.getByRole('button', { name: reading.show });
      await expect(show).toHaveAttribute('aria-expanded', 'false');
      await expect(passageText(page)).toBeHidden();
      await show.click();
    }
    await expect(passageText(page)).toBeVisible();

    // Una de español no trae nada de inglés. Se contesta con la primera opción
    const clinicalButtons = (await openNavigator(page)).getByRole('button', {
      name: /^Pregunta \d+, (?!.*Inglés)/,
    });
    const firstSpanish = await numberOf(clinicalButtons.first());
    await clinicalButtons.first().click();
    await expect(
      page.getByText(t.exam.progress(firstSpanish, TOTAL), { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(reading.label, { exact: true })).toHaveCount(0);
    await expect(page.locator('[lang="en"]')).toHaveCount(0);
    await page.getByRole('radio').first().check();

    // Terminar ahora. Quedaron contestadas una de cada sección y las demás en blanco
    await finishExam(page, { answered: 2, blank: TOTAL - 2, marked: 0 });
    await expect(statValue(page, t.examResults.statsLabel, t.examResults.answered)).toHaveText('2');
    await expect(statValue(page, t.examResults.statsLabel, t.examResults.blank)).toHaveText(
      String(TOTAL - 2),
    );

    // Los resultados cortan por sección y dejan a Inglés médico aparte de las siete ramas
    const sections = page.getByRole('region', { name: results.sectionsTitle });
    await expect(sections).toBeVisible();
    await expect(sections.getByText(/^Español \d+ de 250$/)).toBeVisible();
    await expect(sections.getByText(/^Inglés \d+ de 30$/)).toBeVisible();
    await expect(sections.getByText(results.sectionsHint)).toBeVisible();
    await expect(sections.getByText(/^1 contestado · 249 en blanco/)).toBeVisible();
    await expect(sections.getByText(/^1 contestado · 29 en blanco/)).toBeVisible();
    const branches = page.getByRole('region', { name: t.examResults.branchesTitle });
    await expect(branches.getByText(results.aside)).toBeVisible();
    await expect(
      branches.getByText(t.branchNames.medical_english as string, { exact: true }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test('con 6 reactivos de inglés avisa cuántos faltan, queda en Calibrando y el español no los rellena', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(420_000);
    const store = englishBank(cloud, { spanish: 250, cases: 2, itemsPerCase: 3 });
    await enterWithOpenBank(page, cloud, 'monthly');
    await openSimulator(page);

    const card = examCard(page);
    await expect(card.getByRole('combobox', { name: t.exam.size })).toHaveValue(String(TOTAL), {
      timeout: 60_000,
    });
    await expect(card.getByText(t.states.calibrating.title).first()).toBeVisible();
    await expect(
      card.getByText(/6 de 30 reactivos de inglés\. Faltan 24 reactivos de inglés/),
    ).toBeVisible();
    await expect(card.getByText(exam.missing(6, 30, true))).toBeVisible();
    // 250 en español y las 6 de inglés que hay. Las 24 que faltan no las pone el español
    await expect(
      card.getByText(
        `${t.exam.timeTotal(250 * CLINICAL_MS + 6 * ENGLISH_MS)} · ${exam.composition(250, 6)}`,
      ),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await startExam(page, 256);
    expect(store.reads).toHaveLength(256);
    expect(languagesRead(store).filter((language) => language === 'en')).toHaveLength(6);
    const navigator = await openNavigator(page);
    await expect(navigator.locator('ol > li')).toHaveCount(256);
    await expect(navigator.getByRole('button', { name: /, Inglés$/ })).toHaveCount(6);
  });
});
