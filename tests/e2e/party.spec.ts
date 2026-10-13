// Flujo 6 de 14.1. Party fuera de la nube (B7 del plan del cambio, respuesta 77). Con una cuenta que
// solo vive en este navegador, Party explica que necesita la cuenta en la nube. En la base de
// demostración los grupos viven en este navegador con compañeros simulados que llevan su etiqueta
// (9.6, 4.1), y se crea un grupo, se ve la tabla de la semana, se une con un código, se crea un reto y se
// reta a un compañero simulado. La Party real entre dos cuentas está en tests/e2e/cloud/party.spec.ts
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { generateDemo } from './support/b1';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

test('sin cuenta en la nube Party explica que la necesita', async ({ page }) => {
  await signUp(page);
  await page.goto(SCREENS.party.path);
  const card = page.getByRole('region', { name: t.partyCloud.needsCloud.title });
  await expect(card.getByText(t.partyCloud.needsCloud.off)).toBeVisible();
  await expect(page.getByRole('region', { name: t.party.createTitle })).toHaveCount(0);
  await expect(page.getByText(t.partyCloud.privacy)).toBeVisible();
  // Los referidos siguen a la vista, porque viven en Party aunque pidan la nube (4.3)
  await expect(page.getByRole('region', { name: t.referrals.title })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test('en la demostración crea un grupo simulado, ve la tabla, se une con su código y reta a un compañero', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await generateDemo(page);
  await page.goto(SCREENS.party.path);
  await expect(page.getByText(t.partyCloud.privacyDemo)).toBeVisible();
  await expect(page.getByText(t.party.createHint)).toBeVisible();

  // Crear con compañeros simulados, marcados como tales
  const create = page.getByRole('region', { name: t.party.createTitle });
  await expect(create.getByLabel(t.party.withFriends)).toBeChecked();
  await create.getByLabel(t.party.groupName).fill('Guardia de los jueves');
  await create.getByRole('button', { name: t.party.create }).click();
  const group = page.getByRole('region', { name: 'Guardia de los jueves' });
  await expect(group).toBeVisible();
  await expect(group.getByText(t.labels.simulatedData).first()).toBeVisible();
  const code = (await group.getByTestId('party-invite-code').textContent()) ?? '';
  expect(code).toMatch(/^[A-Z2-9]{6}$/);

  // La tabla trae al alumno y a sus seis compañeros simulados, y solo comparte alias y XP de la semana
  const table = group.getByRole('table', { name: t.party.leaderboard });
  await expect(table.getByRole('row')).toHaveCount(8);
  await expect(table.getByRole('row', { name: new RegExp(t.party.you) })).toBeVisible();
  await expect(table.getByText(t.party.simulated).first()).toBeVisible();
  await expect(table.getByRole('columnheader').allTextContents()).resolves.toEqual([
    '#',
    t.party.alias,
    t.party.weeklyXp,
  ]);
  await expectNoSeriousA11yViolations(page);

  // Unirse con el mismo código avisa que ya está, y un código que no existe también lo dice
  const join = page.getByRole('region', { name: t.party.joinTitle });
  await join.getByLabel(t.party.code).fill(code);
  await join.getByRole('button', { name: t.party.join }).click();
  await expect(join.getByRole('status')).toHaveText(t.party.joinResults.already);
  await join.getByLabel(t.party.code).fill('ZZZZZZ');
  await join.getByRole('button', { name: t.party.join }).click();
  await expect(join.getByRole('status')).toHaveText(t.party.joinResults.not_found);

  // Un reto colectivo nuevo con su barra, que suma lo de los compañeros simulados
  await group.getByRole('button', { name: t.party.newChallenge }).click();
  await group.getByLabel(t.party.challengeTitle).fill('Primeras tarjetas');
  await group.getByLabel(t.party.metric).selectOption('cards');
  await group.getByLabel(t.party.target).fill('1');
  await group.getByRole('button', { name: t.party.createChallenge }).click();
  await expect(group.getByRole('progressbar', { name: 'Primeras tarjetas' })).toBeVisible();

  // Un duelo con un compañero simulado espera el turno del alumno sin mostrar nada del rival
  await group.getByRole('button', { name: t.party.duel.newButton }).click();
  await group.getByLabel(t.party.duel.rival).selectOption({ label: 'Diego M.' });
  await group.getByRole('button', { name: t.party.duel.create }).click();
  const duel = group.getByRole('listitem').filter({ hasText: t.party.duel.title('Diego M.') });
  await expect(duel).toBeVisible({ timeout: 60_000 });
  await expect(duel.getByText(t.party.duel.rules(20))).toBeVisible();
  await expect(duel.getByText(t.labels.simulatedData)).toBeVisible();
  await expect(duel.getByRole('table')).toHaveCount(0);

  // Salir del grupo lo quita de la lista y el mismo código lo vuelve a abrir
  await group.getByRole('button', { name: t.party.leave }).click();
  await expect(group).toHaveCount(0);
  await join.getByLabel(t.party.code).fill(code);
  await join.getByRole('button', { name: t.party.join }).click();
  await expect(join.getByRole('status')).toHaveText(t.party.joinResults.joined);
  await expect(page.getByRole('region', { name: 'Guardia de los jueves' })).toBeVisible();
});

// Compartir un logro (9.6). La tarjeta lleva solo nivel, racha y XP de la semana y no se comparte nada
// hasta tocar el botón. Con el menú de compartir del sistema se manda la imagen y sin él se descarga
test('comparte la tarjeta de logro con el menú del sistema', async ({ page }) => {
  // Un menú de compartir de mentira que guarda lo que recibe, porque en la prueba no hay sistema
  await page.addInitScript(() => {
    const shared: {
      title?: string;
      text?: string;
      files: { name: string; type: string; size: number }[];
    }[] = [];
    Object.defineProperty(window, '__shared', { value: shared });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: ShareData) => {
        shared.push({
          ...(data.title === undefined ? {} : { title: data.title }),
          ...(data.text === undefined ? {} : { text: data.text }),
          files: (data.files ?? []).map((file) => ({
            name: file.name,
            type: file.type,
            size: file.size,
          })),
        });
        return Promise.resolve();
      },
    });
  });
  await signUp(page);
  await page.goto(SCREENS.party.path);
  const card = page.getByRole('region', { name: t.party.share.title });
  await expect(card).toBeVisible();
  const preview = card.getByRole('figure', { name: t.party.share.previewLabel });
  await expect(preview).toContainText(t.party.share.level(1));
  // Sin alias por defecto y sin etiqueta de demostración en una cuenta real
  await expect(preview).not.toContainText('Ana');
  await expect(preview).not.toContainText(t.party.share.simulatedBanner);
  await expectNoSeriousA11yViolations(page);
  expect(await page.evaluate(() => (window as never as { __shared: unknown[] }).__shared)).toEqual(
    [],
  );

  await card.getByRole('checkbox', { name: t.party.share.includeAlias }).check();
  await expect(preview).toContainText('Ana');
  await card.getByRole('button', { name: t.party.share.button }).click();
  await expect(card.getByText(t.party.share.outcomes.shared)).toBeVisible();

  const shared = await page.evaluate(
    () =>
      (
        window as never as {
          __shared: {
            title?: string;
            text?: string;
            files: { name: string; type: string; size: number }[];
          }[];
        }
      ).__shared,
  );
  expect(shared).toHaveLength(1);
  expect(shared[0]?.title).toBe(t.party.share.shareTitle);
  expect(shared[0]?.text).toContain('Ana');
  expect(shared[0]?.files).toHaveLength(1);
  expect(shared[0]?.files[0]).toMatchObject({ name: t.party.share.fileName, type: 'image/png' });
  // Una imagen dibujada de verdad pesa varios kilobytes y no es un archivo vacío
  expect(shared[0]?.files[0]?.size ?? 0).toBeGreaterThan(5_000);
});

test('sin menú de compartir descarga la tarjeta como imagen PNG cuadrada', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
  await signUp(page);
  await page.goto(SCREENS.party.path);
  const card = page.getByRole('region', { name: t.party.share.title });
  const download = page.waitForEvent('download');
  await card.getByRole('button', { name: t.party.share.button }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(t.party.share.fileName);
  await expect(card.getByText(t.party.share.outcomes.downloaded)).toBeVisible();

  // Es un PNG de 1080 por 1080 píxeles
  const path = await file.path();
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(path);
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBe(1080);
  expect(bytes.length).toBeGreaterThan(5_000);
});
