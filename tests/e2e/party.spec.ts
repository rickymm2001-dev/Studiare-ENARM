// Flujo 6 de 14.1. Party, crear un grupo, ver la tabla de la semana, unirse con un código y
// completar un reto. Los grupos viven en este navegador y los compañeros llevan etiqueta de
// simulados (9.6, 4.6)
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

test('crea un grupo, ve la tabla, se une con su código y completa un reto', async ({ page }) => {
  test.setTimeout(180_000);
  await signUp(page);
  await page.goto(SCREENS.party.path);
  await expect(page.getByText(t.party.privacy)).toBeVisible();
  await expect(page.getByText(t.party.createHint)).toBeVisible();

  // Crear con compañeros simulados, marcados como tales
  await page.getByLabel(t.party.groupName).fill('Guardia de los jueves');
  await page.getByRole('button', { name: t.party.create }).click();
  const group = page.getByRole('region', { name: 'Guardia de los jueves' });
  await expect(group).toBeVisible();
  await expect(group.getByText(t.labels.simulatedData).first()).toBeVisible();
  const code = (await group.locator('strong.font-mono').textContent()) ?? '';
  expect(code).toMatch(/^[A-Z2-9]{6}$/);

  // La tabla de la semana trae a la persona y a sus compañeros simulados, y solo comparte lo permitido
  const table = group.getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(8);
  await expect(table.getByRole('row', { name: new RegExp(t.party.you) })).toBeVisible();
  await expect(table.getByText(t.party.simulated).first()).toBeVisible();
  await expect(table.getByRole('columnheader').allTextContents()).resolves.toEqual([
    '#',
    t.party.alias,
    t.party.level,
    t.party.streak,
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

  // Reto colectivo. Con una meta de una tarjeta los compañeros simulados lo cumplen solos, pero sin
  // aporte propio no hay premio, porque si no cualquiera inflaba su XP con datos simulados
  await group.getByRole('button', { name: t.party.newChallenge }).click();
  await group.getByLabel(t.party.challengeTitle).fill('Primeras tarjetas');
  await group.getByLabel(t.party.metric).selectOption('cards');
  await group.getByLabel(t.party.target).fill('1');
  await group.getByRole('button', { name: t.party.createChallenge }).click();
  await expect(group.getByRole('progressbar', { name: 'Primeras tarjetas' })).toBeVisible();
  await expect(group.getByText(t.party.needOwnContribution)).toBeVisible();
  await expect(group.getByRole('button', { name: t.party.claim })).toHaveCount(0);

  // Con una tarjeta repasada ya hay aporte propio y se reclama una sola vez
  await page.goto(SCREENS.decks.path);
  const deck = page.getByRole('listitem').filter({ hasText: 'Urgencias (Paco)' });
  await deck.getByRole('button', { name: t.decks.follow }).click();
  await expect(deck.getByRole('button', { name: t.decks.unfollow })).toBeVisible({
    timeout: 60_000,
  });
  await page.goto(SCREENS.review.path);
  await page.getByRole('button', { name: /^Repasar [\d,]+ tarjetas?$/ }).click();
  await page.getByRole('button', { name: t.review.confidence.sure, exact: true }).click();
  await page.getByRole('button', { name: t.review.show }).click();
  await page.getByRole('button', { name: new RegExp(`^${t.review.ratings.good}`) }).click();
  await page.getByRole('button', { name: t.review.finish }).click();
  await expect(page.getByText(t.review.doneTitle)).toBeVisible();

  await page.goto(SCREENS.party.path);
  await expect(group.getByText(t.party.needOwnContribution)).toHaveCount(0);
  await group.getByRole('button', { name: t.party.claim }).click();
  await expect(group.getByText(t.party.claimed)).toBeVisible();
  await expect(group.getByRole('button', { name: t.party.claim })).toHaveCount(0);

  // Un segundo reto del mismo día también se cumple, pero el premio es de uno por día
  await group.getByRole('button', { name: t.party.newChallenge }).click();
  await group.getByLabel(t.party.challengeTitle).fill('Otra meta');
  await group.getByLabel(t.party.metric).selectOption('cards');
  await group.getByLabel(t.party.target).fill('1');
  await group.getByRole('button', { name: t.party.createChallenge }).click();
  await expect(group.getByText(t.party.oneClaimPerDay)).toBeVisible();
  await expect(group.getByRole('button', { name: t.party.claim })).toHaveCount(0);

  // Los 100 XP del reto y las tarjetas repasadas ya cuentan en Inicio, y una sola vez
  await page.goto('/');
  // El renglón también dice cuánto de eso fue esta semana
  await expect(page.getByText(/^1\d\d XP en total · 1\d\d XP esta semana$/)).toBeVisible();

  // Salir del grupo lo quita de la lista y el mismo código lo vuelve a abrir
  await page.goto(SCREENS.party.path);
  await page.getByRole('button', { name: t.party.leave }).click();
  await expect(page.getByRole('region', { name: 'Guardia de los jueves' })).toHaveCount(0);
  await expect(page.getByText(t.party.createHint)).toBeVisible();
  await join.getByLabel(t.party.code).fill(code);
  await join.getByRole('button', { name: t.party.join }).click();
  await expect(join.getByRole('status')).toHaveText(t.party.joinResults.joined);
  await expect(page.getByRole('region', { name: 'Guardia de los jueves' })).toBeVisible();
});

// Duelos (9.6). Se reta a un compañero simulado, las 20 preguntas son las mismas para los dos y gana
// más exactitud con el menor tiempo como desempate. El plan Gratis deja 20 preguntas al día, así que
// un duelo las gasta todas y el siguiente espera al día siguiente o a un plan de pago
test('reta a un compañero a un duelo, lo juega y ve quién ganó', async ({ page }) => {
  test.setTimeout(240_000);
  await signUp(page);
  await page.goto(SCREENS.party.path);
  await page.getByLabel(t.party.groupName).fill('Guardia de los viernes');
  await page.getByRole('button', { name: t.party.create }).click();
  const group = page.getByRole('region', { name: 'Guardia de los viernes' });
  await expect(group).toBeVisible();

  // El duelo se crea con un compañero simulado y espera el turno del alumno
  await group.getByRole('button', { name: t.party.duel.newButton }).click();
  await group.getByLabel(t.party.duel.rival).selectOption({ label: 'Diego M.' });
  await group.getByRole('button', { name: t.party.duel.create }).click();
  const duel = group.getByRole('listitem').filter({ hasText: t.party.duel.title('Diego M.') });
  await expect(duel).toBeVisible({ timeout: 60_000 });
  await expect(duel.getByText(t.party.duel.rules(20))).toBeVisible();
  await expect(duel.getByText(t.party.duel.rivalPlayed)).toBeVisible();
  // Antes de jugar no se ve nada del resultado del compañero
  await expect(duel.getByRole('table')).toHaveCount(0);

  // En Inicio el duelo aparece como pendiente
  await page.goto('/');
  await page.getByRole('button', { name: t.home.edit }).click();
  await page.getByLabel(t.home.presetLabel).selectOption('competitive');
  await expect(page.getByText(t.widgets.party.duelsPending(1))).toBeVisible();

  // Se juegan las 20 preguntas con el simulador de siempre
  await page.goto(SCREENS.party.path);
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

  // Ya jugado, se ven los dos resultados y quién ganó. El compañero va marcado como simulado
  const played = group.getByRole('listitem').filter({ hasText: t.party.duel.title('Diego M.') });
  await expect(played.getByRole('table')).toBeVisible({ timeout: 30_000 });
  await expect(played.getByRole('row')).toHaveCount(3);
  await expect(played.getByRole('row', { name: new RegExp(t.party.duel.you) })).toContainText(
    /\d+ de 20/,
  );
  await expect(played.getByRole('row', { name: /Diego M\./ })).toContainText(t.party.simulated);
  // El veredicto sale de comparar las dos filas. Mayor exactitud gana y con la misma decide el tiempo
  const hits = async (row: string | RegExp) => {
    const text = (await played.getByRole('row', { name: row }).textContent()) ?? '';
    return Number(/(\d+) de 20/.exec(text)?.[1]);
  };
  const mine = await hits(new RegExp(t.party.duel.you));
  const theirs = await hits(/Diego M\./);
  const verdict = played.getByRole('status');
  if (mine > theirs) await expect(verdict).toHaveText(t.party.duel.verdicts.win_accuracy);
  else if (mine < theirs) await expect(verdict).toHaveText(t.party.duel.verdicts.lose_accuracy);
  else
    await expect(verdict).toHaveText(
      new RegExp(
        [
          t.party.duel.verdicts.win_time,
          t.party.duel.verdicts.lose_time,
          t.party.duel.verdicts.draw,
        ].join('|'),
      ),
    );
  await expect(played.getByRole('button', { name: t.party.duel.play })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  // Con las 20 preguntas del día gastadas, otro duelo pide un plan de pago en lugar de dejar jugar
  await group.getByRole('button', { name: t.party.duel.newButton }).click();
  await group.getByLabel(t.party.duel.rival).selectOption({ label: 'Sofía L.' });
  await group.getByRole('button', { name: t.party.duel.create }).click();
  const second = group.getByRole('listitem').filter({ hasText: t.party.duel.title('Sofía L.') });
  await expect(second.getByText(t.party.duel.needQuestions(20, 0))).toBeVisible();
  await expect(second.getByRole('button', { name: t.party.duel.play })).toHaveCount(0);
  await expect(second.getByRole('link', { name: t.party.duel.seePlans })).toBeVisible();
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
