// La app habla con el proxy local y muestra en qué modo está la IA (8.1).
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, test } from './support/fixtures';

test('muestra IA simulada con el proxy en modo simulado y nunca llama a Anthropic', async ({
  page,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') external.push(url.hostname);
  });

  const health = page.waitForResponse((response) => response.url().endsWith('/api/health'));
  // El modo de la IA se ve en Configuración, en Cuenta y datos (D-065, D-078)
  await page.goto(`${SCREENS.settings.path}?seccion=account`);
  expect(await (await health).json()).toMatchObject({ status: 'ok', mode: 'mock' });

  const card = page.getByRole('region', { name: t.ai.cardTitle });
  await expect(card.getByText(t.ai.badge.mock)).toBeVisible();
  await expect(card.getByText(t.ai.detail.mock)).toBeVisible();
  expect(external).toEqual([]);
});
