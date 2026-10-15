// Catálogo de mazos en la nube (pantalla 37 y la parte del alumno, 4.8 del plan de B11, respuestas 46,
// 47 y 49). Esta es la parte del admin. La del alumno está en deck-catalog.spec.ts. El admin sube un .apkg de terceros, que se parte por
// submazo en el navegador y sube por archivos sin upsert. Publicarlo sin la autorización confirmada
// avisa con BK010. Solo el dueño la confirma con su nota y entonces la versión se publica.
import { SCREENS } from '@/app/screens';
import { bankAdminText } from '@/i18n/bankAdmin';
import { enterTeam, teamBank } from '../support/bankTeam';
import { expect, openSecondDevice, test } from '../support/cloudFixtures';
import { deckEntry, publishDeckAsAdmin, uploadDeckAsAdmin } from '../support/deckCatalogAdmin';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const adminDecks = bankAdminText.decks;
const CATALOG_ADMIN = { email: 'admin@ejemplo.mx', alias: 'Admin', role: 'admin' } as const;
const CATALOG_OWNER = { email: 'dueno@ejemplo.mx', alias: 'Ricardo', role: 'owner' } as const;
const THIRD_PARTY_DECK = {
  deckKey: 'prueba-terceros',
  name: '[Prueba] Mazo de terceros',
  author: 'Autor simulado',
  license: 'third_party',
  note: '[Prueba] Autorización simulada por correo',
} as const;

test.describe('Catálogo de mazos, el admin', () => {
  test('un mazo de terceros se publica solo después de que el dueño confirma la autorización', async ({
    page,
    browser,
    cloud,
    consoleErrors,
  }) => {
    test.setTimeout(180_000);
    const { bank } = teamBank(cloud, [CATALOG_ADMIN, CATALOG_OWNER]);

    await enterTeam(page, cloud, CATALOG_ADMIN.email);
    await uploadDeckAsAdmin(page, THIRD_PARTY_DECK);
    const version = bank.decks.get(THIRD_PARTY_DECK.deckKey)?.versions[0];
    expect(version).toMatchObject({ version: 1, status: 'uploading' });
    expect(version?.subjects).toHaveLength(2);
    const paths = [...bank.objects.keys()].filter((path) =>
      path.startsWith(`${THIRD_PARTY_DECK.deckKey}/v1/`),
    );
    expect(paths.length).toBeGreaterThanOrEqual(2);

    // Sin la confirmación del dueño no se publica. El admin no la puede confirmar
    const entry = deckEntry(page, THIRD_PARTY_DECK.name);
    await expect(entry.getByText(adminDecks.authorization.pending)).toBeVisible();
    await expect(entry.getByText(adminDecks.authorization.ownerOnly)).toBeVisible();
    await entry.getByRole('button', { name: adminDecks.publish }).click();
    await expect(entry.getByRole('alert')).toHaveText(bankAdminText.errors.BK010 ?? '');
    await expectNoSeriousA11yViolations(page);

    // El dueño confirma con su nota desde su dispositivo
    const owner = await openSecondDevice(browser, cloud, consoleErrors);
    await enterTeam(owner.page, cloud, CATALOG_OWNER.email);
    await owner.page.goto(SCREENS.deckCatalogAdmin.path);
    const ownerEntry = deckEntry(owner.page, THIRD_PARTY_DECK.name);
    await ownerEntry.getByLabel(adminDecks.authorization.note).fill(THIRD_PARTY_DECK.note);
    await ownerEntry.getByRole('button', { name: adminDecks.authorization.confirm }).click();
    await expect(ownerEntry.getByText(adminDecks.authorization.confirmed_notice)).toBeVisible();
    expect(bank.decks.get(THIRD_PARTY_DECK.deckKey)?.authorizationConfirmedAt).not.toBeNull();
    await owner.context.close();

    // Ya se publica
    await page.reload();
    await publishDeckAsAdmin(page, THIRD_PARTY_DECK.name);
    expect(bank.decks.get(THIRD_PARTY_DECK.deckKey)).toMatchObject({
      status: 'published',
      publishedVersion: 1,
    });
  });
});
