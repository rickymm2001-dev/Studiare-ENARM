// Inglés médico con el banco de demostración (B13, paquete B, 6.3 del plan de B13). La demostración no trae
// textos médicos en inglés, así que la tarjeta de Simular dice Sin textos, sin prometer vocabulario ni mandar
// a los mazos, la de Progreso no pide reactivos ni manda a practicar, y el examen completo corre solo en
// español con su aviso, sin marcas de inglés. El mazo de vocabulario médico en
// inglés se sigue y se repasa una tarjeta con su fuente a la vista, pero ese mazo lo genera el paquete A
// con el XML de MedlinePlus y todavía no existe en el repositorio (src/demo/content/decks/
// vocabulario-ingles.json), así que esa prueba queda marcada como omitida, con su motivo a la vista, hasta
// que el archivo exista. Sin nube, con la cuenta local de la demostración.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCREENS } from '@/app/screens';
import { examTotalMs } from '@/engines/exam';
import { englishText } from '@/i18n/english';
import { t } from '@/i18n/es-MX';
import { statNumber, subscribeMonthly } from './support/b1';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const practice = englishText.practice;
const exam = englishText.exam;
const FULL_EXAM = 280;

const DECK_FILE = fileURLToPath(
  new URL('../../src/demo/content/decks/vocabulario-ingles.json', import.meta.url),
);

test('con el banco de demostración la tarjeta dice Sin textos y el examen completo corre solo en español con su aviso', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await signUp(page);
  // El examen completo de 280 es de los planes de pago
  await subscribeMonthly(page);
  await page.goto(SCREENS.simulatorSetup.path);

  // Sin textos publicados, la tarjeta solo dice que todavía no hay. No promete el vocabulario, que puede no
  // existir, ni manda a los mazos, y no hay nada que empezar
  const card = page.getByRole('region', { name: practice.title });
  await expect(card).toBeVisible({ timeout: 90_000 });
  await expect(card.getByText(practice.none.title, { exact: true })).toBeVisible();
  await expect(card.getByText(practice.none.body, { exact: false })).toBeVisible();
  await expect(card.getByRole('link')).toHaveCount(0);
  await expect(card).not.toContainText(/vocabulario/i);
  await expect(card.getByRole('button', { name: practice.start })).toHaveCount(0);
  // La práctica en español no ofrece Inglés médico entre sus ramas
  const spanish = page.getByRole('region', { name: t.simulator.setupTitle });
  await expect(spanish.getByText(t.branchNames.medical_english as string)).toHaveCount(0);

  // El examen completo lleva la casilla de la parte en inglés, pero sin textos corre solo en español
  const examCard = page.getByRole('region', { name: t.exam.cardTitle });
  await expect(examCard.getByRole('combobox', { name: t.exam.size })).toHaveValue(
    String(FULL_EXAM),
  );
  await expect(examCard.getByRole('checkbox', { name: exam.include })).toBeChecked();
  await expect(examCard.getByText(exam.onlySpanish)).toBeVisible();
  await expect(examCard.getByText(/0 de 30 reactivos de inglés/)).toBeVisible();
  const bank = await statNumber(page, t.simulator.stats.label, t.simulator.stats.bank);
  const total = Math.min(FULL_EXAM, bank);
  await expect(examCard.getByText(t.exam.timeTotal(examTotalMs(total)))).toBeVisible();
  await expect(examCard.getByText(/ en español y .* en inglés/)).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  // El examen que empieza es todo de español: ni una marca de inglés en el navegador
  await examCard.getByRole('button', { name: t.exam.start }).click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.exam.path}$`));
  await expect(page.getByRole('timer')).toBeVisible();
  await expect(page.getByText(t.exam.progress(1, total), { exact: true })).toBeVisible();
  await expect(page.getByText(englishText.reading.label, { exact: true })).toHaveCount(0);
  const navigator = page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: t.exam.navigatorTitle }) });
  await navigator.locator('summary').click();
  await expect(navigator.locator('ol > li')).toHaveCount(total);
  await expect(navigator.locator('ol svg.lucide-languages')).toHaveCount(0);
  await expect(navigator.getByRole('button', { name: /, Inglés$/ })).toHaveCount(0);
  await expect(navigator.getByText(exam.navigatorTag, { exact: true })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
});

test('Progreso sin textos publicados dice que todavía no hay y no manda a practicar inglés', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUp(page);
  await page.goto(SCREENS.progress.path);
  const card = page.getByRole('region', { name: englishText.progress.title });
  await expect(card).toBeVisible({ timeout: 60_000 });
  // Calibrando, porque no hay ni una respuesta, pero sin pedir los 20 reactivos de inglés
  await expect(card.getByText(t.states.calibrating.title)).toBeVisible();
  await expect(card.getByText(englishText.progress.noTexts)).toBeVisible();
  await expect(card.getByText(englishText.progress.calibrating(20, 0))).toHaveCount(0);
  await expect(card.getByRole('link', { name: englishText.progress.goPractice })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
});

test('el mazo de vocabulario médico en inglés se sigue y se repasa una tarjeta con la fuente a la vista', async ({
  page,
}) => {
  test.skip(
    !existsSync(DECK_FILE),
    'Falta src/demo/content/decks/vocabulario-ingles.json. El paquete A no pudo bajar el XML de MedlinePlus; con el archivo generado por npm run english:vocabulary esta prueba corre sola',
  );
  test.setTimeout(240_000);
  const deck = JSON.parse(readFileSync(DECK_FILE, 'utf8')) as { name: string };
  await signUp(page);
  // Seguir mazos del catálogo es de los planes de pago
  await subscribeMonthly(page);

  await page.goto(SCREENS.decks.path);
  const item = page.getByRole('listitem').filter({ hasText: deck.name });
  // La lista dice de dónde sale el mazo
  await expect(item.getByText(/MedlinePlus\.gov \(NLM\)/).first()).toBeVisible({
    timeout: 60_000,
  });
  await item.getByRole('button', { name: t.decks.follow }).click();
  await expect(item.getByRole('button', { name: t.decks.unfollow })).toBeVisible({
    timeout: 120_000,
  });
  await expectNoSeriousA11yViolations(page);

  // Se repasa una tarjeta. Al mostrar la respuesta, la fuente queda a la vista
  await page.goto(SCREENS.review.path);
  await page.getByRole('button', { name: /^Repasar [\d,]+ tarjetas?$/ }).click();
  await expectNoSeriousA11yViolations(page);
  await page.getByRole('button', { name: t.review.show }).click();
  await expect(page.getByText(/Fuente MedlinePlus\.gov \(NLM\)/)).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^${t.review.ratings.good}`) }).click();
  await page.getByRole('button', { name: t.review.finish }).click();
  await expect(page.getByText(t.review.doneTitle)).toBeVisible();
  await expect(page.getByText(/Repasaste 1 tarjeta y ganaste [\d,]+ XP\./)).toBeVisible();
});
