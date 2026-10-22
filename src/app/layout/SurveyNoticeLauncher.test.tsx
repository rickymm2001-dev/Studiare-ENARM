// @vitest-environment jsdom
// El lanzador de la franja de la encuesta (B18). Es lo único que viaja en el JavaScript inicial, y decide si se baja el
// resto. No se monta sin cuenta de la nube, sin ser alumno, ni dentro de una pregunta, un examen o un repaso, y ahí no se
// pide nada al servidor.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { surveyTexts } from '@/i18n/survey';
import { forgetSurveyStatus } from '@/features/survey/surveyStatus';
import { resetShown } from '@/features/survey/surveyState';
import {
  createFakeSurveyState,
  fakeSurveyCloud,
  type FakeSurveyState,
} from '@/features/survey/testing/fakeSurveyCloud';
import { useCloud } from '../cloudState';
import { SurveyNoticeLauncher } from './SurveyNoticeLauncher';

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

let server: FakeSurveyState;
const statusCalls = () => server.calls.filter((call) => call[1] === 'my_survey_status').length;

function linked(role: 'student' | 'physician' | 'admin' | 'owner' = 'student') {
  useCloud.getState().set({
    status: 'linked',
    identity: { authId: 'ana', email: 'ana@x.mx', role, alias: null },
  });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SurveyNoticeLauncher />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  forgetSurveyStatus();
  resetShown();
  server = createFakeSurveyState();
  holder.cloud = fakeSurveyCloud(server);
  linked();
});

afterEach(() => {
  cleanup();
  useCloud.getState().set({ status: 'off' });
  holder.cloud = null;
});

describe('el lanzador de la franja', () => {
  it('baja la franja en Inicio para un alumno con la nube', async () => {
    renderAt(SCREENS.home.path);
    expect(await screen.findByRole('region', { name: surveyTexts.notice.region })).toBeVisible();
    expect(statusCalls()).toBe(1);
  });

  it.each([
    ['una pregunta', SCREENS.question.path],
    ['la retroalimentación', SCREENS.feedback.path],
    ['un examen', SCREENS.exam.path],
    ['un repaso', SCREENS.review.path],
    ['un repaso con diagonal final', `${SCREENS.review.path}/`],
    ['la propia encuesta', SCREENS.survey.path],
    ['la bienvenida', SCREENS.onboarding.path],
  ])('dentro de %s no se monta ni pregunta al servidor', async (_label, path) => {
    renderAt(path);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByRole('region', { name: surveyTexts.notice.region })).toBeNull();
    expect(statusCalls()).toBe(0);
  });

  it.each([
    [
      'sin la nube conectada',
      () => {
        useCloud.getState().set({ status: 'off' });
      },
    ],
    [
      'sin sesión',
      () => {
        useCloud.getState().set({ status: 'signed-out' });
      },
    ],
    [
      'para un médico',
      () => {
        linked('physician');
      },
    ],
    [
      'para un admin',
      () => {
        linked('admin');
      },
    ],
    [
      'para el dueño',
      () => {
        linked('owner');
      },
    ],
  ])('%s no se monta ni pregunta al servidor', async (_label, setUp) => {
    setUp();
    renderAt(SCREENS.home.path);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByRole('region', { name: surveyTexts.notice.region })).toBeNull();
    expect(statusCalls()).toBe(0);
  });

  it('al salir de un examen vuelve a salir', async () => {
    const { unmount } = renderAt(SCREENS.exam.path);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(statusCalls()).toBe(0);
    unmount();
    renderAt(SCREENS.home.path);
    await waitFor(() => {
      expect(screen.getByRole('region', { name: surveyTexts.notice.region })).toBeVisible();
    });
  });
});
