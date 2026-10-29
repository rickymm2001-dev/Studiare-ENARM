// Plan Gratis (B8 del plan del cambio, respuestas 18, 19 y 20, 4.3 y 4.25). En Gratis Party, subir
// mazos, seguir mazos nuevos del catálogo y Apuntes llevan su candado con una vista previa y el botón
// que lleva a Suscripción, que dice Ver planes hasta que exista la prueba de 7 días (B10). Comparte tu
// semana y la tarjeta de referidos siguen abiertas. Con un plan de pago todo se abre, y al volver a
// Gratis lo que el alumno ya tenía sigue a su alcance. Gratis contesta 20 preguntas al día con su
// explicación después de contestar. Corre en teléfono y en computadora con los dos proyectos de
// Playwright. Party en la nube con el plan del servidor está en tests/e2e/cloud/free-plan.spec.ts
import { SCREENS } from '@/app/screens';
import { billingCloudText } from '@/i18n/billingCloud';
import { t } from '@/i18n/es-MX';
import { openPracticeSetup, setPracticeFeedback, subscribeMonthly } from './support/b1';
import {
  expect,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  signUp,
  test,
} from './support/fixtures';

const SMALL = 'Urgencias (Paco)';
const BIG = 'Medicina interna (Paco)';
const CLOSED_IN_FREE = ['outlines', 'deckCatalog', 'importDecks', 'party'] as const;
const DAY_MS = 86_400_000;
const cancelDialog = billingCloudText.cancelDialog;
/** La línea de cancelado sin su fecha, que depende de la zona horaria del proyecto */
const CANCELED_PREFIX = billingCloudText.status.canceled('X').split('X')[0]?.trim() ?? '';

test('en Gratis cada candado muestra su vista previa y su botón lleva a los planes', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);

  // Party. Grupos, tabla, retos y duelos quedan detrás del candado. Comparte tu semana y los
  // referidos siguen abiertos (4.3)
  await page.goto(SCREENS.party.path);
  const party = page.getByRole('region', { name: t.freePlan.party.title });
  await expect(party).toBeVisible();
  for (const point of t.freePlan.party.points) {
    await expect(party.getByText(point)).toBeVisible();
  }
  await expect(party.getByRole('link', { name: t.billing.featureSeePlans })).toBeVisible();
  await expect(page.getByRole('region', { name: t.b7.weekShare.title })).toBeVisible();
  await expect(page.getByRole('region', { name: t.b7.referral.title })).toBeVisible();
  await expect(page.getByRole('region', { name: t.party.createTitle })).toHaveCount(0);
  await expect(page.getByRole('region', { name: t.partyCloud.needsCloud.title })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);

  // Inicio. El reto de Party lleva el aviso corto del candado
  await page.goto(SCREENS.home.path);
  const widget = page.getByRole('region', { name: t.widgets.names.party_challenge });
  await expect(widget.getByText(t.freePlan.widget)).toBeVisible();
  await expect(widget.getByRole('link', { name: t.billing.featureSeePlans })).toBeVisible();

  // Mazos. El catálogo queda como vista previa, sin seguir mazos nuevos, y subir mazos también
  await page.goto(SCREENS.decks.path);
  const catalog = page.getByRole('region', { name: t.decks.preloadedTitle });
  await expect(catalog.getByText(t.freePlan.catalog.notice)).toBeVisible({ timeout: 30_000 });
  // Urgencias va abierto en Gratis (V4-B8). Los demás mazos nuevos llevan el candado
  const small = catalog.getByRole('listitem').filter({ hasText: SMALL });
  await expect(small.getByRole('button', { name: t.decks.follow })).toBeEnabled({
    timeout: 30_000,
  });
  await expect(small.getByText(t.freePlan.catalog.rowLocked)).toHaveCount(0);
  const bigRow = catalog.getByRole('listitem').filter({ hasText: BIG });
  await expect(bigRow.getByText(t.freePlan.catalog.rowLocked)).toBeVisible();
  await expect(catalog.getByRole('button', { name: t.decks.follow })).toHaveCount(1);
  const upload = page.getByRole('region', { name: t.freePlan.importDecks.title });
  await expect(upload).toBeVisible();
  for (const point of t.freePlan.importDecks.points) {
    await expect(upload.getByText(point)).toBeVisible();
  }
  await expect(page.getByLabel(t.importer.fileLabel)).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);

  // Apuntes sigue con su candado (B6)
  await page.goto(SCREENS.outlines.path);
  await expect(page.getByRole('region', { name: t.outlines.locked.title })).toBeVisible();

  // La tabla de planes dice lo mismo que los candados
  await page.goto(SCREENS.subscription.path);
  const free = page.getByRole('region', { name: t.billing.plans.free, exact: true });
  const monthly = page.getByRole('region', { name: t.billing.plans.monthly, exact: true });
  for (const lock of CLOSED_IN_FREE) {
    const label = t.billing.access[lock];
    await expect(free.getByRole('listitem').filter({ hasText: label })).toContainText(
      t.billing.notIncluded,
    );
    await expect(monthly.getByRole('listitem').filter({ hasText: label })).not.toContainText(
      t.billing.notIncluded,
    );
  }

  // El botón del candado lleva a Suscripción
  await page.goto(SCREENS.party.path);
  await party.getByRole('link', { name: t.billing.featureSeePlans }).click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.subscription.path}$`));
});

test('con un plan de pago se abren Party, el catálogo y subir mazos, y al volver a Gratis lo seguido se queda', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signUp(page);
  await subscribeMonthly(page);

  // Party. Sin la nube lo que falta ya no es el plan
  await page.goto(SCREENS.party.path);
  await expect(page.getByRole('region', { name: t.partyCloud.needsCloud.title })).toBeVisible();
  await expect(page.getByRole('region', { name: t.freePlan.party.title })).toHaveCount(0);
  await page.goto(SCREENS.home.path);
  await expect(
    page
      .getByRole('region', { name: t.widgets.names.party_challenge })
      .getByText(t.widgets.party.empty),
  ).toBeVisible();

  // Mazos. Se sube un mazo y se sigue el mazo chico del catálogo
  await page.goto(SCREENS.decks.path);
  await expect(page.getByRole('heading', { name: t.importer.title })).toBeVisible();
  await expect(page.getByText(t.freePlan.catalog.notice)).toHaveCount(0);
  const small = page.getByRole('listitem').filter({ hasText: SMALL });
  await small.getByRole('button', { name: t.decks.follow }).click();
  await expect(small.getByRole('button', { name: t.decks.unfollow })).toBeVisible({
    timeout: 60_000,
  });

  // Cancela el pago simulado. El botón vive en Tu suscripción y nunca en la tarjeta de Gratis, un clic
  // solo abre el diálogo de confirmación y el plan sigue hasta el fin de su periodo (V5-B0). Al pasar
  // esa fecha, con el reloj fijo un mes y pico adelante, vuelve a Gratis
  await page.goto(SCREENS.subscription.path);
  await expect(
    page
      .getByRole('region', { name: t.billing.plans.free, exact: true })
      .getByRole('button', { name: t.billing.cancel }),
  ).toHaveCount(0);
  await page
    .getByRole('region', { name: t.billing.manage.title })
    .getByRole('button', { name: t.billing.cancel })
    .click();
  const warning = page.getByRole('alertdialog', { name: cancelDialog.title });
  await expect(warning.getByText(t.billing.access.party)).toBeVisible();
  await warning.getByRole('button', { name: cancelDialog.confirm }).click();
  await expect(page.getByText(CANCELED_PREFIX, { exact: false })).toBeVisible();
  await expect(
    page.getByRole('region', { name: t.billing.current(t.billing.plans.monthly) }),
  ).toBeVisible();
  await page.clock.setFixedTime(new Date(Date.now() + 32 * DAY_MS));

  // Lo que ya tenía se queda. El mazo que sigue se deja y se vuelve a seguir, porque está en el
  // dispositivo. Los mazos nuevos y subir mazos vuelven a su candado
  await page.goto(SCREENS.decks.path);
  await expect(page.getByText(t.freePlan.catalog.notice)).toBeVisible({ timeout: 30_000 });
  await expect(small.getByRole('button', { name: t.decks.unfollow })).toBeVisible();
  const big = page.getByRole('listitem').filter({ hasText: BIG });
  await expect(big.getByText(t.freePlan.catalog.rowLocked)).toBeVisible();
  await small.getByRole('button', { name: t.decks.unfollow }).click();
  await small.getByRole('button', { name: t.decks.follow }).click();
  await expect(small.getByRole('button', { name: t.decks.unfollow })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole('region', { name: t.freePlan.importDecks.title })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Sus tarjetas siguen en Repasar y Party vuelve a su candado
  await page.goto(SCREENS.review.path);
  await expect(page.getByRole('button', { name: /^Repasar [\d,]+ tarjetas?$/ })).toBeVisible({
    timeout: 30_000,
  });
  await page.goto(SCREENS.party.path);
  await expect(page.getByRole('region', { name: t.freePlan.party.title })).toBeVisible();
});

test('en Gratis hay 20 preguntas al día y la explicación sale después de contestar', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);
  // Respuesta 19. La retroalimentación después de cada pregunta se elige en Ajustes del repaso, y
  // Simular solo la muestra (B3 del plan del cambio)
  await setPracticeFeedback(page, 'each');
  const setup = await openPracticeSetup(page, { count: 5 });
  // Respuesta 18. 20 preguntas al día, y la nota del plan dice cuántas quedan hoy
  await expect(setup.getByText(t.simulator.freeNote(20, 20))).toBeVisible();

  // Con esa retroalimentación la explicación sale al contestar
  const start = setup.getByRole('button', { name: t.simulator.start });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByText(t.simulator.progress(1, 5), { exact: true })).toBeVisible();
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: t.simulator.answer, exact: true }).click();
  await expect(page.getByRole('region', { name: t.simulator.explanation })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});
