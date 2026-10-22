// @vitest-environment jsdom
// La pantalla de la encuesta de los primeros días (B18). Quien decide si le toca es el servidor. Dice que no depende de
// ningún permiso y que se guarda con un código, lleva el foco a la confirmación al enviar y no deja contestar dos veces.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import {
  resetAnalytics,
  setAnalyticsConsent,
  setAnalyticsSink,
  type AnalyticsRecord,
} from '@/data/analytics/catalog';
import { t } from '@/i18n/es-MX';
import { surveyTexts } from '@/i18n/survey';
import { resetShown } from './surveyState';
import { forgetSurveyStatus } from './surveyStatus';
import {
  createFakeSurveyState,
  fakeSurveyCloud,
  type FakeSurveyState,
} from './testing/fakeSurveyCloud';

vi.setConfig({ testTimeout: 60_000 });
const WAIT = { timeout: 30_000 };

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const text = surveyTexts;
let app: RenderedApp | undefined;
let server: FakeSurveyState;
let events: AnalyticsRecord[];

function linked(role: 'student' | 'physician' = 'student') {
  useCloud.getState().set({
    status: 'linked',
    identity: { authId: 'ana', email: 'ana@x.mx', role, alias: null },
  });
}
const statusCalls = () => server.calls.filter((call) => call[1] === 'my_survey_status').length;

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
  linked();
});

afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
  resetAnalytics();
  useCloud.getState().set({ status: 'off' });
  holder.cloud = null;
});

const open = async () => (app = await renderApp(SCREENS.survey.path));

describe('la pantalla', () => {
  it('con una encuesta disponible muestra el título, qué es y qué se guarda, y el formulario', async () => {
    await open();
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.survey.title }, WAIT),
    ).toBeVisible();
    expect(await screen.findByRole('heading', { name: text.title }, WAIT)).toBeVisible();
    expect(screen.getByText(text.intro)).toBeVisible();
    expect(screen.getByText(text.privacy)).toBeVisible();
    expect(screen.getByText(text.independent)).toBeVisible();
    expect(screen.getByText(text.erase)).toBeVisible();
    expect(await screen.findByRole('button', { name: text.actions.send }, WAIT)).toBeVisible();
    expect(document.title).toContain(t.screens.survey.title);
    // La frase de privacidad nunca dice que es anónima
    expect(document.body.textContent).not.toMatch(/an[oó]nim/i);
    expect(events).toEqual([expect.objectContaining({ event: 'survey_shown' })]);
  });

  it('enviar lleva el foco a la confirmación y ya no deja contestar otra vez', async () => {
    const typing = userEvent.setup();
    await open();
    await screen.findByRole('button', { name: text.actions.send }, WAIT);
    const group = (label: RegExp) => screen.getByRole('group', { name: label });
    await typing.click(within(group(/cuántos días/i)).getByLabelText('Los 7'));
    await typing.click(within(group(/qué usaste/i)).getByLabelText('Repasar'));
    for (const [label, value] of [
      [/qué tan claro/i, 5],
      [/qué tan fácil/i, 4],
      [/qué tan útil/i, 5],
    ] as const) {
      await typing.click(
        within(group(label)).getByRole('radio', { name: new RegExp(`^${String(value)}(,|$)`) }),
      );
    }
    await typing.click(within(group(/te frenó/i)).getByLabelText('Nada me frenó'));
    await typing.click(within(group(/recomendarías/i)).getByLabelText('Sí'));
    await typing.click(screen.getByRole('button', { name: text.actions.send }));

    const thanks = await screen.findByText(text.states.sent, undefined, WAIT);
    expect(thanks).toHaveFocus();
    expect(screen.getByText(text.states.sentBody)).toBeVisible();
    expect(screen.queryByRole('button', { name: text.actions.send })).toBeNull();
    expect(screen.getByRole('link', { name: text.actions.backHome })).toBeVisible();
    expect(events.map((event) => event.event)).toEqual(['survey_shown', 'survey_completed']);
    expect(server.responses).toHaveLength(1);
  });

  it('si ya la contestó lo dice y no muestra el formulario', async () => {
    server.answered = true;
    await open();
    expect(await screen.findByText(text.states.already, undefined, WAIT)).toBeVisible();
    expect(screen.queryByRole('button', { name: text.actions.send })).toBeNull();
    expect(events).toEqual([]);
  });

  it.each([
    [
      'apagada',
      { setting: { enabled: false, id: 'first-week-v1', delayDays: 7, accountsUntil: null } },
    ],
    ['sin cumplir los días', { waited: false }],
  ])('con la encuesta %s dice que por ahora no hay una', async (_label, override) => {
    server = createFakeSurveyState(override);
    holder.cloud = fakeSurveyCloud(server);
    await open();
    expect(await screen.findByText(text.states.unavailable, undefined, WAIT)).toBeVisible();
    expect(screen.queryByRole('button', { name: text.actions.send })).toBeNull();
  });

  it('sin la cuenta de la nube dice que la necesita y no pregunta al servidor', async () => {
    useCloud.getState().set({ status: 'off' });
    await open();
    expect(await screen.findByText(text.states.needsCloud, undefined, WAIT)).toBeVisible();
    expect(statusCalls()).toBe(0);
  });

  it('una cuenta del equipo no tiene encuesta y no pregunta al servidor', async () => {
    linked('physician');
    await open();
    expect(await screen.findByText(text.states.unavailable, undefined, WAIT)).toBeVisible();
    expect(statusCalls()).toBe(0);
  });

  it('si el servidor no contesta lo dice y deja intentar de nuevo', async () => {
    const typing = userEvent.setup();
    server.failNext.my_survey_status = 'throw';
    await open();
    expect(await screen.findByText(text.states.loadFailed, undefined, WAIT)).toBeVisible();
    await typing.click(screen.getByRole('button', { name: text.actions.retry }));
    expect(await screen.findByRole('button', { name: text.actions.send }, WAIT)).toBeVisible();
  });

  it('un dispositivo que ya no es el activo lo dice', async () => {
    server.failNext.my_survey_status = { code: '42501' };
    await open();
    expect(await screen.findByText(text.states.notActiveDevice, undefined, WAIT)).toBeVisible();
  });

  it('siempre pide el estado de ahora al servidor, no el recordado', async () => {
    await open();
    await screen.findByRole('button', { name: text.actions.send }, WAIT);
    await waitFor(() => {
      expect(statusCalls()).toBe(1);
    });
  });
});
