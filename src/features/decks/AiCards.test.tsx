// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { PLANS } from '@/config/billing';
import type { DataApi } from '@/data/context';
import type { User } from '@/data/schemas/people';
import { t } from '@/i18n/es-MX';

// Cada prueba arma toda la pantalla de Mazos y genera tarjetas, así que necesita más de 5 segundos
vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 20_000 };

const MATERIAL =
  'La metformina es el tratamiento de primera línea de la diabetes mellitus tipo 2. ' +
  'La dosis inicial habitual es de 500 mg cada 12 horas con los alimentos. ' +
  'Nunca debe usarse con una tasa de filtrado glomerular menor de 30 ml/min. ' +
  'La retinopatía diabética se caracteriza por microaneurismas y hemorragias retinianas en el fondo de ojo.';

async function subscribe(api: DataApi, user: User, plan: 'monthly' | 'free' = 'monthly') {
  await api.repos.subscriptions.put({
    userId: user.id,
    plan,
    status: plan === 'free' ? 'none' : 'active',
    isSimulated: true,
    updatedAt: '2026-10-01T10:00:00.000Z',
  });
}

async function open(plan: 'monthly' | 'free' = 'monthly') {
  app = await renderApp(SCREENS.decks.path, {
    seed: async (api, user) => {
      await subscribe(api, user, plan);
    },
  });
  return screen.findByRole('region', { name: t.aiCards.title }, WAIT);
}

/** Pulsa Generar cuando el botón ya se encendió. Antes de conocer el plan no hace nada */
async function pressGenerate(typing: ReturnType<typeof userEvent.setup>, card: HTMLElement) {
  const button = within(card).getByRole('button', { name: t.aiCards.generate });
  await waitFor(() => {
    expect(button).toBeEnabled();
  }, WAIT);
  await typing.click(button);
}

async function generate(typing: ReturnType<typeof userEvent.setup>, text = MATERIAL) {
  const card = await open();
  // Pegar un texto largo con type tardaría, así que se cambia el valor de golpe
  fireEvent.change(within(card).getByLabelText(t.aiCards.textLabel), { target: { value: text } });
  await pressGenerate(typing, card);
  await screen.findByRole('heading', { name: t.aiCards.resultTitle }, WAIT);
  return card;
}

describe('tarjetas con IA en Mazos', () => {
  it('el plan Gratis no la incluye y ofrece ver los planes', async () => {
    app = await renderApp(SCREENS.decks.path);
    expect(
      await screen.findByText(
        t.billing.featureLocked(t.billing.featureNames.aiCards),
        undefined,
        WAIT,
      ),
    ).toBeVisible();
    expect(screen.queryByRole('region', { name: t.aiCards.title })).toBeNull();
  });

  it('un plan de pago ve su cuota, el modo simulado y las reglas', async () => {
    const card = await open();
    expect(
      await within(card).findByText(
        t.aiCards.left(PLANS.monthly.aiCardsPerDay, PLANS.monthly.aiCardsPerDay),
      ),
    ).toBeVisible();
    expect(within(card).getByText(t.aiCards.modes.template)).toBeVisible();
    expect(within(card).getByText(t.aiCards.rules)).toBeVisible();
  });

  it('pide un texto y no procesa uno demasiado corto', async () => {
    const typing = userEvent.setup();
    const card = await open();
    await pressGenerate(typing, card);
    expect(await within(card).findByText(t.aiCards.textRequired, undefined, WAIT)).toBeVisible();
    fireEvent.change(within(card).getByLabelText(t.aiCards.textLabel), {
      target: { value: 'Muy corto' },
    });
    await pressGenerate(typing, card);
    expect(await within(card).findByText(t.aiCards.textTooShort, undefined, WAIT)).toBeVisible();
  });

  it('propone tarjetas con su cita, en borrador, y descuenta una generación', async () => {
    const typing = userEvent.setup();
    const card = await generate(typing);
    const list = within(card)
      .getAllByRole('listitem')
      .filter((item) => within(item).queryByText(t.aiCards.draftLabel));
    expect(list.length).toBeGreaterThan(1);
    // Cada una trae la frase del material y la etiqueta de borrador sin validar
    for (const item of list) {
      expect(within(item).getByText(t.aiCards.quote)).toBeVisible();
      expect(within(item).getByText(t.aiCards.draftLabel)).toBeVisible();
    }
    expect(await app?.api.repos.aiCallLog.list()).toHaveLength(1);
    // Nada se guardó todavía
    expect(await app?.api.repos.notes.list()).toHaveLength(0);
  });

  it('una afirmación absoluta trae su señal con fuentes de la lista y sin corregir el texto', async () => {
    const typing = userEvent.setup();
    const card = await generate(typing);
    const signal = within(card).getByLabelText(t.controversy.title);
    expect(within(signal).getByText(t.controversy.notChanged)).toBeVisible();
    expect(within(signal).getByText(/Guías de Práctica Clínica del CENETEC/)).toBeVisible();
    // Antes de guardar solo se lee, sin botones
    expect(within(signal).queryByRole('button')).toBeNull();
  });

  it('guarda solo las elegidas, siempre en borrador, y quedan citadas en el mazo Tarjetas con IA', async () => {
    const typing = userEvent.setup();
    const card = await generate(typing);
    await typing.click(within(card).getByRole('button', { name: t.aiCards.selectNone }));
    await typing.click(within(card).getByLabelText(t.aiCards.select(1)));
    await typing.click(within(card).getByLabelText(t.aiCards.select(2)));
    await typing.click(within(card).getByRole('button', { name: t.aiCards.save(2) }));
    expect(await within(card).findByText(t.aiCards.savedTitle, undefined, WAIT)).toBeVisible();
    const notes = await app?.api.repos.notes.list();
    expect(notes).toHaveLength(2);
    expect(
      notes?.every((note) => note.origin === 'generated' && note.editorialStatus === 'draft'),
    ).toBe(true);
    expect(
      notes?.every((note) => note.sourceQuote && note.sourceTitle === t.aiCards.defaultSource),
    ).toBe(true);
    const decks = await app?.api.repos.decks.list();
    expect(decks?.some((deck) => deck.name === 'Tarjetas con IA')).toBe(true);
  });

  it('una edición que mete algo que la frase no dice se avisa', async () => {
    const typing = userEvent.setup();
    const card = await generate(typing);
    const first = within(card).getAllByText(t.aiCards.edit)[0] as HTMLElement;
    await typing.click(first);
    const front = within(card).getAllByLabelText(t.aiCards.front)[0] as HTMLElement;
    await typing.clear(front);
    await typing.type(
      front,
      'Una pregunta con una cifra nueva, 9999 mg, y un fármaco como glibenclamida',
    );
    expect(await within(card).findByText(t.aiCards.editedIssues)).toBeVisible();
  });

  it('al agotar la cuota del día avisa y no deja generar más', async () => {
    const typing = userEvent.setup();
    const card = await open();
    for (let n = 0; n < PLANS.monthly.aiCardsPerDay; n += 1) {
      await app?.api.repos.aiCallLog.put({
        id: `01J0000000000000000000${String(n).padStart(4, '0')}`.slice(0, 26),
        userId: app.user.id,
        engine: 'flashcards',
        mode: 'template',
        model: 'x',
        at: new Date().toISOString(),
        inputTokens: 0,
        outputTokens: 0,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        estimatedCostUsd: 0,
        latencyMs: 1,
        outcome: 'ok',
      });
    }
    await waitFor(() => {
      expect(within(card).getByText(t.aiCards.left(0, PLANS.monthly.aiCardsPerDay))).toBeVisible();
    }, WAIT);
    expect(within(card).getByRole('button', { name: t.aiCards.generate })).toBeDisabled();
    expect(typing).toBeDefined();
  });

  it('un archivo de texto llena el campo y el nombre de la fuente', async () => {
    const typing = userEvent.setup();
    const card = await open();
    await typing.upload(
      within(card).getByLabelText(t.aiCards.fileLabel),
      new File([MATERIAL], 'Guía de diabetes.txt', { type: 'text/plain' }),
    );
    await waitFor(() => {
      expect(within(card).getByLabelText(t.aiCards.textLabel)).toHaveValue(MATERIAL);
    }, WAIT);
    expect(within(card).getByLabelText(t.aiCards.sourceName)).toHaveValue('Guía de diabetes.txt');
  });
});
