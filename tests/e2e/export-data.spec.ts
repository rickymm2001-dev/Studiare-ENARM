// Exportar mis datos (4.5, D-092). Desde Configuración, Cuenta, la descarga es un JSON con el
// formato enarm-prototipo-export-v2 y trae el perfil, la cuenta, los consentimientos y la bitácora
// de quien lo pide. Con dos perfiles en el mismo navegador no se cuela nada del otro.
import { readFile } from 'node:fs/promises';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { emailOf, readTable, signOut } from './support/b1';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const FORMAT = 'enarm-prototipo-export-v2';

interface ExportFile {
  format: string;
  exportedAt: string;
  user: { id: string; alias: string };
  account: { userId: string; email: string } | null;
  consents: { userId: string; purpose: string }[];
  subscription: unknown;
  officialScore: unknown;
  widgetLayout: unknown;
  content: { decks: unknown[]; notes: unknown[]; cards: unknown[]; outlines: unknown[] };
  events: { userId: string; type: string }[];
}

test('descarga un JSON v2 con los datos del alumno que lo pide y nada del otro perfil del navegador', async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Dos perfiles en el mismo navegador. Ana deja su rastro y Beto es quien exporta
  await signUp(page, 'Ana');
  await signOut(page);
  await signUp(page, 'Beto');

  await page.goto(`${SCREENS.settings.path}?seccion=account`);
  const section = page.getByRole('region', { name: t.settings.exportTitle });
  await expect(section.getByText(t.settings.exportDescription)).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    section.getByRole('button', { name: t.settings.export }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('mis-datos-Beto.json');
  const path = await download.path();
  const data = JSON.parse(await readFile(path, 'utf8')) as ExportFile;

  // El formato y lo que es de Beto
  expect(data.format).toBe(FORMAT);
  expect(Date.parse(data.exportedAt)).not.toBeNaN();
  expect(data.user.alias).toBe('Beto');
  expect(data.account?.email).toBe(emailOf('Beto'));
  expect(data.account?.userId).toBe(data.user.id);
  expect(data.consents.map((consent) => consent.purpose).sort()).toEqual([
    'ai_analysis',
    'anonymized_improvement',
    'party',
  ]);
  expect(data.consents.every((consent) => consent.userId === data.user.id)).toBe(true);
  expect(data.events.length).toBeGreaterThan(0);
  expect(data.events.every((event) => event.userId === data.user.id)).toBe(true);
  expect(data.events.map((event) => event.type)).toContain('consent_changed');
  // Beto no ha creado nada propio y lo precargado no se exporta porque no es suyo
  expect(data.content).toEqual({ decks: [], notes: [], cards: [], outlines: [] });
  expect(data.subscription).toBeNull();
  expect(data.officialScore).toBeNull();

  // Nada de Ana. Su perfil sigue en la base, pero no viaja en el archivo de Beto
  const users = await readTable<{ id: string; alias: string }>(page, 'users');
  const ana = users.find((user) => user.alias === 'Ana');
  expect(ana).toBeDefined();
  expect(data.user.id).not.toBe(ana?.id);
  expect(data.events.some((event) => event.userId === ana?.id)).toBe(false);
  const text = await readFile(path, 'utf8');
  expect(text).not.toContain(emailOf('Ana'));
  expect(text).not.toContain(ana?.id ?? 'sin-id');
});
