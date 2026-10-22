// @vitest-environment jsdom
// La línea de la encuesta en Configuración, Privacidad (B18). Contestar si está disponible, Borrar mi respuesta si ya la
// contestó, y sin la línea si está apagada o no le toca. Borrar usa su propia función y no Borrar mis datos.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { surveyTexts } from '@/i18n/survey';
import { SURVEY_DRAFT_STORAGE_KEY } from './surveyState';
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

beforeEach(() => {
  localStorage.clear();
  forgetSurveyStatus();
  server = createFakeSurveyState();
  holder.cloud = fakeSurveyCloud(server);
  useCloud.getState().set({
    status: 'linked',
    identity: { authId: 'ana', email: 'ana@x.mx', role: 'student', alias: null },
  });
});

afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
  useCloud.getState().set({ status: 'off' });
  holder.cloud = null;
});

const open = async () => (app = await renderApp(`${SCREENS.settings.path}#privacidad`));
const line = () => screen.findByRole('region', { name: text.privacyLine.title }, WAIT);

describe('la línea de la encuesta en Privacidad', () => {
  it('disponible ofrece Contestar, que lleva a la encuesta', async () => {
    await open();
    const card = within(await line());
    expect(card.getByText(text.privacyLine.available)).toBeVisible();
    expect(card.getByRole('link', { name: text.actions.answer })).toHaveAttribute(
      'href',
      '/encuesta',
    );
    expect(card.queryByRole('button', { name: text.actions.erase })).toBeNull();
  });

  it('ya contestada ofrece Borrar mi respuesta, pide confirmar y la borra con su propia función', async () => {
    const typing = userEvent.setup();
    server.answered = true;
    server.responses.push({
      code: 'R000001',
      days: 9,
      answers: {
        days_used: 'd7',
        used: ['review'],
        clarity: 5,
        ease: 5,
        useful: 5,
        blockers: ['nothing'],
        recommend: 'yes',
      },
      comment: null,
    });
    localStorage.setItem(
      SURVEY_DRAFT_STORAGE_KEY,
      JSON.stringify({ ana: { answers: {}, comment: 'x' } }),
    );
    await open();
    const card = within(await line());
    expect(card.getByText(text.privacyLine.answered)).toBeVisible();
    await typing.click(card.getByRole('button', { name: text.actions.erase }));
    // Antes de borrar pide confirmar y no ha llamado a la base
    expect(card.getByText(text.privacyLine.confirm)).toBeVisible();
    expect(server.calls.some((call) => call[1] === 'delete_my_survey_response')).toBe(false);
    await typing.click(card.getByRole('button', { name: text.actions.confirmErase }));
    expect(await screen.findByText(text.states.erased, undefined, WAIT)).toBeVisible();
    expect(server.calls.map((call) => call[1])).toContain('delete_my_survey_response');
    expect(server.calls.map((call) => call[1])).not.toContain('delete_my_data');
    expect(server.responses).toHaveLength(0);
    expect(localStorage.getItem(SURVEY_DRAFT_STORAGE_KEY)).toBe('{}');
    // Como la encuesta sigue abierta, vuelve a ofrecer Contestar
    await waitFor(() => {
      expect(
        within(screen.getByRole('region', { name: text.privacyLine.title })).getByRole('link', {
          name: text.actions.answer,
        }),
      ).toBeVisible();
    }, WAIT);
  });

  it('cancelar no borra nada', async () => {
    const typing = userEvent.setup();
    server.answered = true;
    await open();
    const card = within(await line());
    await typing.click(card.getByRole('button', { name: text.actions.erase }));
    await typing.click(card.getByRole('button', { name: text.actions.cancel }));
    expect(card.getByRole('button', { name: text.actions.erase })).toBeVisible();
    expect(server.calls.some((call) => call[1] === 'delete_my_survey_response')).toBe(false);
  });

  it('si no se pudo borrar lo dice y la respuesta sigue', async () => {
    const typing = userEvent.setup();
    server.answered = true;
    await open();
    const card = within(await line());
    await typing.click(card.getByRole('button', { name: text.actions.erase }));
    server.failNext.delete_my_survey_response = 'throw';
    await typing.click(card.getByRole('button', { name: text.actions.confirmErase }));
    expect(await screen.findByText(text.states.eraseFailed, undefined, WAIT)).toBeVisible();
    expect(server.answered).toBe(true);
  });

  it.each([
    [
      'apagada',
      { setting: { enabled: false, id: 'first-week-v1', delayDays: 7, accountsUntil: null } },
    ],
    ['sin cumplir los días', { waited: false }],
  ])('con la encuesta %s no hay línea', async (_label, override) => {
    server = createFakeSurveyState(override);
    holder.cloud = fakeSurveyCloud(server);
    await open();
    await waitFor(() => {
      expect(server.calls.some((call) => call[1] === 'my_survey_status')).toBe(true);
    }, WAIT);
    expect(screen.queryByRole('region', { name: text.privacyLine.title })).toBeNull();
  });

  it('sin la nube o con una cuenta del equipo no hay línea ni se pregunta al servidor', async () => {
    useCloud.getState().set({ status: 'off' });
    await open();
    await screen.findByRole('heading', { name: /Privacidad/ }, WAIT).catch(() => undefined);
    expect(screen.queryByRole('region', { name: text.privacyLine.title })).toBeNull();
    expect(server.calls).toEqual([]);
  });

  it('ya contestada y con la encuesta apagada todavía se puede borrar la respuesta', async () => {
    server = createFakeSurveyState({
      answered: true,
      setting: { enabled: false, id: 'first-week-v1', delayDays: 7, accountsUntil: null },
    });
    holder.cloud = fakeSurveyCloud(server);
    await open();
    const card = within(await line());
    expect(card.getByRole('button', { name: text.actions.erase })).toBeVisible();
  });
});
