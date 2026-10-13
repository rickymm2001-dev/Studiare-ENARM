// Party en la nube con dos cuentas (B7 del plan del cambio, respuestas 69 y 77). Ana crea un grupo y
// comparte el código, Bruno entra con el enlace de invitación, se retan a un duelo, los dos contestan
// las mismas 20 preguntas cuando cada uno puede y los dos ven quién ganó y la tabla de la semana con
// el XP que publicó cada quien. Al final el modo enfoque oculta la tabla y deja el grupo y el duelo.
// Corre contra el Supabase simulado, con dos contextos que hacen de dos navegadores
import type { Locator, Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { enterWithLink, expect, openSecondDevice, test } from '../support/cloudFixtures';
import { escapeRegExp } from '../support/b1';
import { answerPracticeQuestion, expectNoSeriousA11yViolations } from '../support/fixtures';

const ANA = 'ana.party@ejemplo.mx';
const BRUNO = 'bruno.party@ejemplo.mx';
const GROUP = 'Guardia de los jueves';
const text = t.partyCloud;
/** La misma clave que usa src/app/preferences.ts para las preferencias del dispositivo */
const PREFERENCES_KEY = 'enarm.preferences.v1';
const VERDICTS = new RegExp(Object.values(t.party.duel.verdicts).map(escapeRegExp).join('|'));

/** Party es de los planes de pago (B8). El mensual vigente, como lo deja un aviso de pago ya aplicado */
const PAID_MONTH = () =>
  ({
    plan: 'monthly',
    status: 'active',
    provider: 'stripe',
    currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000).toISOString(),
  }) as const;

/** Da el permiso de Party, que empieza apagado (4.27), y espera a que aparezcan los grupos */
async function allowParty(page: Page): Promise<void> {
  const consent = page.getByRole('region', { name: text.consent.title });
  await expect(consent.getByText(text.consent.body)).toBeVisible({ timeout: 20_000 });
  await consent.getByRole('button', { name: text.consent.allow }).click();
  await expect(page.getByRole('region', { name: t.party.createTitle })).toBeVisible();
}

/** Juega las 20 preguntas del duelo con el simulador de siempre y vuelve a Party */
async function playDuel(page: Page, duel: Locator): Promise<void> {
  await duel.getByRole('button', { name: t.party.duel.play }).click();
  await expect(page.getByText(t.simulator.progress(1, 20))).toBeVisible({ timeout: 60_000 });
  for (let index = 1; index <= 20; index += 1) {
    await answerPracticeQuestion(page, index, 20);
  }
  await page.getByRole('link', { name: t.party.duel.seeResult }).click();
}

/** El XP de la semana de un renglón de la tabla */
async function xpOf(table: Locator, alias: RegExp): Promise<number> {
  const cells = await table.getByRole('row', { name: alias }).getByRole('cell').allTextContents();
  return Number((cells.at(-1) ?? '').replace(/\D/g, ''));
}

test('dos cuentas forman un grupo, se retan a un duelo y ven la tabla', async ({
  page,
  browser,
  cloud,
  consoleErrors,
}) => {
  test.setTimeout(360_000);
  // Los dos ya pagaron el mensual. El plan lo da el servidor y la app lo refleja al conectar
  for (const [email, alias] of [
    [ANA, 'Ana'],
    [BRUNO, 'Bruno'],
  ] as const) {
    cloud.createUser({ email, alias });
    cloud.setSubscription(email, PAID_MONTH());
  }

  // Ana crea el grupo y ve su código
  await enterWithLink(page, cloud, ANA, 'Ana');
  await page.goto(SCREENS.party.path);
  await expect(page.getByText(text.privacy)).toBeVisible({ timeout: 20_000 });
  await allowParty(page);
  const create = page.getByRole('region', { name: t.party.createTitle });
  await create.getByLabel(t.party.groupName).fill(GROUP);
  await create.getByRole('button', { name: t.party.create }).click();
  const anaGroup = page.getByRole('region', { name: GROUP });
  await expect(anaGroup).toBeVisible();
  const code = (await anaGroup.getByTestId('party-invite-code').textContent()) ?? '';
  expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
  expect(code).toBe(cloud.party.codeOf(GROUP));
  await expect(anaGroup.getByRole('button', { name: text.invite.copyLink })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Bruno abre el enlace de invitación en su navegador. El código ya viene escrito
  const second = await openSecondDevice(browser, cloud, consoleErrors);
  const bruno = second.page;
  await enterWithLink(bruno, cloud, BRUNO, 'Bruno');
  await bruno.goto(`${SCREENS.party.path}?codigo=${code}`);
  await allowParty(bruno);
  const join = bruno.getByRole('region', { name: t.party.joinTitle });
  await expect(join.getByLabel(t.party.code)).toHaveValue(code);
  await join.getByRole('button', { name: t.party.join }).click();
  await expect(join.getByText(text.joinResults.joined)).toBeVisible();
  const brunoGroup = bruno.getByRole('region', { name: GROUP });
  await expect(
    brunoGroup.getByRole('table', { name: t.party.leaderboard }).getByRole('row'),
  ).toHaveCount(3);
  expect(cloud.party.activeMembers(GROUP)).toHaveLength(2);

  // Bruno reta a Ana. Las preguntas quedan fijas en el duelo y nadie ve nada del otro antes de jugar
  await brunoGroup.getByRole('button', { name: t.party.duel.newButton }).click();
  await brunoGroup.getByLabel(t.party.duel.rival).selectOption({ label: 'Ana' });
  await brunoGroup.getByRole('button', { name: t.party.duel.create }).click();
  const brunoDuel = brunoGroup.getByRole('listitem').filter({ hasText: t.party.duel.title('Ana') });
  await expect(brunoDuel.getByText(t.party.duel.rules(20))).toBeVisible({ timeout: 60_000 });
  await expect(brunoDuel.getByText(t.labels.simulatedData)).toHaveCount(0);
  await expect(brunoDuel.getByRole('table')).toHaveCount(0);

  // Bruno juega primero y su resultado espera al de Ana
  await playDuel(bruno, brunoDuel);
  await expect(brunoDuel.getByText(text.duels.waiting('Ana'))).toBeVisible({ timeout: 30_000 });
  const brunoId = cloud.userIdOf(BRUNO) ?? '';
  await expect.poll(() => cloud.party.duelResults(brunoId).length).toBe(1);

  // Ana juega cuando puede y ve quién ganó
  await page.reload();
  const anaDuel = anaGroup.getByRole('listitem').filter({ hasText: t.party.duel.title('Bruno') });
  await expect(anaDuel.getByRole('button', { name: t.party.duel.play })).toBeVisible({
    timeout: 30_000,
  });
  await playDuel(page, anaDuel);
  const anaResult = anaDuel.getByRole('table', { name: t.party.duel.result });
  await expect(anaResult).toBeVisible({ timeout: 30_000 });
  await expect(anaResult.getByRole('row')).toHaveCount(3);
  await expect(anaResult.getByRole('row', { name: new RegExp(t.party.duel.you) })).toContainText(
    /\d+ de 20/,
  );
  await expect(anaResult.getByRole('row', { name: /Bruno/ })).toContainText(/\d+ de 20/);
  await expect(anaDuel.getByRole('status')).toHaveText(VERDICTS);
  await expect(anaDuel.getByRole('button', { name: t.party.duel.play })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  // Bruno también ve el resultado
  await bruno.reload();
  const brunoResult = brunoDuel.getByRole('table', { name: t.party.duel.result });
  await expect(brunoResult).toBeVisible({ timeout: 30_000 });
  await expect(brunoDuel.getByRole('status')).toHaveText(VERDICTS);

  // Los dos ven la tabla de la semana con el XP que ganaron en el duelo
  const anaTable = anaGroup.getByRole('table', { name: t.party.leaderboard });
  await expect(anaTable.getByRole('row')).toHaveCount(3);
  await expect(
    anaTable.getByRole('row', { name: new RegExp(`Ana \\(${t.party.you}\\)`) }),
  ).toBeVisible();
  expect(await xpOf(anaTable, /Bruno/)).toBeGreaterThan(0);
  const brunoTable = brunoGroup.getByRole('table', { name: t.party.leaderboard });
  await expect(brunoTable.getByRole('row')).toHaveCount(3);
  expect(await xpOf(brunoTable, /Ana/)).toBeGreaterThan(0);

  // Con el modo enfoque Ana deja de ver la tabla, el XP y los retos, y sigue viendo su grupo y el duelo
  await page.evaluate((key) => {
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      appearance?: Record<string, unknown>;
    };
    localStorage.setItem(
      key,
      JSON.stringify({ ...stored, appearance: { ...stored.appearance, focusMode: true } }),
    );
  }, PREFERENCES_KEY);
  await page.reload();
  await expect(page.getByText(text.focusNote)).toBeVisible({ timeout: 30_000 });
  await expect(anaGroup.getByRole('table', { name: t.party.leaderboard })).toHaveCount(0);
  await expect(anaGroup.getByRole('button', { name: t.party.newChallenge })).toHaveCount(0);
  await expect(anaGroup.getByRole('list', { name: text.membersTitle })).toContainText('Bruno');
  await expect(anaGroup.getByTestId('party-invite-code')).toHaveText(code);
  await expect(anaDuel.getByRole('table', { name: t.party.duel.result })).toBeVisible();
  await second.context.close();
});
