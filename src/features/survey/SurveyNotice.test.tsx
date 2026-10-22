// @vitest-environment jsdom
// La franja de la encuesta de los primeros días (B18). Solo sale si el servidor dice que le toca, se esconde con Ahora no
// (2 días, hasta tres veces) y con No quiero contestarla, y mide survey_shown y survey_dismissed solo con permiso.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetAnalytics,
  setAnalyticsConsent,
  setAnalyticsSink,
  type AnalyticsRecord,
} from '@/data/analytics/catalog';
import { surveyTexts } from '@/i18n/survey';
import { SurveyNotice } from './SurveyNotice';
import {
  FRESH_HIDING,
  SURVEY_STORAGE_KEY,
  readHiding,
  resetShown,
  snooze,
  writeHiding,
} from './surveyState';
import { forgetSurveyStatus } from './surveyStatus';
import {
  createFakeSurveyState,
  fakeSurveyCloud,
  type FakeSurveyState,
} from './testing/fakeSurveyCloud';

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const text = surveyTexts.notice;
let server: FakeSurveyState;
let events: AnalyticsRecord[];

const statusCalls = () => server.calls.filter((call) => call[1] === 'my_survey_status').length;

function renderNotice() {
  return render(
    <MemoryRouter>
      <SurveyNotice userId="ana" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  forgetSurveyStatus();
  resetShown();
  server = createFakeSurveyState();
  holder.cloud = fakeSurveyCloud(server);
  events = [];
  resetAnalytics();
  setAnalyticsConsent(true);
  setAnalyticsSink((record) => events.push(record));
});

afterEach(() => {
  cleanup();
  resetAnalytics();
  holder.cloud = null;
});

describe('cuándo sale la franja', () => {
  it('sale cuando el servidor dice que le toca, con sus tres botones y sin respuestas ni comentario', async () => {
    renderNotice();
    const region = await screen.findByRole('region', { name: text.region });
    expect(region).toHaveTextContent(text.title);
    expect(screen.getByRole('link', { name: surveyTexts.actions.answer })).toHaveAttribute(
      'href',
      '/encuesta',
    );
    expect(screen.getByRole('button', { name: text.laterLabel })).toBeVisible();
    expect(screen.getByRole('button', { name: text.neverLabel })).toBeVisible();
    expect(events).toEqual([expect.objectContaining({ event: 'survey_shown', properties: {} })]);
  });

  it.each([
    [
      'apagada',
      { setting: { enabled: false, id: 'first-week-v1', delayDays: 7, accountsUntil: null } },
    ],
    ['sin cumplir los días', { waited: false }],
    ['ya contestada', { answered: true }],
  ])('no sale con la encuesta %s', async (_label, override) => {
    server = createFakeSurveyState(override);
    holder.cloud = fakeSurveyCloud(server);
    renderNotice();
    await waitFor(() => {
      expect(statusCalls()).toBe(1);
    });
    expect(screen.queryByRole('region', { name: text.region })).toBeNull();
    expect(events).toEqual([]);
  });

  it('si el servidor no contesta, no sale y la app sigue', async () => {
    server.failNext.my_survey_status = 'throw';
    renderNotice();
    await waitFor(() => {
      expect(statusCalls()).toBe(1);
    });
    expect(screen.queryByRole('region', { name: text.region })).toBeNull();
  });

  it('recuerda lo que contestó el servidor y no vuelve a preguntar al regresar', async () => {
    const first = renderNotice();
    await screen.findByRole('region', { name: text.region });
    first.unmount();
    renderNotice();
    await screen.findByRole('region', { name: text.region });
    expect(statusCalls()).toBe(1);
    // survey_shown sale una vez por carga de la app aunque la franja se vea dos veces
    expect(events.filter((event) => event.event === 'survey_shown')).toHaveLength(1);
  });

  it('sin permiso de Medición de uso no sale ningún evento, y la franja se ve igual', async () => {
    setAnalyticsConsent(false);
    renderNotice();
    await screen.findByRole('region', { name: text.region });
    await userEvent.setup().click(screen.getByRole('button', { name: text.laterLabel }));
    expect(events).toEqual([]);
  });
});

describe('esconder la franja', () => {
  it('Ahora no la esconde, lo recuerda y mide survey_dismissed con later', async () => {
    renderNotice();
    await userEvent.setup().click(await screen.findByRole('button', { name: text.laterLabel }));
    expect(screen.queryByRole('region', { name: text.region })).toBeNull();
    const hiding = readHiding('ana');
    expect(hiding.laterCount).toBe(1);
    expect(hiding.hiddenUntil).toBeGreaterThan(Date.now());
    expect(events.at(-1)).toMatchObject({
      event: 'survey_dismissed',
      properties: { how: 'later' },
    });
  });

  it('escondida en este dispositivo no sale ni pregunta al servidor', async () => {
    writeHiding('ana', snooze(FRESH_HIDING, Date.now()));
    renderNotice();
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: text.region })).toBeNull();
    });
    expect(statusCalls()).toBe(0);
    expect(events).toEqual([]);
  });

  it('pasados los 2 días vuelve a salir, y a la tercera vez de Ahora no ya no sale sola', async () => {
    const typing = userEvent.setup();
    // Dos veces ya pasaron los dos días
    writeHiding('ana', { laterCount: 2, hiddenUntil: Date.now() - 1000, never: false });
    renderNotice();
    await typing.click(await screen.findByRole('button', { name: text.laterLabel }));
    expect(readHiding('ana').laterCount).toBe(3);
    cleanup();
    forgetSurveyStatus();
    server.calls.length = 0;
    // Aunque pasen los días, ya no sale sola
    writeHiding('ana', { laterCount: 3, hiddenUntil: Date.now() - 1000, never: false });
    renderNotice();
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: text.region })).toBeNull();
    });
    expect(statusCalls()).toBe(0);
  });

  it('No quiero contestarla la esconde para siempre y mide survey_dismissed con never', async () => {
    renderNotice();
    await userEvent.setup().click(await screen.findByRole('button', { name: text.neverLabel }));
    expect(screen.queryByRole('region', { name: text.region })).toBeNull();
    expect(readHiding('ana').never).toBe(true);
    expect(events.at(-1)).toMatchObject({
      event: 'survey_dismissed',
      properties: { how: 'never' },
    });
    expect(localStorage.getItem(SURVEY_STORAGE_KEY)).toContain('"never":true');
  });

  it('sin almacenamiento la franja se ve y se cierra igual', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    renderNotice();
    await userEvent.setup().click(await screen.findByRole('button', { name: text.neverLabel }));
    expect(screen.queryByRole('region', { name: text.region })).toBeNull();
  });
});
