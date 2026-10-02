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
  await page.goto(SCREENS.profile.path);
  expect(await (await health).json()).toMatchObject({ status: 'ok', mode: 'mock' });

  await expect(page.getByRole('banner').getByText(t.ai.badge.mock)).toBeVisible();
  await expect(page.getByText(t.ai.detail.mock)).toBeVisible();
  expect(external).toEqual([]);
});
