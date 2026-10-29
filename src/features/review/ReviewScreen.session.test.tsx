// @vitest-environment jsdom
// La sesión de repaso al estilo de la portada (D-150). Pestañas con el avance arriba, la tarjeta en
// crema con su rama y el vencimiento, los cuatro botones con su tecla, Esta sesión con cifras reales,
// la tarjeta del Pomodoro y las acciones sobre la tarjeta.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import type { DataApi } from '@/data/context';
import { newId } from '@/data/testing/fixtures';
import { seedManualCards, seedOverdueCards } from '@/data/testing/seedCards';
import type { User } from '@/data/schemas/people';
import { t } from '@/i18n/es-MX';

// El confeti usa un canvas que jsdom no trae
vi.mock('@/ui/celebrate', () => ({ celebrate: () => undefined }));

vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const NOW = '2026-10-01T15:00:00.000Z';

/** Una tarjeta generada con su frase de la fuente y el nombre del texto del alumno */
function seedSourcedCard() {
  return async (api: DataApi, user: User) => {
    const deckId = newId();
    const noteId = newId();
    await api.repos.decks.put({
      id: deckId,
      name: 'Mazo generado',
      description: '',
      ownerId: user.id,
      origin: 'generated',
      visibility: 'private',
      isDemo: false,
      createdAt: NOW,
    });
    await api.repos.notes.put({
      id: noteId,
      deckId,
      tags: [],
      origin: 'generated',
      editorialStatus: 'draft',
      sourceQuote: 'Si el potasio es menor de 3.3 se difiere la insulina',
      sourceQuestionVersionId: null,
      sourceTitle: 'Mis apuntes de endocrino',
      isDemo: false,
      createdAt: NOW,
      kind: 'basic',
      front: '<p>¿Primer paso en cetoacidosis con potasio bajo?</p>',
      back: '<p>Reponer potasio</p>',
    });
    await api.repos.cards.put({ id: newId(), noteId, deckId, ordinal: 0, createdAt: NOW });
  };
}

async function start(typing: ReturnType<typeof userEvent.setup>, count: number) {
  await typing.click(
    await screen.findByRole('button', { name: t.reviewSetup.start(count) }, { timeout: 10_000 }),
  );
}

const rating = (value: keyof typeof t.review.ratings) =>
  screen.getByRole('button', { name: new RegExp(`^${t.review.ratings[value]}`) });

describe('la sesión de repaso con el diseño de la portada (D-150)', () => {
  it('lleva las pestañas, el avance y Esta sesión con cifras reales que suben al calificar', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, {
      seed: async (api, user) => {
        await seedManualCards(api, user, { count: 3, suspended: 0 });
      },
    });
    await start(typing, 3);
    // Pestañas con Repasar activa y el avance a su derecha, con la barra debajo
    const tabs = screen.getByRole('navigation', { name: t.studyTabs.label });
    expect(within(tabs).getByRole('link', { name: t.studyTabs.review })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText(t.review.progress(1, 3))).toBeVisible();
    const bar = screen.getByRole('progressbar', { name: t.review.progressLabel });
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '3');
    // El título de la pantalla sigue para el lector de pantalla, aunque arriba vayan las pestañas
    expect(
      screen.getByRole('heading', { level: 1, name: t.screens.review.title }),
    ).toBeInTheDocument();

    const stats = screen.getByRole('region', { name: t.review.sessionStats.title });
    const cell = (label: string) =>
      within(stats).getByText(label).previousSibling as HTMLElement | null;
    expect(cell(t.review.sessionStats.done)).toHaveTextContent('0');

    // La respuesta sale con su kicker y los cuatro botones llevan nombre, tecla e intervalo
    await typing.click(screen.getByRole('button', { name: t.review.show }));
    expect(screen.getByText(t.review.answer)).toBeVisible();
    expect(rating('again')).toHaveAccessibleName(/^Otra vez \[1\] en/);
    expect(rating('good')).toHaveAccessibleName(/^Bien \[3\] en/);
    await typing.click(rating('good'));

    expect(await screen.findByText(t.review.progress(2, 3))).toBeVisible();
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(cell(t.review.sessionStats.done)).toHaveTextContent('1');
    expect(cell(t.review.sessionStats.good)).toHaveTextContent('1');
    expect(cell(t.review.sessionStats.again)).toHaveTextContent('0');

    // Otra vez cuenta en su celda y vuelve a preguntar la causa como siempre
    await typing.click(screen.getByRole('button', { name: t.review.show }));
    await typing.click(rating('again'));
    expect(await screen.findByText(t.review.causeQuestion)).toBeVisible();
    expect(cell(t.review.sessionStats.done)).toHaveTextContent('2');
    expect(cell(t.review.sessionStats.again)).toHaveTextContent('1');
  });

  it('dice desde cuándo venció la tarjeta y cita la fuente de una tarjeta generada', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, {
      seed: async (api, user) => {
        await seedOverdueCards(api, user, { overdue: 1, daysLate: 3 });
      },
    });
    await start(typing, 1);
    expect(await screen.findByText(t.review.overdueSince(3))).toBeVisible();
    // Una tarjeta nueva no vence, así que no lo dice
    cleanup();
    await resetApp(app.api);
    app = await renderApp(SCREENS.review.path, { seed: seedSourcedCard() });
    await start(typing, 1);
    expect(screen.queryByText(/^Vencida hace/)).toBeNull();
    // La frase literal de la fuente aparece solo con la respuesta, con el nombre del texto
    expect(screen.queryByText(/Mis apuntes de endocrino/)).toBeNull();
    await typing.click(screen.getByRole('button', { name: t.review.show }));
    expect(
      screen.getByText(
        `${t.review.sourceLabel} “Si el potasio es menor de 3.3 se difiere la insulina” (Mis apuntes de endocrino)`,
      ),
    ).toBeVisible();
  });

  it('Editar esta tarjeta abre la tarjeta propia y al cerrar sigue en la misma', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, {
      seed: async (api, user) => {
        await seedManualCards(api, user, { count: 2, suspended: 0 });
      },
    });
    await start(typing, 2);
    const actions = await screen.findByRole('region', { name: t.review.actions.title });
    // No sale de un apunte, así que no ofrece abrirlo
    expect(within(actions).queryByRole('link', { name: t.review.actions.outline })).toBeNull();
    await typing.click(within(actions).getByRole('button', { name: t.review.actions.edit }));
    const dialog = await screen.findByRole('dialog');
    await typing.click(within(dialog).getByRole('button', { name: t.decks.editor.close }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    // Se queda en la primera tarjeta, sin calificar nada
    expect(screen.getByText(t.review.progress(1, 2))).toBeVisible();
    expect(screen.getByText('Pregunta 1')).toBeVisible();
    const events = await app.api.repos.events.query({ userId: app.user.id });
    expect(events.some((event) => event.type === 'card_reviewed')).toBe(false);
  });

  it('una tarjeta generada no se edita desde Acciones y la tarjeta no aparece', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, { seed: seedSourcedCard() });
    await start(typing, 1);
    await screen.findByRole('button', { name: t.review.show });
    expect(screen.queryByRole('region', { name: t.review.actions.title })).toBeNull();
  });

  it('la tarjeta del Pomodoro arranca, pausa y reinicia la fase sin salir del repaso', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.review.path, {
      seed: async (api, user) => {
        await seedManualCards(api, user, { count: 1, suspended: 0 });
      },
    });
    await start(typing, 1);
    const card = await screen.findByRole('group', { name: t.pomodoro.label });
    expect(within(card).getByText(t.pomodoro.ofFocus(25, 5))).toBeVisible();
    expect(within(card).getByRole('button', { name: t.pomodoro.reset })).toBeDisabled();
    await typing.click(within(card).getByRole('button', { name: t.pomodoro.start }));
    await typing.click(within(card).getByRole('button', { name: t.pomodoro.pause }));
    expect(within(card).getByRole('button', { name: t.pomodoro.resume })).toBeVisible();
    await typing.click(within(card).getByRole('button', { name: t.pomodoro.reset }));
    // Reiniciar vuelve la fase al principio sin arrancarla
    expect(within(card).getByRole('button', { name: t.pomodoro.start })).toBeVisible();
    expect(within(card).getByText(t.pomodoro.phases.focus)).toBeVisible();
    const events = await app.api.repos.events.query({ userId: app.user.id });
    expect(events.map((event) => event.type).filter((type) => type.startsWith('pomodoro'))).toEqual(
      ['pomodoro_started', 'pomodoro_interrupted'],
    );
    // El repaso sigue en su lugar
    expect(screen.getByRole('button', { name: t.review.show })).toBeVisible();
  });
});
