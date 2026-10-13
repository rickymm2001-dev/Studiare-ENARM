// TEMPORAL, se borra al terminar el diagnóstico
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, test } from './support/fixtures';

test('debug tutor', async ({ page }) => {
  test.setTimeout(300_000);
  page.on('console', (m) => {
    if (m.text().startsWith('DBG')) console.log(m.text());
  });
  await page.goto(`${SCREENS.settings.path}?seccion=account`);
  await page.getByRole('radio', { name: new RegExp(t.database.demo) }).click();
  const panel = page.getByRole('region', { name: t.demoData.title });
  await panel.getByRole('button', { name: t.demoData.generate }).click();
  await expect(panel.getByRole('status')).toHaveText(/Listo\. Se guardaron/, { timeout: 150_000 });
  await page.goto(SCREENS.tutor.path);
  const report = page.getByRole('region', { name: t.tutor.report.title });
  await expect(report).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => {
    const describe = () =>
      [...document.querySelectorAll('main section[aria-labelledby]')]
        .filter((s) => s.textContent?.includes('Confirmada') && s.checkVisibility())
        .map((s) => {
          const p = s.querySelector('h3 + p')?.textContent?.slice(0, 40);
          const buttons = [...s.querySelectorAll('button')].map((b) => b.textContent + (b.disabled ? '[d]' : '')).join(',');
          return `${s.querySelector('h3')?.textContent} / ${p} / ${buttons}`;
        });
    document.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement;
        const sec = target.closest('section');
        console.log(`DBG click target=${target.tagName}:${target.textContent?.slice(0, 30)} isConnected=${target.isConnected} section=${sec?.querySelector('h3')?.textContent} / ${sec?.querySelector('h3 + p')?.textContent?.slice(0, 40)}`);
      },
      true,
    );
    let last = '';
    const obs = new MutationObserver(() => {
      const now = JSON.stringify(describe());
      if (now !== last) {
        last = now;
        console.log(`DBG ${Math.round(performance.now())} ${now}`);
      }
    });
    obs.observe(document.querySelector('main')!, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  const cards = page.getByRole('region').filter({ has: page.getByText(t.tutor.confirmedBadge) });
  const first = cards.first();
  console.log('DBG step: open evidence');
  await first.getByText(t.tutor.showEvidence).click();
  await expect(first.getByText(t.tutor.evidenceTitle)).toBeVisible();
  console.log('DBG step: helpful');
  await first.getByRole('button', { name: t.tutor.helpful }).click();
  await expect(first.getByText(t.tutor.answered.approved)).toBeVisible();
  console.log('DBG step: not helpful');
  const second = cards.nth(1);
  await second.getByRole('button', { name: t.tutor.notHelpful }).click();
  await page.waitForTimeout(8000);
  console.log('DBG dismissed visible:', await page.getByText(t.tutor.dismissedTitle(1)).count());
});
