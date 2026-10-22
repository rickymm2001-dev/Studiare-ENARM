// @vitest-environment jsdom
// Exportar mis datos incluye la respuesta a la encuesta de los primeros días (B18, 2.5 del diseño), como ya incluye lo de
// Party y los recordatorios: se pide a la nube con la cuenta conectada y el archivo sale igual si la nube no contesta.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { t } from '@/i18n/es-MX';
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

let app: RenderedApp | undefined;
let server: FakeSurveyState;
const blobs: Blob[] = [];

beforeEach(() => {
  localStorage.clear();
  forgetSurveyStatus();
  blobs.length = 0;
  server = createFakeSurveyState();
  holder.cloud = fakeSurveyCloud(server);
  useCloud.getState().set({
    status: 'linked',
    identity: { authId: 'ana', email: 'ana@x.mx', role: 'student', alias: null },
  });
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: (blob: Blob) => {
        blobs.push(blob);
        return 'blob:prueba';
      },
      revokeObjectURL: () => undefined,
    }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
  useCloud.getState().set({ status: 'off' });
  holder.cloud = null;
  vi.unstubAllGlobals();
});

/** Abre Privacidad, exporta y devuelve el JSON del archivo */
async function exportFile(): Promise<{ surveyCloud: unknown }> {
  const typing = userEvent.setup();
  app = await renderApp(`${SCREENS.settings.path}#privacidad`);
  const section = await screen.findByRole('region', { name: t.settings.exportTitle }, WAIT);
  await typing.click(within(section).getByRole('button', { name: t.settings.export }));
  await waitFor(() => {
    expect(blobs).toHaveLength(1);
  }, WAIT);
  const [blob] = blobs;
  if (!blob) throw new Error('No se descargó ningún archivo');
  return JSON.parse(await blob.text()) as { surveyCloud: unknown };
}

describe('Exportar mis datos con la encuesta', () => {
  it('trae la respuesta propia con su código, sus días y su comentario, y no la cuenta', async () => {
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
      comment: 'Todo bien',
    });
    const file = await exportFile();
    expect(file.surveyCloud).toMatchObject({
      status: 'included',
      data: { surveyId: 'first-week-v1', code: 'R000001', comment: 'Todo bien' },
    });
    expect(JSON.stringify(file.surveyCloud)).not.toMatch(/@|user_id/);
    expect(server.calls.map((call) => call[1])).toContain('my_survey_response');
    expect(server.calls.map((call) => call[1])).not.toContain('admin_survey_responses');
  });

  it('quien no la contestó sale incluida y vacía', async () => {
    const file = await exportFile();
    expect(file.surveyCloud).toEqual({ status: 'included', data: null });
  });

  it('si la nube no contesta el archivo sale igual y lo dice', async () => {
    server.failNext.my_survey_response = 'throw';
    const file = await exportFile();
    expect(file.surveyCloud).toEqual({ status: 'unavailable' });
  });

  it('sin la nube conectada no se pide nada', async () => {
    useCloud.getState().set({ status: 'off' });
    const file = await exportFile();
    expect(file.surveyCloud).toBeNull();
    expect(server.calls).toEqual([]);
  });
});
