// Inglés médico en la práctica del alumno (B13, paquete B, 6.3 del plan de B13). Con el banco de la nube
// abierto y casos de lectura en inglés en el banco simulado, Simular muestra la tarjeta de Inglés médico en
// Calibrando, la práctica lee un texto en inglés con su fuente y su tiempo sugerido, avisa al pasarse y
// cierra con una retroalimentación en español. Gratis gasta de sus preguntas del día los reactivos del
// texto completo, o no abre el texto. La práctica en español no trae inglés. Corre contra el Supabase
// simulado con el banco de tests/e2e/support/fakeBankStore.ts. Todo el texto es simulado y lleva [Prueba].
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { englishText } from '@/i18n/english';
import { t } from '@/i18n/es-MX';
import { cloudBankScreensText as bankText } from '@/i18n/cloudBankScreens';
import { statValue } from '../support/b1';
import { expect, test } from '../support/cloudFixtures';
import {
  englishBank,
  englishCard,
  enterWithOpenBank,
  isPhone,
  openSimulator,
  passageNumber,
  passageText,
  practiceCard,
  textSize,
} from '../support/english';
import { setQuota } from '../support/fakeBank';
import { FAKE_ENGLISH_SOURCE, type FakeBankStore } from '../support/fakeBankStore';
import { answerPracticeQuestion, expectNoSeriousA11yViolations } from '../support/fixtures';

const copy = englishText.practice;
const reading = englishText.reading;
const SECONDS = 90;

/** El idioma de cada versión que el servidor entregó, en el orden en que las entregó */
const languagesRead = (store: FakeBankStore) =>
  store.reads.map((read) => store.versions.get(read.versionId)?.language);

/** Abre una respuesta del resumen, sin cerrarla si el resumen ya la trae abierta (las falladas lo están) */
async function openAnswer(page: Page, index: number) {
  const answer = page.locator('ol > li > details').nth(index);
  if (!(await answer.evaluate((element: HTMLDetailsElement) => element.open))) {
    await answer.locator('> summary').click();
  }
  await expect(answer).toHaveAttribute('open', '');
  return answer;
}

test.describe('Inglés médico en la práctica', () => {
  test('Simular muestra Inglés médico en Calibrando con 5 de 30 y la práctica en español no trae inglés', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(240_000);
    const store = englishBank(cloud, { spanish: 250, cases: 2 });
    await enterWithOpenBank(page, cloud, 'monthly');
    await openSimulator(page);
    const card = englishCard(page);
    await expect(card).toBeVisible({ timeout: 30_000 });

    // Dos textos de 5 reactivos en total, de los 30 que pide la parte en inglés del examen
    await expect(card.getByText(t.states.calibrating.title).first()).toBeVisible();
    await expect(
      card.getByText(/5 de 30 reactivos de inglés\. Faltan 25 reactivos de inglés/),
    ).toBeVisible();
    await expect(card.getByText(`${copy.texts(2)} · ${copy.suggested(SECONDS)}`)).toBeVisible();
    await expect(card.getByRole('button', { name: copy.start })).toBeEnabled();
    // Pedir más textos de los que hay lo dice, y la práctica es de todos
    await expect(card.getByText(copy.fewer(3, 2))).toBeVisible();

    // El español sigue siendo 250 y no cuenta ni ofrece Inglés médico entre sus ramas
    const practice = practiceCard(page);
    await expect(practice.getByText(bankText.bankNote(250))).toBeVisible();
    await expect(practice.getByText(t.branchNames.medical_english as string)).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);

    // Una práctica en español de 10 no trae ningún texto en inglés ni baja versiones de inglés
    await practice
      .getByRole('combobox', { name: t.simulator.count, exact: true })
      .selectOption('10');
    await practice.getByRole('button', { name: t.simulator.start }).click();
    await expect(page.getByText(t.simulator.progress(1, 10), { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    expect(store.reads).toHaveLength(10);
    expect(new Set(languagesRead(store))).toEqual(new Set(['es']));
    await expect(page.locator('[lang="en"]')).toHaveCount(0);
    await expect(page.getByText(reading.label, { exact: true })).toHaveCount(0);
  });

  test('lee el texto en inglés con su fuente y su tiempo, avisa al pasarse y retroalimenta en español', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(300_000);
    const store = englishBank(cloud, { spanish: 250, cases: 2 });
    await enterWithOpenBank(page, cloud, 'monthly');
    await openSimulator(page);
    const card = englishCard(page);
    await expect(card.getByRole('button', { name: copy.start })).toBeEnabled({ timeout: 30_000 });
    await card.getByRole('button', { name: copy.start }).click();

    // Los dos textos completos, con sus 5 reactivos, bajaron con propósito de práctica
    await expect(page.getByText(t.simulator.progress(1, 5), { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    expect(store.reads).toHaveLength(5);
    expect(new Set(store.reads.map((read) => read.purpose))).toEqual(new Set(['practice']));
    expect(new Set(languagesRead(store))).toEqual(new Set(['en']));

    // El texto, la pregunta y las opciones van en inglés y la interfaz sigue en español
    const size = await textSize(page);
    expect([2, 3]).toContain(size);
    await expect(page.getByText(reading.label, { exact: true })).toBeVisible();
    await expect(passageText(page)).toBeVisible();
    await expect(page.locator('#pregunta-frase')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#pregunta-frase')).toContainText('According to the passage');
    await expect(page.locator('label span[lang="en"]')).toHaveCount(4);
    await expect(page.getByRole('button', { name: t.simulator.answerAndNext })).toBeVisible();
    // La fuente del texto va bajo el texto, con su licencia
    await expect(page.getByText(FAKE_ENGLISH_SOURCE)).toBeVisible();
    // El tiempo sugerido es el de todo el texto, a 90 s por reactivo
    await expect(page.getByText(reading.suggested(size * SECONDS), { exact: false })).toBeVisible();
    await expect(page.getByText(/Llevas \d+:\d{2} en este texto/)).toBeVisible();
    await expect(page.getByText(/arriba del tiempo sugerido/)).toHaveCount(0);
    // La primera pregunta de un texto lo trae a la vista en cualquier pantalla
    await expect(page.getByRole('button', { name: reading.show })).toHaveCount(0);
    const first = await passageNumber(page);
    await expectNoSeriousA11yViolations(page);

    // Con el reloj adelantado pasado el tiempo sugerido, avisa con una línea y lo anuncia una sola vez
    await page.clock.setFixedTime(new Date(Date.now() + (size * SECONDS + 30) * 1000));
    const over = page.getByText(/^Vas .+ arriba del tiempo sugerido$/);
    await expect(over).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: reading.overAnnounce })).toHaveCount(1);
    await expectNoSeriousA11yViolations(page);

    // La segunda pregunta del mismo texto sigue con el mismo reloj. En el teléfono el texto va plegado. El
    // foco va al enunciado, porque el texto ya se leyó
    await answerPracticeQuestion(page, 1, 5);
    await expect(page.getByText(reading.position(2, size))).toBeVisible();
    await expect(page.locator('#pregunta-frase')).toBeFocused();
    await expect(over).toBeVisible();
    expect(await passageNumber(page)).toBe(first);
    if (isPhone(page)) {
      const show = page.getByRole('button', { name: reading.show });
      await expect(show).toHaveAttribute('aria-expanded', 'false');
      await expect(passageText(page)).toBeHidden();
      // La fuente se ve aunque el texto esté plegado
      await expect(page.getByText(FAKE_ENGLISH_SOURCE)).toBeVisible();
      await show.click();
      await expect(passageText(page)).toBeVisible();
      await expect(page.getByRole('button', { name: reading.hide })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    } else {
      await expect(passageText(page)).toBeVisible();
      await expect(page.getByRole('button', { name: reading.show })).toHaveCount(0);
    }

    // El otro texto abre su propio reloj: el aviso del primero ya no está
    for (let number = 2; number <= size; number += 1) {
      await answerPracticeQuestion(page, number, 5);
    }
    await expect(page.getByText(t.simulator.progress(size + 1, 5), { exact: true })).toBeVisible();
    expect(await passageNumber(page)).not.toBe(first);
    // El texto nuevo va antes del enunciado, así que el foco va a su región y no al enunciado
    await expect(page.getByRole('region', { name: reading.label })).toBeFocused();
    await expect(page.getByText(/Llevas 0:00 en este texto/)).toBeVisible();
    await expect(page.getByText(/arriba del tiempo sugerido/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: reading.show })).toHaveCount(0);
    for (let number = size + 1; number <= 5; number += 1) {
      await answerPracticeQuestion(page, number, 5);
    }

    // El resumen trae las cinco con su enunciado en inglés, y su retroalimentación va en español
    await expect(page.locator('summary span[lang="en"]')).toHaveCount(5);
    const row = await openAnswer(page, 0);
    await expect(row.getByText(/Explicación simulada del texto/)).toBeVisible();
    await expect(row.getByText(t.simulator.explanation, { exact: true })).toBeVisible();
    await expect(row.getByText(/Justificación simulada/).first()).toBeVisible();
    // El texto va plegado en la revisión y la fuente a la vista
    await expect(row.getByText(reading.label, { exact: true })).toBeVisible();
    await expect(row.getByText(FAKE_ENGLISH_SOURCE)).toBeVisible();
    await expect(passageText(row)).toBeHidden();
    await row.getByRole('button', { name: reading.show }).click();
    await expect(passageText(row)).toBeVisible();
    await expect(row.locator('li span[lang="en"]').first()).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Progreso cuenta lo contestado en su tarjeta de inglés, aparte de las ramas, y sigue en Calibrando
    await page.goto(SCREENS.progress.path);
    const progress = page.getByRole('region', { name: englishText.progress.title });
    await expect(progress).toBeVisible({ timeout: 30_000 });
    await expect(progress.getByText(englishText.progress.calibrating(20, 5))).toBeVisible();
    await expect(progress.getByText(englishText.progress.texts(2))).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test('Gratis gasta de sus preguntas del día los reactivos de los textos completos', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(240_000);
    const store = englishBank(cloud, { spanish: 250, cases: 2 });
    await enterWithOpenBank(page, cloud, 'free');
    await openSimulator(page);
    await expect(statValue(page, t.simulator.stats.label, t.simulator.stats.today)).toHaveText(
      '20',
    );
    const card = englishCard(page);
    await expect(card.getByRole('button', { name: copy.start })).toBeEnabled({ timeout: 30_000 });
    await card.getByRole('button', { name: copy.start }).click();
    await expect(page.getByText(t.simulator.progress(1, 5), { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    // Los dos textos completos cuentan 5 de las 20 de hoy
    expect(store.reads).toHaveLength(5);
    expect(new Set(languagesRead(store))).toEqual(new Set(['en']));

    await openSimulator(page);
    await expect(statValue(page, t.simulator.stats.label, t.simulator.stats.today)).toHaveText(
      '15',
    );
    await expect(englishCard(page).getByRole('button', { name: copy.start })).toBeEnabled();
    await expectNoSeriousA11yViolations(page);
  });

  test('Gratis con menos preguntas de las que trae el texto más corto lo dice y no abre ninguno', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(240_000);
    const store = englishBank(cloud, { spanish: 250, cases: 2, itemsPerCase: 3 });
    // Al día le quedan 2 y cada texto trae 3
    setQuota(store, { freeDaily: 2 });
    await enterWithOpenBank(page, cloud, 'free');
    await openSimulator(page);
    const card = englishCard(page);
    await expect(card.getByText(copy.noFit(2, 3))).toBeVisible({ timeout: 30_000 });
    await expect(card.getByRole('button', { name: copy.start })).toBeDisabled();
    expect(store.reads).toHaveLength(0);
    await expectNoSeriousA11yViolations(page);
  });

  test('Gratis con 4 preguntas libres abre un solo texto, completo, y no pasa de las 4', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(240_000);
    const store = englishBank(cloud, { spanish: 250, cases: 2 });
    setQuota(store, { freeDaily: 4 });
    await enterWithOpenBank(page, cloud, 'free');
    await openSimulator(page);
    const card = englishCard(page);
    await expect(card.getByText(copy.limitedTo(4, 1))).toBeVisible({ timeout: 30_000 });
    await card.getByRole('button', { name: copy.start }).click();
    // Un texto es de 2 o de 3 preguntas y se abre completo
    await expect(page.getByText(/^Pregunta 1 de [23]$/)).toBeVisible({ timeout: 30_000 });
    expect([2, 3]).toContain(store.reads.length);
    await expect(
      page.getByText(t.simulator.progress(1, store.reads.length), { exact: true }),
    ).toBeVisible();
  });
});
