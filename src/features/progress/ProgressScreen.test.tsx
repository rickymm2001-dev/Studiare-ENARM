// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { makeEvent, newId } from '@/data/testing/fixtures';
import { INSIGHT_MINIMUMS } from '@/engines/insights';
import { t } from '@/i18n/es-MX';

vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

describe('pantalla de Progreso', () => {
  it('con un alumno nuevo calibra y dice cuánto falta en cada análisis, sin predecir el puntaje', async () => {
    app = await renderApp(SCREENS.progress.path);
    // El título del diseño va en el contenido con su kicker, y la pestaña sigue diciendo Progreso (D-150)
    const title = await screen.findByRole('heading', { level: 1, name: t.progress.title });
    expect(title).toBeVisible();
    // El kicker va junto al título. Se busca ahí porque la barra de arriba también dice Progreso
    const hero = title.closest('header');
    expect(hero).not.toBeNull();
    if (hero) expect(within(hero).getByText(t.progress.kicker)).toBeVisible();

    // Los focos de la semana esperan las respuestas que pide el motor
    expect(
      await screen.findByText(t.progress.focusCalibrating(0, INSIGHT_MINIMUMS.answers), undefined, {
        timeout: 10_000,
      }),
    ).toBeVisible();

    // La fila de cifras calibra con su umbral en lugar de inventar un porcentaje
    const stats = screen.getByRole('region', { name: t.progress.summary.label });
    expect(within(stats).getByText(t.progress.summary.calibratingAnswers(0, 20))).toBeVisible();
    expect(
      within(stats).getByText(t.progress.summary.calibratingReviews(0, INSIGHT_MINIMUMS.reviews)),
    ).toBeVisible();
    // La racha y las preguntas sí tienen cifra, porque cero es real
    expect(within(stats).getByText(t.progress.summary.streakBest(0))).toBeVisible();

    // El pulso, el radar y los seis indicadores también calibran
    expect(
      within(screen.getByRole('region', { name: t.progress.pulse.title })).getByRole('status'),
    ).toHaveTextContent(/Faltan/);
    expect(
      within(screen.getByRole('region', { name: t.progress.radar.title })).getByText(
        t.progress.radar.calibrating(0, 3),
      ),
    ).toBeVisible();
    const indicators = screen.getByRole('region', { name: t.progress.indicators.title });
    expect(within(indicators).getAllByText(t.progress.indicators.calibrating)).toHaveLength(6);
    expect(
      within(indicators)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(Object.values(t.progress.indicators.names));

    // Sin sesiones la tabla lo dice y no hay botón a unos resultados que no existen
    const sessions = screen.getByRole('region', { name: t.progress.sessions.title });
    expect(within(sessions).getByText(t.progress.sessions.empty)).toBeVisible();
    expect(screen.queryByRole('link', { name: t.progress.sessions.seeResults })).toBeNull();

    // Conócete lista sus lecturas como calibrando con cuánto falta
    const insights = screen.getByRole('region', { name: t.insights.title });
    // Cada lectura trae su avance, por ejemplo 0/20, con el aviso de calibrando solo para el lector
    expect(within(insights).getAllByText(/^\d+\/\d+$/).length).toBeGreaterThan(5);

    // La dificultad calibra por grupo y la carga futura pide seguir un mazo
    const difficulty = screen.getByRole('region', { name: t.progress.difficultyTitle });
    expect(within(difficulty).getAllByText(t.progress.difficultyCalibrating(20))).toHaveLength(3);
    expect(
      within(screen.getByRole('region', { name: t.progress.futureLoad.title })).getByText(
        t.progress.futureLoad.empty,
      ),
    ).toBeVisible();

    // Nada de predecir el puntaje del ENARM
    expect(screen.queryByText(/puntaje (esperado|probable|estimado)/i)).toBeNull();
  });

  it('lista las últimas sesiones de la bitácora con su modo, su estado y sus aciertos', async () => {
    const examId = newId();
    const reviewId = newId();
    app = await renderApp(SCREENS.progress.path, {
      seed: async (api, user) => {
        await api.repos.events.append(
          makeEvent(
            'session_started',
            { kind: 'exam', config: {} },
            { userId: user.id, sessionId: examId },
          ),
        );
        await api.repos.events.append(
          makeEvent(
            'session_ended',
            {
              kind: 'exam',
              reason: 'completed',
              items: 10,
              correct: 7,
              durationMs: 600_000,
              xp: 10,
            },
            { userId: user.id, sessionId: examId },
          ),
        );
        // Un repaso que empezó y nunca cerró
        await api.repos.events.append(
          makeEvent(
            'session_started',
            { kind: 'review', config: {} },
            { userId: user.id, sessionId: reviewId },
          ),
        );
      },
    });
    const sessions = await screen.findByRole(
      'region',
      { name: t.progress.sessions.title },
      { timeout: 15_000 },
    );
    const rows = within(sessions).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    const exam = within(sessions).getByRole('row', { name: /Examen de 10 preguntas/ });
    expect(within(exam).getByText(t.progress.sessions.modes.exam)).toBeVisible();
    expect(within(exam).getByText(t.progress.sessions.states.completed)).toBeVisible();
    expect(within(exam).getByText('70 %')).toBeVisible();
    const review = within(sessions).getByRole('row', {
      name: new RegExp(t.progress.sessions.modes.review),
    });
    expect(within(review).getByText(t.progress.sessions.states.open)).toBeVisible();
    expect(within(review).getByText('—')).toBeVisible();
    // Sin un examen guardado no hay resultados que abrir
    expect(
      within(sessions).queryByRole('link', { name: t.progress.sessions.seeResults }),
    ).toBeNull();
  });
});
