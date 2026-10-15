// Catálogo de mazos del admin en la nube (pantalla 37, 4.8 del plan de B11, respuestas 46, 47 y 49). El
// admin sube un .apkg de terceros, que se parte por submazo en el navegador y sube por archivos sin
// upsert. Publicarlo sin la autorización confirmada avisa con BK010. Solo el dueño la confirma con su
// nota y entonces la versión se publica. La parte del alumno vive en deck-catalog.spec.ts (paquete B).
import { SCREENS } from '@/app/screens';
import { bankAdminText } from '@/i18n/bankAdmin';
import { enterTeam, teamBank } from '../support/bankTeam';
import { expect, openSecondDevice, test } from '../support/cloudFixtures';
import { deckEntry, publishDeckAsAdmin, uploadDeckAsAdmin } from '../support/deckCatalogAdmin';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const text = bankAdminText.decks;
const ADMIN = { email: 'admin@ejemplo.mx', alias: 'Admin', role: 'admin' } as const;
const OWNER = { email: 'dueno@ejemplo.mx', alias: 'Ricardo', role: 'owner' } as const;
const DECK = {
  deckKey: 'prueba-terceros',
  name: '[Prueba] Mazo de terceros',
  author: 'Autor simulado',
  license: 'third_party',
  note: '[Prueba] Autorización simulada por correo',
} as const;

test('un mazo de terceros se publica solo después de que el dueño confirma la autorización', async ({
  page,
  browser,
  cloud,
  consoleErrors,
}) => {
  test.setTimeout(180_000);
  const { bank } = teamBank(cloud, [ADMIN, OWNER]);

  await enterTeam(page, cloud, ADMIN.email);
  await uploadDeckAsAdmin(page, DECK);
  const version = bank.decks.get(DECK.deckKey)?.versions[0];
  expect(version).toMatchObject({ version: 1, status: 'uploading' });
  expect(version?.subjects).toHaveLength(2);
  const paths = [...bank.objects.keys()].filter((path) => path.startsWith(`${DECK.deckKey}/v1/`));
  expect(paths.length).toBeGreaterThanOrEqual(2);

  // Sin la confirmación del dueño no se publica. El admin no la puede confirmar
  const entry = deckEntry(page, DECK.name);
  await expect(entry.getByText(text.authorization.pending)).toBeVisible();
  await expect(entry.getByText(text.authorization.ownerOnly)).toBeVisible();
  await entry.getByRole('button', { name: text.publish }).click();
  await expect(entry.getByRole('alert')).toHaveText(bankAdminText.errors.BK010 ?? '');
  await expectNoSeriousA11yViolations(page);

  // El dueño confirma con su nota desde su dispositivo
  const owner = await openSecondDevice(browser, cloud, consoleErrors);
  await enterTeam(owner.page, cloud, OWNER.email);
  await owner.page.goto(SCREENS.deckCatalogAdmin.path);
  const ownerEntry = deckEntry(owner.page, DECK.name);
  await ownerEntry.getByLabel(text.authorization.note).fill(DECK.note);
  await ownerEntry.getByRole('button', { name: text.authorization.confirm }).click();
  await expect(ownerEntry.getByText(text.authorization.confirmed_notice)).toBeVisible();
  expect(bank.decks.get(DECK.deckKey)?.authorizationConfirmedAt).not.toBeNull();
  await owner.context.close();

  // Ya se publica
  await page.reload();
  await publishDeckAsAdmin(page, DECK.name);
  expect(bank.decks.get(DECK.deckKey)).toMatchObject({ status: 'published', publishedVersion: 1 });
});
