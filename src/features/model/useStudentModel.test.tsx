// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/DataProvider';
import { useDataApi } from '@/data/context';
import { makeEvent, makeQuestionWithOptions, makeUser } from '@/data/testing/fixtures';
import type { ReadySession } from '../shared/RequireSession';
import { useAnalysis } from '../progress/useAnalysis';
import { useUserEvents } from '../shared/useUserEvents';
import { useStudentModel, useStudentModelBuild } from './useStudentModel';

const user = makeUser();
const session: ReadySession = { status: 'ready', user, settings: user.settings, isDemo: false };
const wrapper = ({ children }: { children: ReactNode }) => (
  <DataProvider kind="real">{children}</DataProvider>
);

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe('el modelo del alumno en pantalla (B14, 4.2)', () => {
  it('sin actividad llega con todas sus partes calibrando', async () => {
    const hook = renderHook(
      () => {
        const api = useDataApi();
        cleanup = async () => {
          await api.deleteAllData?.();
        };
        return useStudentModel(session);
      },
      { wrapper },
    );
    await waitFor(() => {
      expect(hook.result.current).toBeDefined();
    });
    const model = hook.result.current;
    expect(model?.ability).toMatchObject({ state: 'calibrating', have: 0 });
    expect(model?.fatigue).toMatchObject({ state: 'calibrating', validation: 'calibrating' });
    expect(model?.bias).toMatchObject({ vocabulary: 'trap', baseline: 'chance', prone: [] });
    expect(model?.reinforce).toEqual([]);
  });

  it('con respuestas, Progreso y el modelo del contrato dicen lo mismo', async () => {
    const hook = renderHook(
      () => {
        const api = useDataApi();
        cleanup = async () => {
          await api.deleteAllData?.();
        };
        const events = useUserEvents(user.id);
        return {
          api,
          model: useStudentModel(session),
          build: useStudentModelBuild(session, events),
          analysis: useAnalysis(session, events),
        };
      },
      { wrapper },
    );
    await waitFor(() => {
      expect(hook.result.current.model).toBeDefined();
    });

    // Treinta fallos en un mismo tema ya muestran su dominio y lo ponen a reforzar
    const { api } = hook.result.current;
    for (let index = 0; index < 30; index += 1) {
      const { question, options } = makeQuestionWithOptions();
      await api.repos.questions.addVersion(question, options);
      const wrong = options.find((option) => !option.isCorrect);
      await api.recordEvent(
        makeEvent(
          'question_answered',
          {
            questionVersionId: question.id,
            optionVersionId: wrong?.id ?? '',
            correct: false,
            confidence: 'sure',
            msToAnswer: 40_000,
            changeCount: 0,
            highlightEnabled: false,
          },
          { userId: user.id },
        ),
      );
    }
    await waitFor(() => {
      expect(hook.result.current.analysis?.responses).toHaveLength(30);
    });
    const { model, build, analysis } = hook.result.current;
    expect(model?.reinforce.map((item) => item.key)).toEqual(['cardiology']);
    // Una sola fuente: lo que lee Progreso es el mismo modelo
    expect(analysis?.model.model.reinforce).toEqual(model?.reinforce);
    expect(analysis?.weakTopics.map((topic) => topic.key)).toEqual(['cardiology']);
    expect(build?.weakTopics).toEqual(analysis?.weakTopics);
    // Sembrar treinta preguntas pide tiempo cuando la máquina anda cargada
  }, 30_000);
});
