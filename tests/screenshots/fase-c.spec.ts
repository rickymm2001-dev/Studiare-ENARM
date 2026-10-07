// Capturas de la Fase C (15.1 paso 2). Las pantallas del alumno con la demostración y los flujos de
// práctica, examen, mazos propios y Party con duelo y tarjeta de logro. Teléfono y escritorio, en
// claro y oscuro. Las imágenes quedan en docs/screenshots/fase-c, en JPEG para no pesar de más.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { examTotalMs } from '@/engines/exam';
import { t } from '@/i18n/es-MX';
import { signUp } from '../e2e/support/fixtures';

const OUT_DIR = join(import.meta.dirname, '..', '..', 'docs', 'screenshots', 'fase-c');
mkdirSync(OUT_DIR, { recursive: true });

async function capture(page: Page, name: string, projectName: string) {
  // Espera a que lo que carga termine y a que el modo de IA deje de decir revisando
  await page
    .getByText(t.ai.badge.checking)
    .waitFor({ state: 'detached' })
    .catch(() => undefined);
  await page
    .getByText(t.states.loading.label, { exact: true })
    .waitFor({ state: 'detached' })
    .catch(() => undefined);
  await page.waitForLoadState('networkidle');
  // En la captura de página completa una barra fija sale a media imagen. Solo para la captura, la
  // barra del teléfono se pega al final de la página, que es donde la ve el alumno
  await page.addStyleTag({
    content: `@media (max-width: 1023px) { nav[aria-label="${t.nav.label}"] { position: static !important; } }`,
  });
  await page.screenshot({
    path: join(OUT_DIR, `${name}--${projectName}.jpg`),
    type: 'jpeg',
    quality: 78,
    fullPage: true,
  });
}

/** Una respuesta de práctica con la primera opción y la confianza Dudé */
async function answerPractice(page: Page, last: boolean) {
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: t.simulator.confidence.unsure }).click();
  await page.getByRole('button', { name: t.simulator.answer, exact: true }).click();
  await page.getByRole('button', { name: last ? t.simulator.finish : t.simulator.next }).waitFor();
}

test('pantallas del alumno con la demostración', async ({ page }, info) => {
  test.setTimeout(300_000);
  const project = info.project.name;
  await page.goto(`${SCREENS.settings.path}?seccion=account`);
  await page.getByRole('radio', { name: new RegExp(t.database.demo) }).click();
  const panel = page.getByRole('region', { name: t.demoData.title });
  await panel.getByRole('button', { name: t.demoData.generate }).click();
  await expect(panel.getByRole('status')).toHaveText(/Listo\. Se guardaron/, { timeout: 200_000 });

  // Inicio con el acomodo Analítico y la última hipótesis del tutor
  await page.goto('/');
  await page.getByRole('button', { name: t.home.edit }).click();
  await page.getByLabel(t.home.presetLabel).selectOption('analytic');
  await page.getByLabel(t.home.addLabel).selectOption('latest_hypothesis');
  await page.getByRole('button', { name: t.home.add, exact: true }).click();
  await page.getByRole('button', { name: t.home.doneEditing }).click();
  await page
    .getByRole('region', { name: t.widgets.names.latest_hypothesis })
    .getByText(t.tutor.confirmedBadge)
    .waitFor({ timeout: 60_000 });
  await capture(page, '01-inicio-analitico', project);

  const screens: [string, string, string][] = [
    ['02-repasar', SCREENS.review.path, t.screens.review.title],
    ['03-simular', SCREENS.simulatorSetup.path, t.screens.simulatorSetup.title],
    ['04-progreso', SCREENS.progress.path, t.screens.progress.title],
    ['05-plan', SCREENS.planner.path, t.screens.planner.title],
    ['06-tutor', SCREENS.tutor.path, t.screens.tutor.title],
    ['07-mazos', SCREENS.decks.path, t.screens.decks.title],
    ['08-perfil', SCREENS.profile.path, t.screens.profile.title],
    ['09-configuracion', SCREENS.settings.path, t.screens.settings.title],
    ['10-suscripcion', SCREENS.subscription.path, t.screens.subscription.title],
  ];
  for (const [name, path, title] of screens) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    if (name === '06-tutor') {
      await page.getByRole('region', { name: t.tutor.report.title }).waitFor({ timeout: 60_000 });
    }
    if (name === '03-simular') {
      await page.getByRole('region', { name: t.exam.cardTitle }).waitFor({ timeout: 60_000 });
    }
    if (name === '04-progreso') {
      await page
        .getByRole('region', { name: t.progress.futureLoad.title })
        .waitFor({ timeout: 60_000 });
    }
    await capture(page, name, project);
  }
});

test('práctica con pregunta, retroalimentación y resumen', async ({ page }, info) => {
  test.setTimeout(300_000);
  const project = info.project.name;
  await signUp(page);

  // Práctica de 5 preguntas
  await page.goto(SCREENS.simulatorSetup.path);
  const practice = page.getByRole('region', { name: t.simulator.setupTitle });
  await practice.getByRole('combobox', { name: t.simulator.count, exact: true }).selectOption('5');
  const start = practice.getByRole('button', { name: t.simulator.start });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  await expect(page.getByText(t.simulator.progress(1, 5))).toBeVisible();
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: t.simulator.confidence.unsure }).click();
  await capture(page, '11-pregunta', project);
  await page.getByRole('button', { name: t.simulator.answer, exact: true }).click();
  await page.getByRole('button', { name: t.simulator.next }).waitFor();
  await capture(page, '12-retroalimentacion', project);
  for (let index = 2; index <= 5; index += 1) {
    await page.getByRole('button', { name: t.simulator.next }).click();
    await answerPractice(page, index === 5);
  }
  await page.getByRole('button', { name: t.simulator.finish }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.sessionSummary.title);
  await capture(page, '13-resumen', project);
});

// Aparte de la práctica porque el plan Gratis deja 20 preguntas al día y el examen usa las 20
test('examen completo y resultados', async ({ page }, info) => {
  test.setTimeout(300_000);
  const project = info.project.name;
  await signUp(page);
  await page.goto(SCREENS.simulatorSetup.path);
  const card = page.getByRole('region', { name: t.exam.cardTitle });
  await expect(card.getByText(t.exam.timeTotal(examTotalMs(20)))).toBeVisible({ timeout: 60_000 });
  await capture(page, '14-simular-examen', project);
  await card.getByRole('button', { name: t.exam.start }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: t.choice.discardOption('C') }).click();
  await page.getByRole('button', { name: t.exam.mark }).click();
  await capture(page, '15-examen', project);
  for (let index = 2; index <= 20; index += 1) {
    await page.getByRole('button', { name: t.exam.next, exact: true }).click();
    await page.getByRole('radio').first().check();
  }
  await page.getByRole('button', { name: t.exam.finish }).click();
  await page.getByRole('dialog').getByRole('button', { name: t.exam.finishConfirm }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.examResults.title);
  // Primero el resumen, porque durante la carga todavía no dice que guarda y la espera pasaría de largo
  await expect(page.getByRole('region', { name: t.examResults.summaryTitle })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(t.examResults.saving)).toHaveCount(0, { timeout: 60_000 });
  await capture(page, '16-examen-resultados', project);
});

test('mazos propios y Party con duelo y tarjeta de logro', async ({ page }, info) => {
  test.setTimeout(300_000);
  const project = info.project.name;
  await signUp(page);

  // Un mazo propio con una tarjeta básica y una con hueco
  await page.goto(SCREENS.decks.path);
  const own = page.getByRole('region', { name: t.decks.yoursTitle });
  await own.getByLabel(t.decks.nameLabel).fill('Nefrología de la residencia');
  await own.getByRole('button', { name: t.decks.createButton }).click();
  const dialog = page.getByRole('dialog', {
    name: t.decks.editor.title('Nefrología de la residencia'),
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel(t.decks.editor.front, { exact: true })
    .fill('¿Qué mide la tasa de filtrado glomerular?');
  await dialog
    .getByLabel(t.decks.editor.back, { exact: true })
    .fill('Cuánta sangre filtran los riñones por minuto');
  await dialog.getByRole('button', { name: t.decks.editor.save }).click();
  await expect(dialog.getByText(t.decks.editor.saved)).toBeVisible();
  await capture(page, '17-mazo-editor', project);
  await dialog.getByRole('button', { name: t.decks.editor.close }).click();

  // Party. Grupo con compañeros simulados, duelo pendiente, duelo jugado y tarjeta de logro
  await page.goto(SCREENS.party.path);
  await page.getByLabel(t.party.groupName).fill('Guardia de los viernes');
  await page.getByRole('button', { name: t.party.create }).click();
  const group = page.getByRole('region', { name: 'Guardia de los viernes' });
  await expect(group).toBeVisible();
  await group.getByRole('button', { name: t.party.duel.newButton }).click();
  await group.getByLabel(t.party.duel.rival).selectOption({ label: 'Diego M.' });
  await group.getByRole('button', { name: t.party.duel.create }).click();
  await expect(
    group.getByRole('listitem').filter({ hasText: t.party.duel.title('Diego M.') }),
  ).toBeVisible({ timeout: 60_000 });
  await capture(page, '18-party-duelo-pendiente', project);

  await group.getByRole('button', { name: t.party.duel.play }).click();
  await expect(page.getByText(t.simulator.progress(1, 20))).toBeVisible();
  for (let index = 1; index <= 20; index += 1) {
    await page.getByRole('radio').first().check();
    await page.getByRole('button', { name: t.simulator.confidence.sure }).click();
    await page.getByRole('button', { name: t.simulator.answer, exact: true }).click();
    await page
      .getByRole('button', { name: index === 20 ? t.simulator.finish : t.simulator.next })
      .click();
  }
  await page.getByRole('link', { name: t.party.duel.seeResult }).click();
  await expect(
    page
      .getByRole('region', { name: 'Guardia de los viernes' })
      .getByRole('listitem')
      .filter({ hasText: t.party.duel.title('Diego M.') })
      .getByRole('table'),
  ).toBeVisible({ timeout: 30_000 });
  await capture(page, '19-party-duelo-resultado', project);
});
