// Ayudantes de las e2e que cierran los huecos de la auditoría inicial (B1, D-119). Cambiar de rol
// con /rol, suscribirse con el pago simulado, seguir el mazo más chico, salir y volver a entrar,
// cambiar de base y generar la demostración desde Datos de demostración del admin (B3), elegir cuándo
// llega la retroalimentación en Ajustes del repaso (B3), leer y sembrar tablas de IndexedDB y dejar
// umbrales del admin guardados antes de que cargue la app. Nada de aquí toca src ni fixtures.ts
import type { Locator, Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { OVERRIDES_KEY, type StoredOverrides } from '@/config/overridesStore';
import { DATABASE_NAMES, type DatabaseKind } from '@/data/databases';
import type { TableName } from '@/data/db/tables';
import { examTotalMs } from '@/engines/exam';
import { t } from '@/i18n/es-MX';
import { adminText } from '@/i18n/admin';
import { expect } from './fixtures';

export type DeviceRole = 'student' | 'physician' | 'admin' | 'owner';

/** Un texto fijo de la interfaz, listo para ir dentro de una expresión regular */
export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** El correo con el que signUp crea cada cuenta local */
export const emailOf = (alias: string): string => `${alias.toLowerCase()}@ejemplo.mx`;

/** Cambia el rol del dispositivo desde la pantalla 26, sin nube (D-059) */
export async function enterAs(page: Page, role: DeviceRole): Promise<void> {
  await page.goto(SCREENS.roleSelector.path);
  await page.getByRole('radio', { name: new RegExp(t.roles.names[role]) }).click();
  await page.getByRole('button', { name: t.roles.enterAs(t.roles.names[role]) }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

/** Contrata el plan mensual con el pago simulado, que no cobra nada (3.2) */
export async function subscribeMonthly(page: Page): Promise<void> {
  await page.goto(SCREENS.subscription.path);
  await page.getByRole('button', { name: t.billing.choose(t.billing.plans.monthly) }).click();
  await page.getByRole('button', { name: t.billing.confirm }).click();
  await expect(page.getByText(t.billing.receiptTitle)).toBeVisible({ timeout: 15_000 });
}

/**
 * Sigue el mazo precargado más chico, para que las pruebas de repaso sean rápidas. Seguir mazos del
 * catálogo es de los planes de pago (4.25, B8), así que antes contrata el mensual simulado. Es para
 * una cuenta recién creada, que empieza en Gratis
 */
export async function followSmallestDeck(page: Page): Promise<void> {
  await subscribeMonthly(page);
  await page.goto(SCREENS.decks.path);
  const deck = page.getByRole('listitem').filter({ hasText: 'Urgencias (Paco)' });
  await deck.getByRole('button', { name: t.decks.follow }).click();
  await expect(deck.getByRole('button', { name: t.decks.unfollow })).toBeVisible({
    timeout: 60_000,
  });
}

/** Cierra la sesión local desde Perfil, en Configuración. Sin sesión la raíz vuelve a ser la portada */
export async function signOut(page: Page): Promise<void> {
  await page.goto(`${SCREENS.settings.path}#perfil`);
  await page.getByRole('button', { name: t.session.signOut }).click();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.landing.title);
}

/** Vuelve a entrar con el correo de una cuenta que signUp creó en este navegador */
export async function signIn(page: Page, alias: string): Promise<void> {
  await page.goto(SCREENS.onboarding.path);
  await page.getByRole('tab', { name: t.onboarding.loginTab }).click();
  await page.getByLabel(t.account.email, { exact: true }).fill(emailOf(alias));
  await page.getByRole('button', { name: t.onboarding.signIn }).click();
  await expect(page.getByRole('heading', { level: 2, name: t.home.reviewsTitle })).toBeVisible();
}

/**
 * Abre Datos de demostración como admin y deja la base que se pide. El selector de base vive ahí
 * desde B3 (5.4 del plan del cambio). Al terminar vuelve al rol de alumno, salvo que se pida quedarse
 */
export async function switchDatabase(
  page: Page,
  database: DatabaseKind,
  options: { stayAsAdmin?: boolean } = {},
): Promise<void> {
  await enterAs(page, 'admin');
  await page.goto(SCREENS.demoData.path);
  await page.getByRole('radio', { name: new RegExp(t.database[database]) }).click();
  await expect(page.getByText(t.database.storedIn(DATABASE_NAMES[database]))).toBeVisible();
  if (!options.stayAsAdmin) await enterAs(page, 'student');
}

/** Cambia a la base de demostración y genera sus datos en el worker. Tarda hasta un par de minutos */
export async function generateDemo(page: Page, timeout = 150_000): Promise<void> {
  await switchDatabase(page, 'demo', { stayAsAdmin: true });
  const generator = page.getByRole('region', { name: adminText.adminDemo.adjust.title });
  await generator.getByRole('button', { name: adminText.adminDemo.generate }).click();
  await expect(generator.getByRole('status')).toHaveText(
    new RegExp(escapeRegExp(adminText.adminDemo.done.generate(0)).replace('0', '[\\d,]+')),
    { timeout },
  );
  await enterAs(page, 'student');
}

/** Ajustes del repaso, el panel de Repasar con todo lo que se guarda del repaso (B3) */
export const reviewSettingsPanel = (page: Page): Locator =>
  page.getByRole('dialog', { name: t.settingsPage.reviewSettings.title });

/**
 * Elige cuándo llega la retroalimentación de la práctica. Se cambia solo en Ajustes del repaso y
 * Simular la muestra de solo lectura (B3 del plan del cambio). Abre el panel con su dirección y, si
 * el valor cambió, lo guarda
 */
export async function setPracticeFeedback(page: Page, feedback: 'end' | 'each'): Promise<void> {
  await page.goto(`${SCREENS.review.path}?ajustes=1`);
  const panel = reviewSettingsPanel(page);
  const field = panel.getByRole('combobox', { name: t.settings.practiceFeedback });
  await field.selectOption(feedback);
  await expect(field).toHaveValue(feedback);
  const save = panel.getByRole('button', { name: t.settings.saveChanges });
  if (await save.isVisible()) {
    await save.click();
    await expect(panel.getByText(t.settings.saved, { exact: true })).toBeVisible();
  }
}

/**
 * Deja umbrales del admin guardados antes de que cargue la app, como si los hubiera cambiado en la
 * pantalla 25. La app los lee una sola vez al abrir, por eso van antes de la primera navegación
 */
export async function presetThresholds(
  page: Page,
  thresholds: NonNullable<StoredOverrides['thresholds']>,
): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
    [OVERRIDES_KEY, { thresholds }] as const,
  );
}

/** Una tabla completa de la base local, tal como está en IndexedDB */
export async function readTable<T>(
  page: Page,
  table: TableName,
  database: DatabaseKind = 'real',
): Promise<T[]> {
  return page.evaluate(
    ([name, store]) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onerror = () => {
          reject(new Error(`No se pudo abrir la base ${name}`));
        };
        open.onsuccess = () => {
          const db = open.result;
          const all = db.transaction(store, 'readonly').objectStore(store).getAll();
          all.onerror = () => {
            db.close();
            reject(new Error(`No se pudo leer la tabla ${store}`));
          };
          all.onsuccess = () => {
            db.close();
            resolve(all.result as T[]);
          };
        };
      }),
    [DATABASE_NAMES[database], table] as const,
  );
}

/**
 * Guarda filas en una tabla de la base local con las llaves que usa la app. Sirve para sembrar lo
 * que ninguna pantalla deja crear en una prueba, como las etiquetas de un segundo médico. Las
 * pantallas no se enteran solas, así que después hay que recargar
 */
export async function putRows(
  page: Page,
  table: TableName,
  rows: readonly unknown[],
  database: DatabaseKind = 'real',
): Promise<void> {
  await page.evaluate(
    ([name, store, items]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onerror = () => {
          reject(new Error(`No se pudo abrir la base ${name}`));
        };
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction(store, 'readwrite');
          const objectStore = transaction.objectStore(store);
          for (const item of items) objectStore.put(item);
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          const fail = () => {
            db.close();
            reject(new Error(transaction.error?.message ?? `No se pudo escribir en ${store}`));
          };
          transaction.onerror = fail;
          transaction.onabort = fail;
        };
      }),
    [DATABASE_NAMES[database], table, rows] as const,
  );
}

/** La cifra de una celda del panel de cifras (StatPanel), por el nombre del panel y la etiqueta de la celda */
export function statValue(page: Page, panel: string, label: string): Locator {
  return page
    .getByRole('region', { name: panel })
    .locator('> div')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('> span')
    .nth(1);
}

/** Número de una cifra del panel, sin separadores de miles */
export async function statNumber(page: Page, panel: string, label: string): Promise<number> {
  const cell = statValue(page, panel, label);
  await expect(cell).toHaveText(/\d/);
  return Number((await cell.innerText()).replace(/,/g, ''));
}

/** La fila de una cuenta en Usuarios, por su alias. La fila propia lleva "(tú)" pegado al alias */
export const userRow = (page: Page, alias: string): Locator =>
  page.locator('section').filter({
    has: page.locator('p', { hasText: new RegExp(`^${escapeRegExp(alias)}(\\s?\\(|$)`) }),
  });

/** Los modos de Armar tu simulador, las tres tarjetas del formulario (D-150) */
export type SimulatorMode = 'practice' | 'exam' | 'targeted';

/** El formulario de Simular en los modos Práctica y Dirigido, la región Configura tu práctica */
export const practiceSetup = (page: Page): Locator =>
  page.getByRole('region', { name: t.simulator.setupTitle });

/** El formulario de Simular en el modo Examen, la región Examen completo */
export const examSetup = (page: Page): Locator =>
  page.getByRole('region', { name: t.exam.cardTitle });

/**
 * Elige el modo del simulador en sus tarjetas. Espera a que el formulario cargue, porque el banco
 * demo se siembra la primera vez que se entra y puede tardar
 */
export async function chooseSimulatorMode(page: Page, mode: SimulatorMode): Promise<void> {
  const group = page.getByRole('radiogroup', { name: t.simulator.mode.legend });
  await expect(group).toBeVisible({ timeout: 90_000 });
  const option = group.getByRole('radio', {
    name: new RegExp(`^${escapeRegExp(t.simulator.mode[mode])}`),
  });
  await option.click();
  await expect(option).toBeChecked();
}

/** Un control segmentado, el fieldset con su leyenda y un botón presionado por opción */
export const segmented = (scope: Page | Locator, legend: string): Locator =>
  scope.getByRole('group', { name: legend, exact: true });

/** Presiona una opción de un control segmentado y espera a que quede elegida */
export async function pickSegment(
  scope: Page | Locator,
  legend: string,
  option: string,
): Promise<void> {
  const button = segmented(scope, legend).getByRole('button', { name: option, exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

/** La opción que un control segmentado tiene elegida */
export async function expectSegment(
  scope: Page | Locator,
  legend: string,
  option: string,
): Promise<void> {
  await expect(
    segmented(scope, legend).getByRole('button', { name: option, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
}

/**
 * Abre Simular en el modo Práctica o Dirigido y, si se pide, elige cuántas preguntas. Devuelve la
 * región del formulario
 */
export async function openPracticeSetup(
  page: Page,
  options: { mode?: 'practice' | 'targeted'; count?: number } = {},
): Promise<Locator> {
  await page.goto(SCREENS.simulatorSetup.path);
  await chooseSimulatorMode(page, options.mode ?? 'practice');
  const setup = practiceSetup(page);
  await expect(setup).toBeVisible();
  if (options.count !== undefined) {
    await pickSegment(setup, t.simulator.count, String(options.count));
  }
  return setup;
}

/** Abre Simular en el modo Examen y devuelve la región del examen completo */
export async function openExamSetup(page: Page): Promise<Locator> {
  await page.goto(SCREENS.simulatorSetup.path);
  await chooseSimulatorMode(page, 'exam');
  const setup = examSetup(page);
  await expect(setup).toBeVisible();
  return setup;
}

/** Un número dentro de un texto fijo de la interfaz, armado con 0 en el lugar de la cifra */
const numberIn = async (note: Locator, template: string): Promise<number> => {
  const pattern = new RegExp(`^${escapeRegExp(template).replace('0', '([\\d,]+)')}$`);
  await expect(note).toHaveText(pattern);
  const match = pattern.exec(await note.innerText());
  return Number(match?.[1]?.replace(/,/g, ''));
};

/** Cuántas preguntas quedan con los filtros de ahora, de la nota debajo de las ramas */
export const availableCount = (setup: Locator): Promise<number> =>
  numberIn(setup.getByText(/preguntas? disponibles? con estos filtros$/), t.simulator.available(0));

/** Cuántas preguntas tiene el banco de demostración, de la nota debajo de las ramas */
export const bankCount = (setup: Locator): Promise<number> =>
  numberIn(setup.getByText(/^Banco de demostración con /), t.simulator.bankNote(0));

/**
 * Arma un examen completo desde Simular con el tamaño pedido y entra a él. El banco demo se siembra
 * la primera vez que se entra y puede tardar
 */
export async function startExam(page: Page, size: number): Promise<void> {
  const setup = await openExamSetup(page);
  await pickSegment(setup, t.exam.size, t.exam.sizeOption(size));
  await expect(setup.getByText(t.exam.timeTotal(examTotalMs(size)))).toBeVisible();
  await setup.getByRole('button', { name: t.exam.start }).click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.exam.path}$`));
  await expect(page.getByRole('timer')).toBeVisible();
}

/**
 * Contesta con el teclado las primeras `count` preguntas de un examen de `total`. A elige la
 * primera opción y Enter pasa a la siguiente. Espera a que cada pregunta esté en pantalla antes de
 * teclear, para no contestar sobre la que se está yendo
 */
export async function answerExamQuestions(page: Page, total: number, count: number): Promise<void> {
  for (let number = 1; number <= count; number += 1) {
    await expect(page.getByText(t.exam.progress(number, total), { exact: true })).toBeVisible();
    const first = page.getByRole('radio').first();
    await expect(first).toBeVisible();
    await page.keyboard.press('a');
    await expect(first).toBeChecked();
    if (number < total) await page.keyboard.press('Enter');
  }
}

/** Termina el examen con el diálogo y espera a que los resultados guarden las respuestas */
export async function finishExam(
  page: Page,
  counts: { answered: number; blank: number; marked: number },
): Promise<void> {
  await page.getByRole('button', { name: t.exam.finish }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByText(t.exam.finishBody(counts.answered, counts.blank, counts.marked)),
  ).toBeVisible();
  await dialog.getByRole('button', { name: t.exam.finishConfirm }).click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.examResults.path}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.examResults.title);
  await expect(page.getByText(t.examResults.saving)).toHaveCount(0, { timeout: 90_000 });
  await expect(page.getByText(t.examResults.saveError)).toHaveCount(0);
}
