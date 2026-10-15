// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { writeStoredFlags } from '@/config/featureFlags';
import { ulidToUuid } from '@/data/cloud/cloudIds';
import { fakeRpc, FakeDbError } from '@/data/testing/bankCloud';
import { makeQuestionWithOptions, newId } from '@/data/testing/fixtures';
import { cloudBankScreensText as bankText } from '@/i18n/cloudBankScreens';
import { t } from '@/i18n/es-MX';
import { usePractice } from './practice';

// Reportar un error con el banco de la nube (B11, 5.4). Llega al médico con report_question
vi.mock('@/ui/celebrate', () => ({ celebrate: () => undefined }));
vi.setConfig({ testTimeout: 30_000 });
const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => true,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

let app: RenderedApp | undefined;

beforeEach(() => {
  writeStoredFlags({ cloudBank: true });
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: 'cuenta', email: 'ana@ejemplo.mx', role: 'student', alias: 'Ana' },
    },
  });
});

afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
  holder.cloud = null;
  localStorage.clear();
  useCloud.setState({ state: { status: 'off' } });
});

/** Una pregunta de la nube ya contestada mal, en el resumen de la sesión */
async function failedCloudQuestion() {
  const { question: base, options } = makeQuestionWithOptions();
  const question = { ...base, isDemo: false, editorialStatus: 'approved' as const };
  const wrong = options[1];
  if (!wrong) throw new Error('Sin distractor');
  app = await renderApp(SCREENS.sessionSummary.path, {
    seed: async (api, user) => {
      await api.repos.questions.addVersion(question, options);
      usePractice.getState().set({
        sessionId: newId(),
        userId: user.id,
        questionIds: [question.id],
        index: 1,
        answers: [
          {
            questionVersionId: question.id,
            optionVersionId: wrong.id,
            correct: false,
            confidence: null,
            msToAnswer: 30_000,
            xp: 1,
            shownOptionIds: options.map((option) => option.id),
            eliminatedOptionIds: [],
            correctPosition: 0,
            sentToReview: false,
          },
        ],
        startedAt: Date.now() - 60_000,
        ended: false,
        kind: 'practice',
        duelId: null,
        targetTags: [],
      });
    },
  });
  return question;
}

async function sendReport(reason: string) {
  const user = userEvent.setup();
  const matches = await screen.findAllByText(t.simulator.report, undefined, { timeout: 20_000 });
  const summary = matches.find((element) => element.closest('summary')) as HTMLElement;
  await user.click(summary);
  const details = summary.closest('details') as HTMLElement;
  await user.selectOptions(within(details).getByLabelText(t.simulator.report), reason);
  await user.click(within(details).getByRole('button', { name: t.simulator.sendReport }));
  return details;
}

describe('reporte de una pregunta de la nube', () => {
  it('llega al médico con la versión que tenía a la vista y solo el motivo', async () => {
    const cloud = fakeRpc({ report_question: () => ({ status: 'created', reportId: 'r1' }) });
    holder.cloud = cloud;
    const question = await failedCloudQuestion();
    const details = await sendReport('wrong_key');
    expect(await within(details).findByText(t.simulator.reported)).toBeVisible();
    expect(cloud.calls.filter((call) => call.name === 'report_question')).toEqual([
      {
        name: 'report_question',
        args: { p_version_id: ulidToUuid(question.id), p_reason: 'wrong_key' },
      },
    ]);
    expect(await app?.api.repos.contentReports.list()).toHaveLength(1);
  });

  it('con el tope de reportes del día lo dice y no lo guarda', async () => {
    holder.cloud = fakeRpc({ report_question: () => ({ status: 'limit', reportId: null }) });
    await failedCloudQuestion();
    const details = await sendReport('typo');
    expect(await within(details).findByText(bankText.report.limit)).toBeVisible();
    expect(await app?.api.repos.contentReports.list()).toEqual([]);
  });

  it('si la nube lo rechaza lo guarda aquí y dice que no llegó al médico', async () => {
    holder.cloud = fakeRpc({ report_question: () => new FakeDbError('42501') });
    await failedCloudQuestion();
    const details = await sendReport('typo');
    expect(await within(details).findByRole('status')).toHaveTextContent(bankText.report.failed);
    expect(await app?.api.repos.contentReports.list()).toHaveLength(1);
    expect(await app?.api.repos.bankState.get('reports')).toBeUndefined();
  });

  it('sin conexión queda pendiente para mandarse al volver la red', async () => {
    holder.cloud = fakeRpc({
      report_question: () => {
        throw new Error('Failed to fetch');
      },
    });
    await failedCloudQuestion();
    const details = await sendReport('outdated');
    expect(await within(details).findByRole('status')).toHaveTextContent(bankText.report.offline);
    expect((await app?.api.repos.bankState.get('reports'))?.pending).toEqual([
      expect.objectContaining({ reason: 'outdated' }),
    ]);
  });
});
