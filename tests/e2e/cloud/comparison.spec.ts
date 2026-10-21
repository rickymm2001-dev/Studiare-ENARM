// Cómo vas frente a otros, en Progreso (B14, 5 y 8.4 del plan de B14). Corre contra el Supabase simulado con la
// foto que publicaría la calibración nocturna (tests/e2e/support/fakeModelStore.ts, seedComparison) y el
// banco simulado de fakeBank.ts. El percentil lo calcula el navegador con los cortes publicados y con lo que
// el propio alumno hizo en los últimos 30 días, que aquí se siembra en su bitácora porque contestar 24
// preguntas en cinco días no cabe en una prueba. La calibración no corre en las e2e. Todo es simulado.
// Cubre un grupo chico que calibra y dice cuántos alumnos faltan, un grupo grande con percentiles por rama,
// repasos y constancia, la especialidad sin elegir con su enlace y la que sí, las palabras prohibidas y que quien
// no dio el permiso de mejora ve su percentil con el pie fijo.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { FACTORY_MODEL_SETTINGS } from '@/config/modelSettings';
import { percentileFromCuts } from '@/engines/comparison';
import { modelTexts } from '@/i18n/model';
import { readTable } from '../support/b1';
import {
  cloudWith,
  downloadQuestions,
  enterWithOpenBank,
  seedOwnHistory,
} from '../support/comparisonHistory';
import { expect, test } from '../support/cloudFixtures';
import {
  seedComparison,
  type FakeComparisonCell,
  type FakeModelStore,
} from '../support/fakeModelStore';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const text = modelTexts.comparison;
/** Las ramas del banco simulado, con el nombre que les da la taxonomía. No se importa el JSON, que Playwright no carga */
const BRANCH_NAMES: ReadonlyMap<string, string> = new Map([
  ['internal_medicine', 'Medicina interna'],
  ['pediatrics', 'Pediatría'],
  ['obstetrics_gynecology', 'Ginecología y obstetricia'],
  ['general_surgery', 'Cirugía general'],
]);
/** Lo que esta comparación nunca dice (5.5 del plan de B14) */
const FORBIDDEN =
  /puntaje (estimado|esperado|probable)|probabilidad|\bplazas?\b|ranking|lugar n[uú]mero|posici[oó]n n[uú]mero/i;

const cuts = (model: FakeModelStore, cell: Pick<FakeComparisonCell, 'metric' | 'branch'>) => {
  const found = model.cells.find(
    (item) => item.cohort === 'all' && item.metric === cell.metric && item.branch === cell.branch,
  );
  if (!found?.cuts) throw new Error(`La celda ${cell.metric} ${cell.branch} no trae cortes`);
  return found.cuts;
};

/** Lo que dice la fila de un percentil: el título que arma la tarjeta con el que sale del motor */
function percentileTitle(value: number, row: readonly number[]): string {
  const result = percentileFromCuts(value, row);
  return result.below5 ? text.below5 : result.above95 ? text.above95 : text.percentile(result.band);
}

const comparisonCard = (page: Page) => page.getByRole('region', { name: text.title });

async function openProgress(page: Page) {
  await page.goto(SCREENS.progress.path);
  const card = comparisonCard(page);
  await expect(card).toBeVisible({ timeout: 60_000 });
  return card;
}

test.describe('Cómo vas frente a otros', () => {
  test('con un grupo grande da el percentil por rama, de repasos y de constancia, y quien no dio el permiso lo ve igual', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(240_000);
    const { model } = cloudWith(
      cloud,
      (store) => {
        seedComparison(store, {
          students: 60,
          specialtyStudents: 40,
          specialty: 'general_surgery',
        });
      },
      'general_surgery',
    );
    await enterWithOpenBank(page, cloud);
    await downloadQuestions(page);
    const history = await seedOwnHistory(page, { answers: 24, correct: 18, reviews: 120, days: 5 });

    // Nadie dio el permiso de mejora. Aun así la comparación se arma en este navegador con sus cortes
    const consents = await readTable<{ purpose: string; status: string }>(page, 'consents');
    expect(
      consents.filter(
        (consent) => consent.purpose === 'anonymized_improvement' && consent.status === 'granted',
      ),
    ).toEqual([]);

    const card = await openProgress(page);
    const accuracy = 18 / 24;
    // Total y la rama en la que contestó, con el percentil que sale de los cortes publicados
    const total = card.getByRole('listitem').filter({ hasText: text.total });
    await expect(
      total.getByText(
        percentileTitle(accuracy, cuts(model, { metric: 'sim_accuracy', branch: '*' })),
      ),
    ).toBeVisible({ timeout: 30_000 });
    const branch = card.getByRole('listitem').filter({ hasText: BRANCH_NAMES.get(history.branch) });
    await expect(
      branch.getByText(
        percentileTitle(accuracy, cuts(model, { metric: 'sim_accuracy', branch: history.branch })),
      ),
    ).toBeVisible();
    // Repasos hechos y constancia, de todo el grupo
    const reviews = card.getByRole('region', { name: text.metrics.reviews });
    await expect(
      reviews.getByText(
        percentileTitle(history.reviews, cuts(model, { metric: 'reviews', branch: '*' })),
      ),
    ).toBeVisible();
    const consistency = card.getByRole('region', { name: text.metrics.consistency });
    await expect(
      consistency.getByText(
        percentileTitle(history.days, cuts(model, { metric: 'consistency', branch: '*' })),
      ),
    ).toBeVisible();
    // Las ramas donde no contestó calibran por él y le dicen cuántas lleva y cuántas pide
    await expect(
      card
        .getByText(text.ownCalibratingBranch(0, FACTORY_MODEL_SETTINGS.thresholds.minBranchAnswers))
        .first(),
    ).toBeVisible();

    // Es de lo que ya pasó: nada de puntaje, de probabilidad, de plazas ni de lugares en una lista
    expect(await card.innerText()).not.toMatch(FORBIDDEN);
    await expect(card.getByText(text.footer)).toBeVisible();
    await expect(card.getByText(/^Calculado la noche del \d+ de [a-záéíóú]+$/)).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Con especialidad elegida se compara también con quienes buscan lo mismo
    await card.getByRole('button', { name: text.cohorts.specialty }).click();
    await expect(card.getByText(text.specialtyFor('Cirugía General'))).toBeVisible();
    await expect(card.getByRole('button', { name: text.cohorts.specialty })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await card.innerText()).not.toMatch(FORBIDDEN);
  });

  test('con un grupo chico calibra y dice cuántos alumnos con datos faltan, sin ningún percentil', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(180_000);
    cloudWith(
      cloud,
      (store) => {
        seedComparison(store, { students: 12 });
      },
      null,
    );
    await enterWithOpenBank(page, cloud);
    const card = await openProgress(page);

    // 30 menos 12 con datos, en cada fila
    await expect(card.getByText(text.groupCalibrating(18)).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(card.getByText(/^Percentil \d+$/)).toHaveCount(0);
    await expect(card.getByRole('progressbar')).toHaveCount(0);
    await expect(card.getByText(text.footer)).toBeVisible();
    expect(await card.innerText()).not.toMatch(FORBIDDEN);
    await expectNoSeriousA11yViolations(page);
  });

  test('sin especialidad elegida solo compara con todos y enlaza a Tus datos', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(180_000);
    cloudWith(
      cloud,
      (store) => {
        seedComparison(store, { students: 60 });
      },
      null,
    );
    await enterWithOpenBank(page, cloud);
    const card = await openProgress(page);

    await expect(card.getByText(text.noSpecialty)).toBeVisible({ timeout: 30_000 });
    await expect(card.getByRole('button', { name: text.cohorts.specialty })).toHaveCount(0);
    const link = card.getByRole('link', { name: text.goToData });
    await expect(link).toHaveAttribute('href', /\/configuracion#perfil$/);
    await link.click();
    await expect(page).toHaveURL(/\/configuracion#perfil$/);
  });

  test('si la noche todavía no publicó nada, dice calibrando y por qué', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(180_000);
    cloudWith(cloud, () => undefined, 'general_surgery');
    await enterWithOpenBank(page, cloud);
    const card = await openProgress(page);

    await expect(card.getByText(text.unavailable.no_snapshot)).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText(text.footer)).toBeVisible();
    await expect(card.getByText(/^Percentil \d+$/)).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);
  });
});
