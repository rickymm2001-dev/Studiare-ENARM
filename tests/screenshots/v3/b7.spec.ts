// Capturas de cierre de B7 del plan del cambio (D-126). Party en la nube con un grupo, la tabla de la
// semana, un reto y un duelo, el permiso de Party, el resumen de la semana para compartir, la tarjeta
// Invita y gana un mes en Party y en Configuración, el modo enfoque en Party y en Inicio, Party sin
// nube y el menú del alumno sin la demostración. Quedan en docs/screenshots/v3/b7. El recorrido
// completo va en teléfono claro y computadora clara y oscura, y lo clave además en 1920 y en el
// teléfono oscuro, como en b6.spec.ts. Party en la nube corre contra el build con la nube y el
// Supabase simulado de las e2e de nube (tests/e2e/cloud/README.md). Los compañeros del grupo son
// cuentas de ese Supabase simulado que entran, publican su XP y juegan su duelo desde el servidor.
import { test, type Locator, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { studyDayOf, weekStartOf } from '@/engines/studyDay';
import { t } from '@/i18n/es-MX';
import { generateDemo } from '../../e2e/support/b1';
import { enterWithLink, expect, test as cloudTest } from '../../e2e/support/cloudFixtures';
import type { FakeSupabaseServer } from '../../e2e/support/fakeSupabase';
import { CLOUD_PREVIEW_URL } from '../../e2e/support/fakeSupabaseConfig';
import { answerPracticeQuestion, signUp } from '../../e2e/support/fixtures';
import { capture, outDirFor } from './capture';

const B7_DIR = outDirFor('b7');

const FULL_WALK = (project: string) => !project.startsWith('1920') && project !== '390-oscuro';

const GROUP = 'Guardia de los jueves';
const CHALLENGE = 'Repasos de la semana';
/** La misma clave que usa src/config/featureFlags.ts para la copia de las banderas */
const FLAGS_KEY = 'enarm.feature-flags.v1';
const party = t.partyCloud;

/** Captura lo que se ve, sin página completa, para menús y hojas abiertas */
async function viewport(page: Page, name: string, project: string) {
  await page.screenshot({ path: `${B7_DIR}/${name}--${project}.jpg`, type: 'jpeg', quality: 60 });
}

/** Captura solo una tarjeta, como el resumen de la semana o Invita y gana un mes */
async function card(region: Locator, name: string, project: string) {
  await region.scrollIntoViewIfNeeded();
  await region.screenshot({ path: `${B7_DIR}/${name}--${project}.jpg`, type: 'jpeg', quality: 60 });
}

/** Abre una ruta, espera su título y captura la página completa */
async function shot(page: Page, project: string, name: string, path: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  await capture(page, B7_DIR, name, project);
}

/** Una función party_* a nombre de otra cuenta, como si la llamara su navegador */
function asMember(
  cloud: FakeSupabaseServer,
  userId: string,
  name: string,
  args: Record<string, unknown>,
): unknown {
  const reply = cloud.party.call(name, userId, args);
  if (reply === null || 'error' in reply) {
    throw new Error(`${name} no respondió bien: ${JSON.stringify(reply)}`);
  }
  return reply.data;
}

interface OverviewGroup {
  name: string;
  challenges: { id: string; title: string }[];
  duels: { id: string; challengerId: string; opponentId: string }[];
}

/** El grupo como lo ve una cuenta en la semana en curso */
function groupSeenBy(cloud: FakeSupabaseServer, userId: string): OverviewGroup {
  const monday = weekStartOf(studyDayOf(new Date(), 'America/Merida'));
  const overview = asMember(cloud, userId, 'party_overview', { p_week_start: monday }) as {
    groups: OverviewGroup[];
  };
  const group = overview.groups.find((item) => item.name === GROUP);
  if (!group) throw new Error(`${GROUP} no aparece para ${userId}`);
  return group;
}

/** Cambia el modo enfoque en Configuración, sección Apariencia, y lo guarda */
async function setFocusMode(page: Page, on: boolean) {
  await page.goto(`${SCREENS.settings.path}#apariencia`);
  const toggle = page.getByRole('switch', { name: t.b7.focusMode.label });
  await expect(toggle).toBeVisible({ timeout: 60_000 });
  if ((await toggle.isChecked()) !== on) await toggle.click();
  await page.locator('#apariencia').getByRole('button', { name: t.settings.saveChanges }).click();
  await expect(page.getByRole('button', { name: t.settings.saveChanges })).toHaveCount(0);
}

cloudTest.describe('Party en la nube', () => {
  cloudTest.use({ baseURL: CLOUD_PREVIEW_URL, serviceWorkers: 'block' });

  cloudTest(
    'B7. Party con grupo, tabla, retos y duelos, resumen de la semana e Invita y gana un mes',
    async ({ page, cloud }, info) => {
      cloudTest.setTimeout(600_000);
      const project = info.project.name;
      const full = FULL_WALK(project);

      // Ana entra con su correo y abre Party. El permiso empieza apagado (4.27)
      await enterWithLink(page, cloud, 'ana.b7@ejemplo.mx', 'Ana');
      await page.goto(SCREENS.party.path);
      const consent = page.getByRole('region', { name: party.consent.title });
      await expect(consent.getByText(party.consent.body)).toBeVisible({ timeout: 30_000 });
      if (full) await capture(page, B7_DIR, '01-party-permiso', project);
      await consent.getByRole('button', { name: party.consent.allow }).click();

      // Ana crea el grupo
      const create = page.getByRole('region', { name: t.party.createTitle });
      await create.getByLabel(t.party.groupName).fill(GROUP);
      await create.getByRole('button', { name: t.party.create }).click();
      const group = page.getByRole('region', { name: GROUP });
      await expect(group).toBeVisible({ timeout: 30_000 });
      const code = cloud.party.codeOf(GROUP) ?? '';

      // Tres compañeros entran con el código. Sus llamadas van directo al Supabase simulado
      const mates = [
        { alias: 'Bruno', email: 'bruno.b7@ejemplo.mx', xp: 420, cards: 60 },
        { alias: 'Carla', email: 'carla.b7@ejemplo.mx', xp: 310, cards: 45 },
        { alias: 'Diego', email: 'diego.b7@ejemplo.mx', xp: 120, cards: 15 },
      ].map((mate) => ({
        ...mate,
        id: cloud.createUser({ email: mate.email, alias: mate.alias }).id,
      }));
      for (const mate of mates) asMember(cloud, mate.id, 'party_join_group', { p_code: code });

      // Ana propone un reto de la semana
      await page.reload();
      await expect(group.getByRole('table', { name: t.party.leaderboard })).toBeVisible({
        timeout: 30_000,
      });
      await group.getByRole('button', { name: t.party.newChallenge }).click();
      await group.getByLabel(t.party.challengeTitle).fill(CHALLENGE);
      await group.getByLabel(t.party.metric).selectOption('cards');
      await group.getByLabel(t.party.target).fill('200');
      await group.getByRole('button', { name: t.party.createChallenge }).click();
      await expect(group.getByRole('progressbar', { name: CHALLENGE })).toBeVisible({
        timeout: 30_000,
      });

      // Ana reta a Bruno. Las 20 preguntas quedan fijas en el duelo
      await group.getByRole('button', { name: t.party.duel.newButton }).click();
      await group.getByLabel(t.party.duel.rival).selectOption({ label: 'Bruno' });
      await group.getByRole('button', { name: t.party.duel.create }).click();
      const duel = group.getByRole('listitem').filter({ hasText: t.party.duel.title('Bruno') });
      await expect(duel.getByText(t.party.duel.rules(20))).toBeVisible({ timeout: 60_000 });

      // Cada compañero publica su XP de la semana y su aporte al reto, y Bruno juega su duelo
      const seen = groupSeenBy(cloud, mates[0]?.id ?? '');
      const challengeId = seen.challenges.find((item) => item.title === CHALLENGE)?.id;
      const duelId = seen.duels[0]?.id;
      if (!challengeId || !duelId) throw new Error('Faltan el reto o el duelo');
      const monday = weekStartOf(studyDayOf(new Date(), 'America/Merida'));
      for (const mate of mates) {
        asMember(cloud, mate.id, 'party_publish', {
          p_week_start: monday,
          p_xp: mate.xp,
          p_progress: [{ challengeId, amount: mate.cards }],
        });
      }
      const bruno = mates[0]?.id ?? '';
      asMember(cloud, bruno, 'party_start_duel', { p_duel: duelId });
      asMember(cloud, bruno, 'party_submit_duel_result', {
        p_duel: duelId,
        p_correct: 14,
        p_total_ms: 21 * 60_000,
      });

      await page.reload();
      await expect(
        group.getByRole('table', { name: t.party.leaderboard }).getByRole('row'),
      ).toHaveCount(5, { timeout: 30_000 });
      await expect(duel.getByRole('button', { name: t.party.duel.play })).toBeVisible();
      await capture(page, B7_DIR, '02-party-en-la-nube', project);

      if (full) {
        // Ana juega su duelo y ve quién ganó
        await duel.getByRole('button', { name: t.party.duel.play }).click();
        await expect(page.getByText(t.simulator.progress(1, 20))).toBeVisible({ timeout: 60_000 });
        for (let index = 1; index <= 20; index += 1) {
          await answerPracticeQuestion(page, index, 20);
        }
        await page.getByRole('link', { name: t.party.duel.seeResult }).click();
        await expect(duel.getByRole('table', { name: t.party.duel.result })).toBeVisible({
          timeout: 30_000,
        });
        await capture(page, B7_DIR, '03-party-duelo-con-resultado', project);
      }

      // El resumen de la semana y la tarjeta de referidos de Party
      await card(
        page.getByRole('region', { name: t.b7.weekShare.title }),
        '04-resumen-de-la-semana',
        project,
      );
      await card(
        page.getByRole('region', { name: t.b7.referral.title }),
        '05-invita-en-party',
        project,
      );

      // Invita y gana un mes también en Configuración, sección Perfil, con el plan Gratis
      await page.goto(`${SCREENS.settings.path}#perfil`);
      const referral = page.getByRole('region', { name: t.b7.referral.title });
      await expect(referral.getByTestId('referral-link')).toBeVisible({ timeout: 30_000 });
      await capture(page, B7_DIR, '06-configuracion-con-invita', project);

      if (full) {
        // Con el modo enfoque Party deja el grupo, sus miembros y los duelos, sin tabla ni retos
        await setFocusMode(page, true);
        await page.goto(SCREENS.party.path);
        await expect(page.getByText(party.focusNote)).toBeVisible({ timeout: 30_000 });
        await expect(group.getByRole('list', { name: party.membersTitle })).toBeVisible();
        await capture(page, B7_DIR, '07-party-en-modo-enfoque', project);
      }
    },
  );
});

test('B7. Inicio en modo enfoque', async ({ page }, info) => {
  test.setTimeout(600_000);
  const project = info.project.name;
  await generateDemo(page);
  if (FULL_WALK(project)) {
    await page.goto(`${SCREENS.settings.path}#apariencia`);
    const toggle = page.getByRole('switch', { name: t.b7.focusMode.label });
    await expect(toggle).toBeVisible({ timeout: 60_000 });
    await toggle.click();
    await card(page.locator('#apariencia'), '08-apariencia-con-modo-enfoque', project);
    await page.locator('#apariencia').getByRole('button', { name: t.settings.saveChanges }).click();
    await expect(page.getByRole('button', { name: t.settings.saveChanges })).toHaveCount(0);
  } else {
    await setFocusMode(page, true);
  }
  await shot(page, project, '09-inicio-en-modo-enfoque', SCREENS.home.path);
});

test('B7. Party sin nube y el menú del alumno sin la demostración', async ({ page }, info) => {
  test.skip(!FULL_WALK(info.project.name), 'Solo teléfono claro y computadora clara y oscura');
  test.setTimeout(300_000);
  const project = info.project.name;
  // Como en producción, sin la bandera demoTools (5.4). La copia del navegador solo la puede apagar
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({ demoTools: false }));
  }, FLAGS_KEY);
  await signUp(page);

  // Sin la cuenta en la nube Party explica que la necesita, y el resumen y los referidos siguen
  await shot(page, project, '10-party-sin-nube', SCREENS.party.path);

  // El menú del alumno no lleva nada de la demostración. En el teléfono se ve al abrir Más
  await page.goto(SCREENS.home.path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  if (project.startsWith('390')) {
    await page
      .getByRole('navigation', { name: t.nav.label })
      .getByRole('button', { name: t.navItems.more })
      .click();
    await expect(page.getByRole('dialog', { name: t.nav.more })).toBeVisible();
  }
  await expect(page.getByText(t.screens.demoData.title)).toHaveCount(0);
  await viewport(page, '11-menu-del-alumno-sin-demo', project);
  if (project.startsWith('390')) await page.keyboard.press('Escape');

  // Y el selector de rol queda cerrado
  await shot(page, project, '12-rol-cerrado', SCREENS.roleSelector.path);
  await expect(page.getByText(t.b7.demoLock.roleLocked)).toBeVisible();
});
