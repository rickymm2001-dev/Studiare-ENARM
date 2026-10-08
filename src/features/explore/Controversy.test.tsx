// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenerationResult } from '@/ai/flashcards';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import type { User } from '@/data/schemas/people';
import { recordGeneration, saveProposals } from '@/data/usecases/aiCards';
import { t } from '@/i18n/es-MX';

vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 20_000 };

const result: GenerationResult = {
  proposals: [],
  rejected: 0,
  rejectedBy: {},
  sections: 1,
  sectionsCut: false,
  scrubbed: { email: 0, phone: 0, curp: 0, rfc: 0, url: 0, name: 0 },
  scrubbedTotal: 0,
  mode: 'template',
  model: 'plantilla-simulada-v1',
  fellBack: false,
  promptVersion: 'flashcards.provisional.v1',
  durationMs: 1,
  processedText: 'x',
};

/** Una tarjeta generada con señal y otra sin señal, guardadas como las guarda la pantalla */
async function seed(api: DataApi, user: User) {
  const { artifactId } = await recordGeneration(api, user, 'monthly', result, 'Guía.pdf');
  await saveProposals(api, user, {
    proposals: [
      {
        id: 'a',
        kind: 'basic',
        front: '¿Qué mide la HbA1c?',
        back: 'El promedio de la glucosa en tres meses',
        quote: 'La HbA1c mide el promedio de la glucosa en tres meses siempre',
        sectionIndex: 0,
        sectionTitle: null,
        duplicate: false,
        controversy: {
          reason:
            'La frase usa "siempre", una afirmación absoluta. En medicina casi toda regla tiene excepciones.',
          sources: [{ key: 'gpc_cenetec', locator: 'Capítulo de diabetes' }],
        },
      },
      {
        id: 'b',
        kind: 'basic',
        front: '¿Qué es la metformina?',
        back: 'Una biguanida de primera línea',
        quote: 'La metformina es una biguanida de primera línea',
        sectionIndex: 0,
        sectionTitle: null,
        duplicate: false,
        controversy: null,
      },
    ],
    sourceTitle: 'Guía.pdf',
    artifactId,
    simulated: true,
  });
  // El alumno sigue su propio mazo, así que aparece en Explorar y en Repasar
}

describe('señal de controversia en Explorar', () => {
  it('marca la tarjeta con la etiqueta de la IA y de borrador, y al verificarla la señal se va', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.explore.path, {
      seed: async (api, user) => {
        await api.repos.subscriptions.put({
          userId: user.id,
          plan: 'monthly',
          status: 'active',
          isSimulated: true,
          updatedAt: '2026-10-01T10:00:00.000Z',
        });
        await seed(api, user);
      },
    });
    const list = await screen.findByRole('list', { name: t.explore.list }, WAIT);
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    const flagged = rows.find((row) => within(row).queryByText(t.controversy.badge)) as HTMLElement;
    expect(within(flagged).getByText(t.aiCards.draftLabel)).toBeVisible();
    const clean = rows.find((row) => row !== flagged) as HTMLElement;
    expect(within(clean).queryByText(t.controversy.badge)).toBeNull();
    expect(within(clean).getByText(t.aiCards.draftLabel)).toBeVisible();

    // Al abrirla se ve la explicación con su fuente de la lista y que la IA no cambió la tarjeta
    await typing.click(within(flagged).getByRole('button', { name: /^Ver tarjeta/ }));
    const signal = await within(flagged).findByLabelText(t.controversy.title);
    expect(within(signal).getByText(/afirmación absoluta/)).toBeVisible();
    expect(within(signal).getByText(/Capítulo de diabetes/)).toBeVisible();
    expect(within(signal).getByText(t.controversy.notChanged)).toBeVisible();

    await typing.click(within(signal).getByRole('button', { name: t.controversy.verify }));
    await waitFor(() => {
      expect(screen.queryByText(t.controversy.badge)).toBeNull();
    }, WAIT);
    const events = (await app.api.repos.events.query({ userId: app.user.id })).filter(
      (event) => event.type === 'card_controversy_resolved',
    );
    expect(events).toHaveLength(1);
    // El texto de la tarjeta sigue igual
    const notes = await app.api.repos.notes.list();
    expect(notes.find((note) => note.sourceQuote?.includes('siempre'))).toMatchObject({
      sourceQuote: 'La HbA1c mide el promedio de la glucosa en tres meses siempre',
    });
  });
});
