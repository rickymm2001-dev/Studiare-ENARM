// Calibración del admin y Acuerdo noche por noche del médico (B14, 7.2 y 8.4 del plan de B14). Corre contra el
// Supabase simulado con el modelo en memoria de tests/e2e/support/fakeModelStore.ts, que deja las corridas ya
// hechas como las dejaría calibration_finish, y las funciones admin_calibration_runs y editor_agreement_history
// de tests/e2e/support/fakeCalibrationAdmin.ts. La calibración nocturna no corre aquí. Todo es simulado.
// Cubre las corridas con su estado y su enlace a GitHub, el aviso de más de 48 horas, el cambio a Publicar con
// su confirmación, la paridad falsa y la sección Modelo del alumno y calibración de Plataforma con el piso de 30.
import type { BrowserContext, Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { calibrationAdminTexts } from '@/i18n/calibrationAdmin';
import { t } from '@/i18n/es-MX';
import { enterTeam, teamBank, type TeamMember } from '../support/bankTeam';
import { expect, test } from '../support/cloudFixtures';
import { attachCalibrationAdmin } from '../support/fakeCalibrationAdmin';
import { createFakeModelStore, emptyPopulation, seedRuns } from '../support/fakeModelStore';
import { attachModel, type FakeSupabaseServer } from '../support/fakeSupabase';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const text = calibrationAdminTexts;
const ADMIN: TeamMember = { email: 'admin@ejemplo.mx', alias: 'Admin', role: 'admin' };
const PHYSICIAN: TeamMember = { email: 'medica@ejemplo.mx', alias: 'Carla', role: 'physician' };

/** El equipo, el modelo en memoria y las dos funciones de la calibración enganchados a la nube de la prueba */
async function setup(context: BrowserContext, cloud: FakeSupabaseServer) {
  teamBank(cloud, [ADMIN, PHYSICIAN]);
  const model = createFakeModelStore();
  attachModel(cloud, model);
  const hooks = await attachCalibrationAdmin(context, cloud, model);
  return { model, hooks };
}

async function openCalibration(page: Page, cloud: FakeSupabaseServer) {
  await enterTeam(page, cloud, ADMIN.email);
  await page.goto(SCREENS.calibrationAdmin.path);
  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.calibrationAdmin.title }),
  ).toBeVisible({ timeout: 20_000 });
}

const card = (page: Page, name: string) => page.getByRole('region', { name });

test.describe('Calibración del admin', () => {
  test('el admin ve la última corrida, sus corridas con el enlace a GitHub y lo que publica', async ({
    page,
    cloud,
    context,
  }) => {
    test.setTimeout(120_000);
    const { model, hooks } = await setup(context, cloud);
    seedRuns(model, { lastOkHoursAgo: 3, count: 5 });
    model.itemCounts = { physician_estimate: 260, provisional: 30, calibrated: 10 };
    model.population = {
      ...emptyPopulation(),
      available: true,
      runAt: new Date().toISOString(),
      topics: {
        'pediatrics/neonatology': { students: 96, accuracy: 0.58, difficulty: 0.31 },
        'internal_medicine/cardiology': { students: 20, accuracy: 0.3, difficulty: 0.9 },
      },
      motives: { pediatrics: { reports: 830, knowledge: 0.41, time: 0.08, fatigue: 0.06 } },
      fatigue: { state: 'calibrating', students: 25, longSessions: 120 },
    };
    await openCalibration(page, cloud);

    // Última corrida
    const status = card(page, text.status.title);
    await expect(status.getByText(text.runStatus.ok as string)).toBeVisible();
    await expect(status.getByText('Solo reporte · Programada')).toBeVisible();
    await expect(status.getByText(/Empezó el .*, hace 3 horas\./)).toBeVisible();
    await expect(status.getByText(text.status.switchOff)).toBeVisible();
    await expect(status.getByText(text.status.publication.none)).toBeVisible();
    // Una corrida de hace 3 horas no trae el aviso de las 48 horas
    await expect(page.getByText(text.status.stale.title)).toHaveCount(0);

    // Corridas, la más reciente primero, con sus conteos y el enlace por su número
    const runs = card(page, text.runs.title);
    await expect(runs.getByRole('listitem')).toHaveCount(5);
    const first = runs.getByRole('listitem').first();
    await expect(first.getByText(/412 alumnos con permiso/)).toBeVisible();
    const link = first.getByRole('link', { name: text.runs.github('9000005') });
    await expect(link).toHaveAttribute(
      'href',
      'https://github.com/rickymm2001-dev/Studiare-ENARM/actions/runs/9000005',
    );
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);

    // Lo que publica: preguntas por estado, los temas con 30 alumnos o más y los motivos
    const overview = card(page, text.overview.title);
    await expect(overview.getByText('260 de 300')).toBeVisible();
    await expect(overview.getByText('Pediatría, Neonatología')).toBeVisible();
    await expect(overview.getByText('58 % de acierto con 96 alumnos')).toBeVisible();
    // El tema de 20 alumnos no sale: la base solo muestra datos de 30 o más
    await expect(overview.getByText('Medicina interna, Cardiología')).toHaveCount(0);
    await expect(
      overview.getByText('830 reportes · Conocimiento 41 % · Tiempo 8 % · Fatiga 6 %'),
    ).toBeVisible();
    await expect(overview.getByText(text.overview.fatigue.calibrating(25, 30))).toBeVisible();
    await expect(overview.getByText(text.overview.agreement.match)).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // La pantalla pidió las 30 corridas al servidor con el rol de admin
    expect(hooks.calls).toContainEqual({
      name: 'admin_calibration_runs',
      args: { p_limit: 30 },
      role: 'admin',
      status: 200,
    });
  });

  test('avisa si pasaron más de 48 horas sin una corrida buena y dice cómo volver a prenderla', async ({
    page,
    cloud,
    context,
  }) => {
    test.setTimeout(120_000);
    const { model } = await setup(context, cloud);
    seedRuns(model, { lastOkHoursAgo: 60, count: 3 });
    // Encendida. Si el admin la apagó a propósito no hay nada que avisar (revisión de B14, hallazgo 8)
    model.settings.calibration.enabled = true;
    await openCalibration(page, cloud);

    const notice = page.getByRole('status').filter({ hasText: text.status.stale.title });
    await expect(notice).toBeVisible();
    await expect(
      notice.getByText(/La última corrida buena fue (anteayer|hace 2 días)\./),
    ).toBeVisible();
    for (const step of text.status.stale.steps) await expect(notice.getByText(step)).toBeVisible();
    await expect(notice.getByRole('link', { name: text.status.stale.open })).toHaveAttribute(
      'href',
      /\/actions\/workflows\/calibration\.yml$/,
    );
    await expectNoSeriousA11yViolations(page);
  });

  test('apagada a propósito no avisa de las 48 horas ni manda a prenderla en GitHub', async ({
    page,
    cloud,
    context,
  }) => {
    test.setTimeout(120_000);
    const { model } = await setup(context, cloud);
    seedRuns(model, { lastOkHoursAgo: 60, count: 3 });
    await openCalibration(page, cloud);

    const status = card(page, text.status.title);
    await expect(status.getByText(text.status.switchOff)).toBeVisible();
    await expect(page.getByText(text.status.stale.title)).toHaveCount(0);
    await expect(page.getByRole('link', { name: text.status.stale.open })).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);
  });

  test('sin corridas explica que puede faltar la llave y no inventa cifras', async ({
    page,
    cloud,
    context,
  }) => {
    test.setTimeout(120_000);
    await setup(context, cloud);
    await openCalibration(page, cloud);

    const status = card(page, text.status.title);
    await expect(status.getByText(text.status.noRuns)).toBeVisible();
    await expect(status.getByText(text.status.noRunsHelp)).toBeVisible();
    await expect(card(page, text.runs.title).getByText(text.runs.empty)).toBeVisible();
    await expect(card(page, text.overview.title).getByText(text.overview.none)).toBeVisible();
    await expect(page.getByText(text.status.stale.title)).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);
  });

  test('encender la calibración en Solo reporte guarda sin pedir confirmación', async ({
    page,
    cloud,
    context,
  }) => {
    test.setTimeout(120_000);
    const { model, hooks } = await setup(context, cloud);
    seedRuns(model, { count: 2 });
    await openCalibration(page, cloud);

    const control = card(page, text.control.title);
    const enabled = control.getByRole('checkbox', { name: text.control.enabled });
    await expect(enabled).not.toBeChecked();
    await expect(control.getByRole('button', { name: text.control.save })).toBeDisabled();
    await enabled.check();
    await control.getByRole('button', { name: text.control.save }).click();
    await expect(control.getByText(text.control.saved)).toBeVisible();

    // Quedó guardado en model_settings, con la versión del aviso que ya tenía, y la pantalla lo lee de vuelta
    expect(hooks.savedSettings.at(-1)).toMatchObject({
      calibration: { enabled: true, mode: 'dry_run', minNoticeVersion: '2026-10-15b' },
    });
    expect(model.settings.calibration).toMatchObject({ enabled: true, mode: 'dry_run' });
    await expect(card(page, text.status.title).getByText(text.status.switchOn)).toBeVisible();
  });

  test('pasar a Publicar pide confirmación, guarda en model_settings y la pantalla lo muestra', async ({
    page,
    cloud,
    context,
  }) => {
    test.setTimeout(120_000);
    const { model, hooks } = await setup(context, cloud);
    model.settings.calibration.enabled = true;
    seedRuns(model, { count: 3 });
    await openCalibration(page, cloud);

    const control = card(page, text.control.title);
    await control.getByRole('button', { name: text.modes.apply as string }).click();
    await expect(control.getByText(text.control.modeHint.apply as string)).toBeVisible();
    await control.getByRole('button', { name: text.control.save }).click();

    // Publicar cambia lo que ven los alumnos, así que antes pide confirmación y no guarda nada
    await expect(control.getByText(text.control.confirm)).toBeVisible();
    expect(hooks.savedSettings).toHaveLength(0);
    await expectNoSeriousA11yViolations(page);
    await control.getByRole('button', { name: text.control.cancel }).click();
    expect(hooks.savedSettings).toHaveLength(0);

    await control.getByRole('button', { name: text.control.save }).click();
    await control.getByRole('button', { name: text.control.confirmYes }).click();
    await expect(control.getByText(text.control.saved)).toBeVisible();
    expect(hooks.savedSettings.at(-1)).toMatchObject({
      calibration: { enabled: true, mode: 'apply' },
    });
    expect(model.settings.calibration.mode).toBe('apply');
    const status = card(page, text.status.title);
    await expect(status.getByText(text.modes.apply as string).first()).toBeVisible();
    await expect(status.getByText(text.status.switchOn)).toBeVisible();
  });

  test('una paridad que falla se dice en la corrida, en el resumen y en el historial de Acuerdo', async ({
    page,
    cloud,
    context,
  }) => {
    test.setTimeout(180_000);
    const { model } = await setup(context, cloud);
    seedRuns(model, { count: 4, parity: false });
    await openCalibration(page, cloud);

    // La corrida de esa noche terminó con aviso y dice por qué
    const runs = card(page, text.runs.title);
    const newest = runs.getByRole('listitem').first();
    await expect(newest.getByText(text.runStatus.partial as string)).toBeVisible();
    await expect(newest.getByText(text.reasons.kappa_mismatch as string)).toBeVisible();
    await expect(
      card(page, text.overview.title).getByText(text.overview.agreement.mismatch),
    ).toBeVisible();

    // La médica ve la misma noche en el historial de Acuerdo, con la paridad y el aviso
    await page.goto('about:blank');
    await enterTeam(page, cloud, PHYSICIAN.email);
    await page.goto(SCREENS.agreement.path);
    const history = card(page, text.agreementHistory.title);
    const table = history.getByRole('table');
    await expect(table).toBeVisible({ timeout: 30_000 });
    const rows = table.getByRole('row');
    // Encabezado y 4 noches. La más reciente no coincide y las demás sí
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(1).getByText(text.agreementHistory.parityMismatch)).toBeVisible();
    await expect(rows.nth(2).getByText(text.agreementHistory.parityMatch)).toBeVisible();
    await expect(rows.nth(1).getByRole('rowheader')).toContainText(/\d+ de [a-záéíóú]+/);
    await expect(history.getByText(text.agreementHistory.mismatchNote)).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});

test.describe('Modelo del alumno y calibración en Plataforma', () => {
  test('minGroupSize no baja de 30, lo demás se guarda sin perder la calibración y Optimizar FSRS dice Sin uso', async ({
    page,
    cloud,
    context,
  }) => {
    test.setTimeout(180_000);
    const { model, hooks } = await setup(context, cloud);
    model.settings.calibration.enabled = true;
    await enterTeam(page, cloud, ADMIN.email);
    await page.goto(SCREENS.adminSettings.path);
    const settings = card(page, text.settings.title);
    await expect(settings).toBeVisible({ timeout: 30_000 });

    // Lee los ajustes que publicó el servidor
    const group = settings.getByLabel(text.settings.fields.minGroupSize?.label ?? '');
    await expect(group).toHaveValue('30');
    await expect(
      settings.getByLabel(text.settings.fields.minBranchAnswers?.label ?? ''),
    ).toHaveValue('20');

    // Con menos de 30 no se guarda: el campo lo dice y no sale ningún cambio al servidor
    await group.fill('10');
    await expect(settings.getByText(text.settings.errors.floor).first()).toBeVisible();
    await settings.getByRole('button', { name: text.settings.save }).click();
    await expect(settings.getByText(text.settings.invalid)).toBeVisible();
    expect(hooks.savedSettings).toHaveLength(0);
    await expectNoSeriousA11yViolations(page);

    // Con 30 y otro cambio, sí. Guarda solo lo que cambió y conserva la calibración
    await group.fill('30');
    await settings.getByLabel(text.settings.fields.minBranchAnswers?.label ?? '').fill('25');
    await settings.getByRole('checkbox', { name: text.settings.features.adaptive.label }).uncheck();
    await settings.getByRole('button', { name: text.settings.save }).click();
    await expect(settings.getByText(text.settings.saved)).toBeVisible();
    const saved = hooks.savedSettings.at(-1);
    expect(saved).toMatchObject({
      calibration: { enabled: true, mode: 'dry_run' },
      features: { adaptive: false },
      thresholds: { minGroupSize: 30, minBranchAnswers: 25 },
    });
    expect(model.settings.features.adaptive).toBe(false);
    expect(model.settings.minGroupSize).toBe(30);

    // Volver a cargar la pantalla lee lo guardado
    await page.reload();
    const again = card(page, text.settings.title);
    await expect(again.getByLabel(text.settings.fields.minBranchAnswers?.label ?? '')).toHaveValue(
      '25',
      { timeout: 30_000 },
    );
    await expect(
      again.getByRole('checkbox', { name: text.settings.features.adaptive.label }),
    ).not.toBeChecked();

    // Optimizar FSRS por alumno no se usa y la pantalla lo dice
    const unused = page.getByLabel('Optimizar FSRS por alumno (Sin uso)');
    await expect(unused).toBeDisabled();
    await expect(page.getByText(/^Sin uso\. FSRS va de fábrica para todos/)).toBeVisible();
  });
});
