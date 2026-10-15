// Acuerdo del etiquetado a ciegas en la nube (pantalla 19, 4.4 del plan de B11). Los pares son la
// etiqueta del autor y la del revisor de cada distractor, de editor_label_pairs. Con menos de 30 pares
// la pantalla calibra y la app habla de trampas. Con suficientes y buen acuerdo mide kappa, habla de
// sesgos y lista el acuerdo por etiqueta. El médico ve abajo las preguntas que le faltan por etiquetar
// y el admin solo mira el tablero. Los pares se siembran con seedPairs, porque etiquetar treinta a mano
// no cabe en una prueba.
import { SCREENS } from '@/app/screens';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import { callerOf, enterTeam, teamBank } from '../support/bankTeam';
import { statNumber, statValue } from '../support/b1';
import { expect, test } from '../support/cloudFixtures';
import { seedPairs, seedQuestions } from '../support/fakeBankStore';
import { assignQuestion, editorialRpc } from '../support/fakeEditorial';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const text = physicianText.agreementScreen;
const PHYSICIAN = { email: 'medica@ejemplo.mx', alias: 'Carla', role: 'physician' } as const;
const AUTHOR = { email: 'autor@ejemplo.mx', alias: 'Dario', role: 'physician' } as const;
const ADMIN = { email: 'admin@ejemplo.mx', alias: 'Admin', role: 'admin' } as const;

test.describe('Acuerdo del etiquetado en la nube', () => {
  test('con pocos pares calibra y la médica ve lo que le falta etiquetar a ciegas', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(120_000);
    const {
      bank,
      users: [carla, dario],
    } = teamBank(cloud, [PHYSICIAN, AUTHOR]);
    if (!carla || !dario) throw new Error('Faltan las cuentas del equipo');
    seedPairs(bank, 10, 1, carla.id);
    const [question] = seedQuestions(bank, 1, {
      status: 'draft',
      origin: 'app',
      authorId: dario.id,
    });
    if (!question) throw new Error('Sin pregunta sembrada');
    assignQuestion(bank, question.questionId, dario.id, 'author');
    assignQuestion(bank, question.questionId, carla.id, 'reviewer');
    const sent = editorialRpc(bank, 'editor_submit', callerOf(dario), {
      p_version_id: question.latestVersionId,
    });
    expect(sent.status).toBe(200);

    await enterTeam(page, cloud, PHYSICIAN.email);
    await page.goto(SCREENS.agreement.path);
    await expect(
      page.getByRole('heading', { level: 1, name: t.screens.agreement.title }),
    ).toBeVisible();
    expect(await statNumber(page, text.stats.label, text.stats.pairs)).toBe(10);
    await expect(statValue(page, text.stats.label, text.stats.pending)).toHaveText('1');
    await expect(page.getByRole('status').filter({ hasText: text.vocabulary.title })).toContainText(
      text.vocabulary.calibrating,
    );
    const queue = page.getByRole('region', { name: text.queue.title });
    await expect(queue.getByText(text.queue.remaining(1))).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await queue.getByRole('link', { name: text.queue.open }).click();
    await expect(page.getByRole('region', { name: physicianText.review.blind.title })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('con pares suficientes mide kappa, habla de sesgos y el admin solo mira', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(120_000);
    const minPairs = DEFAULT_THRESHOLDS.bias.minLabeledPairs;
    const {
      bank,
      users: [carla],
    } = teamBank(cloud, [PHYSICIAN, ADMIN]);
    if (!carla) throw new Error('Falta la médica');
    seedPairs(bank, minPairs + 10, 0.9, carla.id);

    await enterTeam(page, cloud, ADMIN.email);
    await page.goto(SCREENS.agreement.path);
    expect(await statNumber(page, text.stats.label, text.stats.pairs)).toBe(minPairs + 10);
    await expect(statValue(page, text.stats.label, text.stats.kappa)).toHaveText(/^-?\d+(\.\d+)?$/);
    await expect(page.getByRole('status').filter({ hasText: text.vocabulary.title })).toHaveCount(
      0,
    );
    const vocabulary = page.getByRole('region', { name: text.vocabulary.title });
    await expect(vocabulary.getByText(text.vocabulary.bias)).toBeVisible();
    await expect(
      vocabulary.getByText(text.vocabulary.rule(DEFAULT_THRESHOLDS.bias.minKappaForBiasLanguage)),
    ).toBeVisible();
    const byTag = page.getByRole('region', { name: text.byTag.title });
    await expect(byTag.getByText(text.byTag.none)).toHaveCount(0);
    expect(await byTag.locator('tbody tr').count()).toBeGreaterThan(1);
    // El admin no etiqueta. Solo ve cómo va el acuerdo
    const queue = page.getByRole('region', { name: text.queue.title });
    await expect(queue.getByText(text.queue.adminNote)).toBeVisible();
    await expect(queue.getByRole('link')).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);
  });
});
