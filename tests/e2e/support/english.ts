// Ayudas de las e2e de Inglés médico (B13, paquete B). Arman el banco simulado con español e inglés, entran
// con el banco abierto y con el plan Gratis o uno de pago, y dan los lugares de Simular que las specs
// buscan. Todo el texto sembrado es simulado y lleva [Prueba].
import type { Locator, Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { englishText } from '@/i18n/english';
import { t } from '@/i18n/es-MX';
import { enterWithLink, expect, reloadWithServerFlags } from './cloudFixtures';
import { openBank, seedBank } from './fakeBank';
import { createFakeBankStore, seedEnglishCases, type FakeBankStore } from './fakeBankStore';
import { attachBank, type FakeSupabaseServer } from './fakeSupabase';

export const ANA = 'ana.ingles@ejemplo.mx';
const DAY_MS = 86_400_000;

/**
 * El banco simulado enganchado al Supabase de la prueba, con preguntas en español y casos de lectura en
 * inglés ya publicados. Los casos alternan 2 y 3 preguntas por omisión, así 12 casos suman 30 reactivos
 */
export function englishBank(
  cloud: FakeSupabaseServer,
  options: { spanish: number; cases: number; itemsPerCase?: number | readonly number[] },
): FakeBankStore {
  const store = createFakeBankStore();
  attachBank(cloud, store);
  seedBank(store, options.spanish);
  if (options.cases > 0) {
    seedEnglishCases(store, options.cases, { itemsPerCase: options.itemsPerCase ?? [2, 3] });
  }
  return store;
}

/**
 * Entra con el banco abierto y la prueba gratis prendidos en el servidor, como lo hará Ricardo. Con
 * monthly la cuenta ya tiene el plan mensual, sin tope de preguntas
 */
export async function enterWithOpenBank(
  page: Page,
  cloud: FakeSupabaseServer,
  plan: 'free' | 'monthly',
): Promise<void> {
  openBank(cloud);
  cloud.setFeatureFlags({ freeTrial: true });
  if (plan === 'monthly') {
    cloud.createUser({ email: ANA, alias: 'Ana' });
    cloud.setSubscription(ANA, {
      plan: 'monthly',
      status: 'active',
      provider: 'stripe',
      currentPeriodEnd: new Date(Date.now() + 20 * DAY_MS).toISOString(),
    });
  }
  await enterWithLink(page, cloud, ANA, 'Ana');
  await reloadWithServerFlags(page);
}

/** La práctica en español de Simular */
export const practiceCard = (page: Page) =>
  page.getByRole('region', { name: t.simulator.setupTitle });

/** La tarjeta de Inglés médico de Simular */
export const englishCard = (page: Page) =>
  page.getByRole('region', { name: englishText.practice.title });

/** La tarjeta del examen completo de Simular */
export const examCard = (page: Page) => page.getByRole('region', { name: t.exam.cardTitle });

/** Abre Simular y espera a que el catálogo de la nube esté cargado */
export async function openSimulator(page: Page): Promise<void> {
  await page.goto(SCREENS.simulatorSetup.path);
  await expect(practiceCard(page)).toBeVisible({ timeout: 60_000 });
}

/** El navegador del examen, la lista plegable para ir a cualquier pregunta */
export const examNavigator = (page: Page) =>
  page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: t.exam.navigatorTitle }) });

/**
 * El texto que se está leyendo en inglés. Es el único elemento con lang="en" que lleva el texto del
 * caso, y no la pregunta ni las opciones
 */
export const passageText = (scope: Page | Locator) =>
  scope.locator('p[lang="en"]').filter({ hasText: 'Simulated reading passage' });

/** Cuántas preguntas trae el texto que se está leyendo, de la línea Pregunta 1 de 3 de este texto */
export async function textSize(page: Page): Promise<number> {
  const line = page.getByText(/Pregunta \d+ de \d+ de este texto/);
  await expect(line).toBeVisible();
  const match = /de (\d+) de este texto/.exec((await line.textContent()) ?? '');
  if (!match) throw new Error('La pantalla no dice cuántas preguntas trae el texto');
  return Number(match[1]);
}

/** El número del texto simulado en pantalla, de Simulated reading passage 7 */
export async function passageNumber(page: Page): Promise<number> {
  const text = (await passageText(page).textContent()) ?? '';
  const match = /Simulated reading passage (\d+)/.exec(text);
  if (!match) throw new Error('No se ve el texto en inglés');
  return Number(match[1]);
}

/** Si la pantalla es angosta como un teléfono. El texto se pliega ahí desde la segunda pregunta */
export const isPhone = (page: Page): boolean => (page.viewportSize()?.width ?? 0) < 1024;
