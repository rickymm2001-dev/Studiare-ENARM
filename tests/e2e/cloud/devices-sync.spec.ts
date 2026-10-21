// Dos dispositivos con la misma cuenta (B14, 2 y 8.4 del plan de B14, D-095). Un solo navegador no prueba
// que lo que se sincroniza llegue de verdad, así que aquí hay dos. En el primero cambia un ajuste del repaso,
// sigue un mazo, da el permiso de mejora, falla una pregunta y captura su puntaje oficial. El segundo toma la
// cuenta y ve los mismos ajustes, el mazo seguido, el permiso, un solo Mis errores con la tarjeta y el mismo
// historial en Progreso y en el Tutor. Falla las mismas preguntas y Mis errores no se duplica. El primero
// vuelve a tomar la cuenta y ve lo que cambió el segundo. El puntaje oficial no viaja entre dispositivos
// (D-101), porque el número no entra a la bitácora. Lo que sí viaja es que retirar el permiso lo borra donde
// esté, y eso también se prueba. Corre contra el Supabase simulado con el banco de
// tests/e2e/support/fakeBank.ts. Todo el texto es simulado.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { consentTexts } from '@/i18n/consents';
import { t } from '@/i18n/es-MX';
import { studentSyncTexts } from '@/i18n/studentSync';
import { escapeRegExp, reviewSettingsPanel } from '../support/b1';
import {
  enterWithLink,
  expect,
  expectHome,
  openEmailLink,
  openSecondDevice,
  reloadWithServerFlags,
  test,
} from '../support/cloudFixtures';
import { openBank, seedBank } from '../support/fakeBank';
import { createFakeBankStore } from '../support/fakeBankStore';
import { attachBank, type FakeSupabaseServer } from '../support/fakeSupabase';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const EMAIL = 'ana.dispositivos@ejemplo.mx';
/** El mazo precargado más chico, para que seguirlo sea rápido */
const DECK = 'Urgencias (Paco)';
const DECK_KEY = 'paco-urgencias';
const QUESTIONS = 5;
const DAY_MS = 86_400_000;
const SYNC_OK_PREFIX = t.cloud.sync.ok('§').split('§')[0]?.trim() ?? '';
const privacyText = t.settings.privacy;

/** El banco simulado con cinco preguntas, las que las dos prácticas abren completas */
function bankWith(cloud: FakeSupabaseServer, questions: number) {
  const store = createFakeBankStore();
  attachBank(cloud, store);
  seedBank(store, questions);
  return store;
}

/** Entra con el banco abierto, como lo hará Ricardo, y recarga para que la app lea la bandera */
async function openAccount(page: Page, cloud: FakeSupabaseServer, alias?: string) {
  await enterWithLink(page, cloud, EMAIL, alias);
  await reloadWithServerFlags(page);
}

// ---------------------------------------------------------------------------- La bitácora en la nube

interface PushedEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

/** Los eventos que los navegadores subieron hasta ahora, en el orden en que llegaron */
function pushedEvents(cloud: FakeSupabaseServer): PushedEvent[] {
  return cloud
    .rpcCalls('sync_push_events')
    .filter((call) => call.status < 300)
    .flatMap((call) => {
      const body = call.body as { p_events?: PushedEvent[] } | null;
      return body?.p_events ?? [];
    });
}

const changedSetting = (cloud: FakeSupabaseServer, key: string, value: unknown) =>
  pushedEvents(cloud).some(
    (event) =>
      event.type === 'settings_changed' &&
      event.payload.key === key &&
      JSON.stringify(event.payload.value) === JSON.stringify(value),
  );

const changedConsent = (cloud: FakeSupabaseServer, status: 'granted' | 'revoked') =>
  pushedEvents(cloud).some(
    (event) =>
      event.type === 'consent_changed' &&
      event.payload.purpose === 'anonymized_improvement' &&
      event.payload.status === status,
  );

/**
 * Los eventos de un tipo que llegaron al servidor, uno por id. Un navegador que cambia de pantalla a medio
 * envío no se entera de que llegó y lo manda otra vez, y el servidor lo recibe igual una sola vez
 */
function pushedEventsOf(cloud: FakeSupabaseServer, type: string): PushedEvent[] {
  const byId = new Map<string, PushedEvent>();
  for (const event of pushedEvents(cloud)) if (event.type === type) byId.set(event.id, event);
  return [...byId.values()];
}

const answersPushed = (cloud: FakeSupabaseServer) =>
  pushedEventsOf(cloud, 'question_answered').length;

const scoreEvents = (cloud: FakeSupabaseServer) =>
  pushedEventsOf(cloud, 'official_score_submitted');

/** Sincroniza desde Configuración las veces que haga falta hasta que el servidor tenga lo que se espera */
async function syncUntil(page: Page, ready: () => boolean) {
  await page.goto(SCREENS.settings.path);
  const button = page.getByRole('button', { name: t.cloud.sync.syncNow });
  await expect(async () => {
    if (await button.isEnabled()) await button.click();
    expect(ready()).toBe(true);
  }).toPass({ timeout: 60_000, intervals: [500, 1_000, 2_000] });
}

/** Un dispositivo que acaba de entrar espera a que su primera sincronización termine bien */
async function waitForFirstSync(page: Page) {
  await page.goto(SCREENS.settings.path);
  await expect(page.getByText(SYNC_OK_PREFIX)).toBeVisible({ timeout: 45_000 });
}

// ---------------------------------------------------------------------------- Lo que hace el alumno

const newCardsPerDay = (page: Page) =>
  reviewSettingsPanel(page).getByRole('spinbutton', { name: t.settings.newCardsPerDay });

async function openReviewSettings(page: Page) {
  await page.goto(`${SCREENS.review.path}?ajustes=1`);
  await expect(reviewSettingsPanel(page)).toBeVisible({ timeout: 30_000 });
}

async function setNewCardsPerDay(page: Page, value: number) {
  await openReviewSettings(page);
  await newCardsPerDay(page).fill(String(value));
  const panel = reviewSettingsPanel(page);
  await panel.getByRole('button', { name: t.settings.saveChanges }).click();
  await expect(panel.getByText(t.settings.saved, { exact: true })).toBeVisible();
}

async function expectNewCardsPerDay(page: Page, value: number) {
  await openReviewSettings(page);
  await expect(newCardsPerDay(page)).toHaveValue(String(value));
}

const deckRow = (page: Page) => page.getByRole('listitem').filter({ hasText: DECK });

async function followDeck(page: Page) {
  await page.goto(SCREENS.decks.path);
  await deckRow(page).getByRole('button', { name: t.decks.follow }).click();
  await expect(deckRow(page).getByRole('button', { name: t.decks.unfollow })).toBeVisible({
    timeout: 60_000,
  });
}

async function expectFollowing(page: Page) {
  await page.goto(SCREENS.decks.path);
  await expect(deckRow(page).getByRole('button', { name: t.decks.unfollow })).toBeVisible({
    timeout: 30_000,
  });
}

const improvement = (page: Page) =>
  page.getByRole('checkbox', { name: consentTexts.purposes.anonymized_improvement[0] });

async function openPrivacy(page: Page) {
  await page.goto(`${SCREENS.settings.path}#privacidad`);
  await expect(page.getByRole('heading', { name: privacyText.consentsTitle })).toBeVisible({
    timeout: 30_000,
  });
}

async function setImprovement(page: Page, on: boolean) {
  await openPrivacy(page);
  if (on) await improvement(page).check();
  else await improvement(page).uncheck();
  await expect(page.getByText(privacyText.consentSaved)).toBeVisible();
}

/** Una práctica de cinco preguntas. En las primeras wrong falla la opción que no es la correcta */
async function practice(page: Page, wrong: number) {
  await page.goto(SCREENS.simulatorSetup.path);
  const setup = page.getByRole('region', { name: t.simulator.setupTitle });
  await expect(setup).toBeVisible({ timeout: 30_000 });
  await setup
    .getByRole('combobox', { name: t.simulator.count, exact: true })
    .selectOption(String(QUESTIONS));
  await setup.getByRole('button', { name: t.simulator.start }).click();
  await expect(page.getByText(t.simulator.progress(1, QUESTIONS), { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  for (let number = 1; number <= QUESTIONS; number += 1) {
    // La opción correcta del banco simulado es la que dice Opción A, sin importar en qué lugar salga
    const option =
      number <= wrong
        ? page.getByRole('radio', { name: /Opción [BCD] de la pregunta/ }).first()
        : page.getByRole('radio', { name: /Opción A de la pregunta/ });
    await option.check();
    const last = number === QUESTIONS;
    await page
      .getByRole('button', { name: last ? t.simulator.answerAndFinish : t.simulator.answerAndNext })
      .click();
    if (last) {
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        t.screens.sessionSummary.title,
      );
    } else {
      await expect(
        page.getByText(t.simulator.progress(number + 1, QUESTIONS), { exact: true }),
      ).toBeVisible();
    }
  }
}

const scoreCard = (page: Page) => page.getByRole('region', { name: privacyText.scoreTitle });

async function captureScore(page: Page, score: number) {
  await page.goto(SCREENS.progress.path);
  const card = scoreCard(page);
  await card.getByLabel(privacyText.score, { exact: true }).fill(String(score));
  await card.getByRole('button', { name: privacyText.saveScore }).click();
  await expect(card.getByText(privacyText.current(new Date().getFullYear(), score))).toBeVisible();
}

// ---------------------------------------------------------------------------- Lo que ve cada dispositivo

/** Mis errores es un solo mazo, con tantas tarjetas como preguntas distintas se fallaron */
async function expectOneErrorDeck(page: Page, cards: number) {
  await page.goto(SCREENS.decks.path);
  const decks = page
    .getByRole('region', { name: t.decks.yoursTitle })
    .getByRole('listitem')
    .filter({ hasText: t.errorCards.deckName });
  await expect(decks).toHaveCount(1, { timeout: 30_000 });
  await expect(decks).toContainText(t.decks.progress(0, cards));
  // El Tutor cuenta las mismas tarjetas
  await page.goto(SCREENS.tutor.path);
  await expect(
    page
      .getByRole('region', { name: t.tutor.drafts.title })
      .getByText(t.tutor.drafts.mine(cards), { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
}

/**
 * El texto de un panel de cifras, para comparar lo que ven dos dispositivos. Las cifras se calculan un
 * instante después de que la pantalla aparece, así que se lee hasta que dejan de cambiar
 */
async function panelText(page: Page, path: string, label: string): Promise<string> {
  await page.goto(path);
  const panel = page.getByRole('region', { name: label });
  await expect(panel).toBeVisible({ timeout: 30_000 });
  let previous = await panel.innerText();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(300);
    const current = await panel.innerText();
    if (current === previous) return current;
    previous = current;
  }
  return previous;
}

const progressStats = (page: Page) => panelText(page, SCREENS.progress.path, t.progress.statsLabel);
const tutorStats = (page: Page) => panelText(page, SCREENS.tutor.path, t.tutor.stats.label);

/** Lo que ve un dispositivo en Progreso y en el Tutor tiene que ser lo mismo que ve el otro */
async function expectSameHistory(
  page: Page,
  expected: { progress: string; tutor: string },
): Promise<void> {
  await expect.poll(() => progressStats(page), { timeout: 30_000 }).toBe(expected.progress);
  await expect.poll(() => tutorStats(page), { timeout: 30_000 }).toBe(expected.tutor);
}

/**
 * Cuántas preguntas respondidas dice el panel de cifras de Progreso. Sale solo de la bitácora, así que un
 * dispositivo que acaba de bajarla ya la sabe, aunque todavía no tenga el cuerpo de esas preguntas
 */
async function answeredQuestions(page: Page): Promise<number> {
  const pattern = new RegExp(
    `${escapeRegExp(t.progress.statShort.questions)}\\s+${escapeRegExp(t.progress.statRest.questions)}\\s+([\\d,]+)`,
  );
  const match = pattern.exec(await progressStats(page));
  return match ? Number((match[1] ?? '').replace(/,/g, '')) : Number.NaN;
}

async function expectNoScore(page: Page) {
  await page.goto(SCREENS.progress.path);
  const card = scoreCard(page);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText(privacyText.none)).toBeVisible();
}

test.describe('Dos dispositivos con la misma cuenta', () => {
  test('lo que cambia en uno lo ve el otro, Mis errores es uno solo y el puntaje se queda donde se capturó', async ({
    page,
    browser,
    cloud,
    consoleErrors,
  }) => {
    test.setTimeout(540_000);
    const bank = bankWith(cloud, QUESTIONS);
    // Seguir mazos del catálogo es de los planes de pago, y así las dos prácticas no gastan del tope de Gratis
    cloud.createUser({ email: EMAIL, alias: 'Ana' });
    cloud.setSubscription(EMAIL, {
      plan: 'monthly',
      status: 'active',
      provider: 'stripe',
      currentPeriodEnd: new Date(Date.now() + 20 * DAY_MS).toISOString(),
    });
    openBank(cloud);

    // En el primer dispositivo cambia un ajuste, sigue un mazo, da el permiso, falla una pregunta y captura
    // su puntaje oficial
    await openAccount(page, cloud, 'Ana');
    await expect.poll(() => cloud.deviceSessionOf(EMAIL)?.deviceId).toBeTruthy();
    const firstDevice = cloud.deviceSessionOf(EMAIL)?.deviceId;
    await setNewCardsPerDay(page, 35);
    await followDeck(page);
    await setImprovement(page, true);
    await practice(page, 1);
    await captureScore(page, 72.5);
    await expectOneErrorDeck(page, 1);
    expect(await answeredQuestions(page)).toBe(QUESTIONS);
    expect(bank.reads).toHaveLength(QUESTIONS);

    // Antes de que otro navegador tome la cuenta, el servidor tiene todo lo del primero
    await syncUntil(
      page,
      () =>
        changedSetting(cloud, 'settings.newCardsPerDay', 35) &&
        changedSetting(cloud, 'settings.followedDecks', [DECK_KEY]) &&
        changedConsent(cloud, 'granted') &&
        scoreEvents(cloud).length > 0 &&
        answersPushed(cloud) === QUESTIONS,
    );
    // Del puntaje solo llegó el año al servidor, nunca el número (D-101)
    expect(scoreEvents(cloud).map((event) => Object.keys(event.payload))).toEqual([['year']]);

    // El segundo navegador toma la cuenta y baja lo del primero
    const second = await openSecondDevice(browser, cloud, consoleErrors);
    const other = second.page;
    await openAccount(other, cloud);
    await expect.poll(() => cloud.deviceSessionOf(EMAIL)?.deviceId).not.toBe(firstDevice);
    await waitForFirstSync(other);
    await expectNewCardsPerDay(other, 35);
    await expectFollowing(other);
    await openPrivacy(other);
    await expect(improvement(other)).toBeChecked();
    await expect(other.getByText(studentSyncTexts.officialScoreStaysHere)).toBeVisible();
    await expectNoSeriousA11yViolations(other);
    // Un solo Mis errores con la tarjeta y el mismo historial que el primero. Lo que cuenta la bitácora ya
    // está. La exactitud de Progreso y los patrones del Tutor esperan a que este dispositivo abra esas
    // preguntas, porque el cuerpo de cada pregunta se baja al abrirla y no con la bitácora (IDEAS)
    await expectOneErrorDeck(other, 1);
    await expect.poll(() => answeredQuestions(other), { timeout: 30_000 }).toBe(QUESTIONS);
    // El puntaje se quedó en el primero
    await expectNoScore(other);

    // Falla las mismas cinco preguntas. La que ya había fallado el primero no se duplica
    await practice(other, QUESTIONS);
    await expectOneErrorDeck(other, QUESTIONS);
    await expectNoSeriousA11yViolations(other);
    // Cambia un ajuste y retira el permiso, lo que borra el puntaje del primero cuando se entere
    await setNewCardsPerDay(other, 40);
    await setImprovement(other, false);
    const secondHistory = { progress: await progressStats(other), tutor: await tutorStats(other) };
    await syncUntil(
      other,
      () =>
        changedSetting(cloud, 'settings.newCardsPerDay', 40) &&
        changedConsent(cloud, 'revoked') &&
        answersPushed(cloud) === 2 * QUESTIONS,
    );

    // El primero vuelve a tomar la cuenta y ve el cambio del segundo
    await openEmailLink(page, cloud.issueMagicLink(EMAIL));
    await expectHome(page);
    // Inicio aparece con el perfil que ya estaba en el navegador, antes de que la sesión nueva reclame la
    // cuenta. Si se navega antes de que la reclame, la pantalla siguiente sigue con la sesión vieja y se
    // entera de que el otro dispositivo la tiene
    await expect.poll(() => cloud.deviceSessionOf(EMAIL)?.deviceId).toBe(firstDevice);
    await waitForFirstSync(page);
    await expectNewCardsPerDay(page, 40);
    await expectFollowing(page);
    await openPrivacy(page);
    await expect(improvement(page)).not.toBeChecked();
    await expectNoSeriousA11yViolations(page);
    await expectOneErrorDeck(page, QUESTIONS);
    await expectSameHistory(page, secondHistory);
    // Retirar el permiso en el segundo borró el puntaje que se había capturado aquí
    await page.goto(SCREENS.progress.path);
    await expect(scoreCard(page).getByText(privacyText.scoreNeedsConsent)).toBeVisible();
    await expect(scoreCard(page).getByText(privacyText.none)).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await second.context.close();
  });
});
