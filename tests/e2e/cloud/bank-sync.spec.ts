// Sincronizar ahora desde Banco y Sheet (pantalla 35, 3.1 a 3.10 y 4.3 del plan de B11). El admin corre
// la sincronización contra el Sheet de prueba, que siempre es solo reporte. La función contesta al
// momento y sigue en segundo plano con runSync de verdad, el Google de mentira y el Sheet despues.json de
// tests/fixtures/bank-sheet. Al actualizar, la corrida dice cómo terminó y cada renglón con algo que
// corregir trae su frase y su acción, con el CSV que las junta. Nada se escribe en el banco. Apagada, la
// sincronización no corre y lo dice.
import { readFile } from 'node:fs/promises';
import { SCREENS } from '@/app/screens';
import { rowLabel, rowMessages } from '@/features/admin/syncReport';
import { incompleteText } from '@/features/physician/reviewTexts';
import { bankAdminText } from '@/i18n/bankAdmin';
import { t } from '@/i18n/es-MX';
import { enterTeam, teamBank } from '../support/bankTeam';
import { expect, test } from '../support/cloudFixtures';
import { settleSyncRuns } from '../support/fakeEditorial';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const text = bankAdminText.sync;
const ADMIN = { email: 'admin@ejemplo.mx', alias: 'Admin', role: 'admin' } as const;

test.describe('Sincronización con el Sheet', () => {
  test('el admin sincroniza contra el Sheet de prueba y lee el reporte de renglones', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(120_000);
    const { bank } = teamBank(cloud, [ADMIN]);
    bank.settings.bankSync.enabled = true;
    cloud.setSetting('bank_sync', { ...bank.settings.bankSync });

    await enterTeam(page, cloud, ADMIN.email);
    await page.goto(SCREENS.bankAdmin.path);
    await expect(
      page.getByRole('heading', { level: 1, name: t.screens.bankAdmin.title }),
    ).toBeVisible();
    const card = page.getByRole('region', { name: text.title });
    await expect(card.getByText(text.enabled)).toBeVisible({ timeout: 30_000 });
    await expect(card.getByRole('combobox', { name: text.target })).toHaveValue('test');
    await card.getByRole('button', { name: text.now }).click();
    await expect(card.getByText(text.started)).toBeVisible();

    // La corrida termina en segundo plano. Actualizar trae cómo terminó y sus renglones
    await settleSyncRuns(bank);
    const [run] = bank.syncRuns;
    expect(run).toMatchObject({ target: 'test', mode: 'dry_run', status: 'partial' });
    await card.getByRole('button', { name: text.refresh }).click();
    await expect(card.getByText(text.run.status.partial ?? '')).toBeVisible();
    const rows = page.getByRole('region', { name: text.run.selected });
    const rejected = run?.rows.find((row) => row.outcome === 'rejected' && row.problems.length > 0);
    if (!rejected) throw new Error('El Sheet de prueba no tiene renglones rechazados');
    const [message] = rowMessages(rejected, incompleteText);
    await expect(rows.getByText(text.rows.line(rowLabel(rejected), message ?? ''))).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // El CSV junta los mismos renglones, con BOM para que Excel lea los acentos
    const download = page.waitForEvent('download');
    await rows.getByRole('button', { name: text.rows.csv }).click();
    const csv = await readFile(await (await download).path(), 'utf8');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain(rejected.sheetKey ?? '');

    // Solo reporte. Ninguna pregunta llegó al banco
    expect(bank.questions.size).toBe(0);
  });

  test('apagada no corre y lo dice', async ({ page, cloud }) => {
    test.setTimeout(120_000);
    const { bank } = teamBank(cloud, [ADMIN]);
    cloud.setSetting('bank_sync', { ...bank.settings.bankSync });

    await enterTeam(page, cloud, ADMIN.email);
    await page.goto(SCREENS.bankAdmin.path);
    const card = page.getByRole('region', { name: text.title });
    await expect(card.getByText(text.disabled)).toBeVisible({ timeout: 30_000 });
    await card.getByRole('button', { name: text.now }).click();
    await expect(card.getByText(text.skipped(text.reasons.disabled ?? ''))).toBeVisible();
    expect(bank.syncRuns).toEqual([
      expect.objectContaining({ status: 'skipped', reason: 'disabled' }),
    ]);
  });
});
