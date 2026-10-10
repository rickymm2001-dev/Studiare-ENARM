// Auditoría por recorrido. Para cada rol y cada tipo de datos, abre todas las pantallas, revisa que no
// haya errores de consola, excepciones, pantalla de error, desborde a los lados ni violaciones serias
// de accesibilidad, y luego le da clic a los controles que no destruyen nada para ver si algo se
// rompe. Escribe un informe JSON por recorrido y no falla por hallazgos, para poder verlos todos.
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { SCREEN_KEYS, SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';

const OUT_DIR =
  process.env.AUDIT_OUT ?? join(process.cwd(), 'docs', 'auditoria-2026-10-10', 'recorrido');
mkdirSync(OUT_DIR, { recursive: true });

const ROLES = ['student', 'physician', 'admin', 'owner'] as const;
type Role = (typeof ROLES)[number];
const MODES = ['vacio', 'demo'] as const;
type Mode = (typeof MODES)[number];

/** Lo que no se toca en el recorrido porque destruye datos, cambia de rol o descarga archivos */
const SKIP_NAME =
  /eliminar|borrar|cerrar sesión|salir|restablecer|reiniciar|regenerar|vaciar|entrar como|descargar|exportar|cambiar de rol|olvidar/i;

interface Finding {
  where: string;
  kind: string;
  detail: string;
}

function watch(page: Page, findings: Finding[], context: () => string) {
  const withWarnings = process.env.AUDIT_WARN === '1';
  page.on('console', (message) => {
    const type = message.type();
    if (type === 'error' || (withWarnings && type === 'warning')) {
      findings.push({
        where: context(),
        kind: type === 'error' ? 'consola' : 'consola aviso',
        detail: message.text().slice(0, 300),
      });
    }
  });
  page.on('pageerror', (error) => {
    findings.push({ where: context(), kind: 'excepcion', detail: error.message.slice(0, 300) });
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? '';
    if (failure.includes('ERR_ABORTED')) return;
    findings.push({
      where: context(),
      kind: 'peticion fallida',
      detail: `${request.method()} ${request.url().slice(0, 160)} ${failure}`,
    });
  });
}

async function setupRole(page: Page, role: Role, mode: Mode) {
  await page.addInitScript(
    (value) => {
      if (sessionStorage.getItem('enarm.audit.preset') === '1') return;
      sessionStorage.setItem('enarm.audit.preset', '1');
      localStorage.setItem('enarm.preferences.v1', JSON.stringify(value));
    },
    { theme: 'system', role, database: mode === 'demo' ? 'demo' : 'real' },
  );
  if (mode === 'demo') {
    // La demostración se genera una vez en este navegador
    await page.goto(`${SCREENS.settings.path}?seccion=account`);
    await page.getByRole('radio', { name: new RegExp(t.database.demo) }).click();
    const panel = page.getByRole('region', { name: t.demoData.title });
    await panel.getByRole('button', { name: t.demoData.generate }).click();
    await expect(panel.getByRole('status')).toHaveText(/Listo\./, { timeout: 240_000 });
  } else if (role === 'student') {
    // Con una cuenta local, como la de un alumno nuevo
    await page.goto(SCREENS.onboarding.path);
    await page.getByLabel(t.onboarding.alias, { exact: true }).fill('Auditoria');
    await page.getByLabel(t.account.email, { exact: true }).fill('auditoria@ejemplo.mx');
    await page.getByLabel(t.onboarding.privacyAccept).check();
    await page.getByRole('button', { name: t.onboarding.create }).click();
    await expect(page.getByRole('heading', { level: 1, name: t.screens.home.title })).toBeVisible();
  }
}

async function checkScreen(page: Page, findings: Finding[], where: string) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  if (
    await page
      .getByText(t.routeError.title, { exact: true })
      .isVisible()
      .catch(() => false)
  ) {
    findings.push({
      where,
      kind: 'pantalla de error',
      detail: 'Se ve la pantalla de error de ruta',
    });
  }
  const hasHeading = await page
    .getByRole('heading', { level: 1 })
    .first()
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!hasHeading) findings.push({ where, kind: 'sin titulo', detail: 'No hay un h1' });
  const widths = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    screen: document.documentElement.clientWidth,
  }));
  if (widths.content > widths.screen) {
    findings.push({
      where,
      kind: 'desborde',
      detail: `El contenido mide ${widths.content} y la pantalla ${widths.screen}`,
    });
  }
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  for (const violation of results.violations) {
    if (
      violation.impact === 'serious' ||
      violation.impact === 'critical' ||
      violation.impact === 'moderate'
    ) {
      findings.push({
        where,
        kind: `axe ${violation.impact}`,
        detail: `${violation.id} en ${violation.nodes
          .slice(0, 3)
          .map((node) => node.target.join(' '))
          .join(', ')}`,
      });
    }
  }
  // Imágenes rotas
  const broken = await page.evaluate(() =>
    [...document.images]
      .filter((image) => image.complete && image.naturalWidth === 0)
      .map((image) => image.src.slice(0, 120)),
  );
  for (const source of broken) findings.push({ where, kind: 'imagen rota', detail: source });
  await checkText(page, findings, where);
  await checkKeyboard(page, findings, where);
}

/** Texto roto que se cuela cuando falta un dato, una fecha no se pudo leer o una cifra no es número */
const BROKEN_TEXT = /\bundefined\b|\bNaN\b|\[object Object\]|Invalid Date|\bnull\b|Infinity/;

async function checkText(page: Page, findings: Finding[], where: string) {
  const text = await page.evaluate(() => document.body.innerText);
  const match = BROKEN_TEXT.exec(text);
  if (match) {
    const at = match.index;
    findings.push({
      where,
      kind: 'texto roto',
      detail: text.slice(Math.max(0, at - 40), at + 40).replace(/\s+/g, ' '),
    });
  }
}

/** Con Tab el foco avanza, no se queda atrapado y siempre cae en algo que se ve */
async function checkKeyboard(page: Page, findings: Finding[], where: string) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  let previous = '';
  let stuck = 0;
  const visited = new Set<string>();
  for (let step = 0; step < 80; step += 1) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) {
        return { id: 'body', visible: true, outline: true, parts: 3 };
      }
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const outline = style.outlineStyle !== 'none' || style.boxShadow !== 'none';
      const label = (element.textContent || '').trim().slice(0, 30);
      const id = `${element.tagName}|${label}|${Math.round(rect.top)}|${Math.round(rect.left)}`;
      // Un campo de fecha o de hora tiene varias paradas del teclado adentro, una por parte
      const type = element.getAttribute('type') ?? '';
      const parts = ['date', 'time', 'datetime-local', 'month', 'week'].includes(type) ? 6 : 3;
      return { id, visible: rect.width > 0 && rect.height > 0, outline, parts };
    });
    if (info.id === previous) {
      stuck += 1;
      if (stuck >= info.parts) {
        findings.push({
          where,
          kind: 'trampa de teclado',
          detail: `El foco no avanza desde ${info.id}`,
        });
        return;
      }
    } else stuck = 0;
    if (!info.visible) {
      findings.push({
        where,
        kind: 'foco invisible',
        detail: `El foco cayó en algo sin tamaño ${info.id}`,
      });
      return;
    }
    if (!info.outline) findings.push({ where, kind: 'foco sin indicador', detail: info.id });
    if (visited.has(info.id) && info.id !== previous) break;
    visited.add(info.id);
    previous = info.id;
  }
}

interface Control {
  key: string;
  name: string;
}

async function listControls(page: Page): Promise<Control[]> {
  return page.evaluate(() => {
    const selector =
      'main button, main a[href], main [role="tab"], main [role="switch"], main summary, main input[type="checkbox"], main input[type="radio"], main [role="radio"], main select';
    const result: { key: string; name: string }[] = [];
    document.querySelectorAll<HTMLElement>(selector).forEach((element, index) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (rect.width === 0 || rect.height === 0 || style.visibility === 'hidden') return;
      if (element instanceof HTMLButtonElement && element.disabled) return;
      if (element instanceof HTMLAnchorElement) {
        const url = new URL(element.href, location.href);
        if (
          url.origin !== location.origin ||
          element.target === '_blank' ||
          element.hasAttribute('download')
        )
          return;
      }
      const name = (
        element.getAttribute('aria-label') ??
        (element.textContent || (element as HTMLInputElement).value)
      )
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60);
      result.push({ key: `${element.tagName}|${name}|${index}`, name });
    });
    return result;
  });
}

async function clickThrough(
  page: Page,
  findings: Finding[],
  where: string,
  budget: number,
): Promise<number> {
  const startUrl = page.url();
  const done = new Set<string>();
  let clicks = 0;
  for (let step = 0; step < budget; step += 1) {
    const controls = await listControls(page);
    const next = controls.find(
      (control) => !done.has(control.name) && !SKIP_NAME.test(control.name),
    );
    if (!next) break;
    done.add(next.name);
    const index = Number(next.key.split('|').at(-1));
    const locator = page
      .locator(
        'main button, main a[href], main [role="tab"], main [role="switch"], main summary, main input[type="checkbox"], main input[type="radio"], main [role="radio"], main select',
      )
      .nth(index);
    const tag = await locator.evaluate((element) => element.tagName).catch(() => '');
    try {
      if (tag === 'SELECT') {
        const options = await locator.locator('option').count();
        if (options > 1) await locator.selectOption({ index: options - 1 }, { timeout: 2000 });
      } else {
        await locator.click({ timeout: 2000 });
      }
    } catch {
      // Un control que ya no está o quedó tapado no es un hallazgo del recorrido
      continue;
    }
    clicks += 1;
    await page.waitForTimeout(120);
    await checkOverlay(page, findings, `${where} > ${next.name}`);
    // Cierra lo que se haya abierto y vuelve a la pantalla de partida
    if (
      await page
        .getByRole('dialog')
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await page.keyboard.press('Escape');
    }
    if (new URL(page.url()).pathname !== new URL(startUrl).pathname) {
      await page.goto(startUrl);
      await page.waitForLoadState('networkidle').catch(() => undefined);
    }
  }
  return clicks;
}

async function checkOverlay(page: Page, findings: Finding[], where: string) {
  if (
    await page
      .getByText(t.routeError.title, { exact: true })
      .isVisible()
      .catch(() => false)
  ) {
    findings.push({
      where,
      kind: 'pantalla de error',
      detail: 'La pantalla de error de ruta apareció tras el clic',
    });
  }
}

for (const role of ROLES) {
  for (const mode of MODES) {
    // En una cuenta vacía solo el alumno tiene algo que ver. Los demás roles abren las mismas pantallas
    if (mode === 'vacio' && role !== 'student') continue;
    test(`recorrido ${role} con datos ${mode}`, async ({ page }, info) => {
      const findings: Finding[] = [];
      const stats: string[] = [];
      let current = 'preparación';
      watch(page, findings, () => current);
      await setupRole(page, role, mode);
      for (const key of SCREEN_KEYS) {
        // El rol de estas pantallas ya se probó, y la bienvenida y la portada crearían o cerrarían la sesión
        if (key === 'roleSelector') continue;
        current = `${key} ${SCREENS[key].path}`;
        await page.goto(SCREENS[key].path);
        await checkScreen(page, findings, current);
        const clicks = await clickThrough(page, findings, current, 25);
        stats.push(`${key}=${clicks}`);
      }
      const name = `${role}-${mode}-${info.project.name}`;
      writeFileSync(join(OUT_DIR, `${name}.json`), `${JSON.stringify(findings, null, 2)}\n`);
      console.log(`RECORRIDO ${name} hallazgos ${findings.length}`);
      console.log(`  clics por pantalla ${stats.join(' ')}`);
      for (const finding of findings.slice(0, 60)) {
        console.log(`  - ${finding.kind} | ${finding.where} | ${finding.detail}`);
      }
    });
  }
}
