// Revisiones de médicos para pagar (pantalla 36, 4.5 del plan de B11, respuesta 58). El revisor decide
// sobre tres versiones con las mismas funciones de la base. El admin ve una fila por médico y mes de
// Mérida con su clave del Sheet, aprobadas, cambios pedidos, el total de revisiones y el monto con la
// tarifa que puso Ricardo, y baja los dos CSV, que cuadran entre sí y con las decisiones. Sin correos.
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { bankAdminText } from '@/i18n/bankAdmin';
import { t } from '@/i18n/es-MX';
import { callerOf, enterTeam, teamBank } from '../support/bankTeam';
import { expect, test } from '../support/cloudFixtures';
import { FAKE_BANK_TEXT_MARK, seedQuestions } from '../support/fakeBankStore';
import { assignQuestion, editorialRpc } from '../support/fakeEditorial';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const text = bankAdminText.reviews;
const AUTHOR = { email: 'autora@ejemplo.mx', alias: 'Ana', role: 'physician' } as const;
const REVIEWER = { email: 'revisor@ejemplo.mx', alias: 'Beto', role: 'physician' } as const;
const ADMIN = { email: 'admin@ejemplo.mx', alias: 'Admin', role: 'admin' } as const;
const RATE = 50;
const money = (value: number) =>
  value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

/** Las líneas de un CSV bajado, sin el BOM ni la línea vacía del final */
async function downloadedLines(page: Page, button: string): Promise<string[]> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: button }).click();
  const content = await readFile(await (await download).path(), 'utf8');
  return content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line !== '');
}

test('el admin ve las revisiones del mes con su monto y baja los CSV que cuadran', async ({
  page,
  cloud,
}) => {
  test.setTimeout(120_000);
  const {
    bank,
    users: [ana, beto],
  } = teamBank(cloud, [AUTHOR, REVIEWER, ADMIN]);
  if (!ana || !beto) throw new Error('Faltan las cuentas del equipo');
  bank.physicianCodes.set(beto.id, 'BR');
  bank.settings.physicianPay.perReviewMxn = RATE;

  // Beto revisa tres preguntas de Ana. Aprueba dos y pide cambios en una
  const questions = seedQuestions(bank, 3, { status: 'draft', origin: 'app', authorId: ana.id });
  const decisions = ['approve', 'approve', 'request_changes'] as const;
  questions.forEach((question, index) => {
    assignQuestion(bank, question.questionId, ana.id, 'author');
    assignQuestion(bank, question.questionId, beto.id, 'reviewer');
    const versionId = question.latestVersionId;
    expect(
      editorialRpc(bank, 'editor_submit', callerOf(ana), { p_version_id: versionId }).status,
    ).toBe(200);
    for (const option of bank.versions.get(versionId)?.options ?? []) {
      if (option.isCorrect) continue;
      editorialRpc(bank, 'editor_label_option', callerOf(beto), {
        p_version_id: versionId,
        p_option_id: option.optionId,
        p_tag: option.biasTag,
      });
    }
    const decision = decisions[index] ?? 'approve';
    const reply = editorialRpc(bank, 'editor_decide', callerOf(beto), {
      p_version_id: versionId,
      p_decision: decision,
      p_comment: decision === 'approve' ? null : `${FAKE_BANK_TEXT_MARK} Revisa la clave.`,
      p_checks: [],
    });
    expect(reply.status).toBe(200);
  });
  expect(bank.decisions).toHaveLength(3);

  await enterTeam(page, cloud, ADMIN.email);
  await page.goto(SCREENS.physicianReviews.path);
  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.physicianReviews.title }),
  ).toBeVisible();
  await expect(page.getByText(text.rate(RATE))).toBeVisible({ timeout: 30_000 });
  const row = page.getByRole('row', { name: /Beto/ });
  await expect(row).toContainText('BR');
  await expect(row).toContainText(money(3 * RATE));
  await expect(row.getByRole('cell')).toHaveText([
    /^\d{4}-\d{2}$/,
    'BR',
    '2',
    '1',
    '0',
    '3',
    '0',
    money(3 * RATE),
  ]);
  // Sin correos en la pantalla del pago
  await expect(page.getByText(REVIEWER.email)).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  // El resumen y el detalle cuadran: tres revisiones de Beto en el detalle
  const summary = await downloadedLines(page, text.summaryCsv);
  expect(summary).toHaveLength(2);
  expect(summary[1]).toContain('"Beto"');
  expect(summary[1]).toContain('"3"');
  const detail = await downloadedLines(page, text.detailCsv);
  expect(detail).toHaveLength(1 + 3);
  expect(detail.slice(1).every((line) => line.includes('"Beto"') && line.includes('"BR"'))).toBe(
    true,
  );
  expect(detail.filter((line) => line.includes(`"${text.decisions.approve ?? ''}"`))).toHaveLength(
    2,
  );
});
