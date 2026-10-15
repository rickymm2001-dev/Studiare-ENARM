// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeStoredFlags } from '@/config/featureFlags';
import type { PlanKey } from '@/config/billing';
import { DataProvider } from '@/data/DataProvider';
import type { PoolQuestion, QuestionSource } from '@/data/bank/questionSource';
import { makeUser, newId } from '@/data/testing/fixtures';
import { englishText } from '@/i18n/english';
import { t } from '@/i18n/es-MX';
import type { ReadySession } from '../shared/RequireSession';
import type * as UseQuestionSource from '../shared/useQuestionSource';
import { ExamSetupCard } from './ExamSetupCard';
import { clearExamState, loadExamState } from './examStorage';

vi.setConfig({ testTimeout: 30_000 });

const user = makeUser();
const session: ReadySession = { status: 'ready', user, settings: user.settings, isDemo: false };
const copy = englishText.exam;

// Empezar baja los cuerpos de la fuente de preguntas. Aquí concede todo lo que se pida
const source = vi.hoisted((): { current: QuestionSource | null } => ({ current: null }));
vi.mock('../shared/useQuestionSource', async (importOriginal) => ({
  ...(await importOriginal<typeof UseQuestionSource>()),
  useQuestionSource: () => source.current as QuestionSource,
}));

const BRANCHES = ['internal_medicine', 'pediatrics', 'obstetrics_gynecology', 'general_surgery'];

/** Los ids de lo que se arma aquí, para saber cuáles son de inglés. El estado del examen pide ULID */
const englishIds = new Set<string>();

function pooled(overrides: Partial<PoolQuestion> = {}): PoolQuestion {
  return {
    id: newId(),
    questionId: newId(),
    version: 1,
    caseId: null,
    caseOrder: null,
    branch: 'internal_medicine',
    topic: 'cardiology',
    subtopic: 'hypertension',
    physicianDifficulty: 3,
    isDemo: false,
    structure: { polarity: 'affirmative', task: 'diagnosis', format: 'direct' },
    examEligible: true,
    language: 'es',
    distractorBiases: [],
    cached: true,
    ...overrides,
  };
}

/** n preguntas sueltas en español, repartidas en cuatro ramas */
const spanish = (n: number) =>
  Array.from({ length: n }, (_, i) => pooled({ branch: BRANCHES[i % BRANCHES.length] as string }));

/** Casos de lectura. Cada número es cuántas preguntas trae el caso */
const english = (sizes: readonly number[]) => {
  const caseIds = sizes.map(() => newId());
  return sizes.flatMap((size, caseIndex) =>
    Array.from({ length: size }, (_, order) => {
      const question = pooled({
        caseId: caseIds[caseIndex] ?? newId(),
        caseOrder: order + 1,
        branch: 'medical_english',
        topic: 'reading_comprehension',
        language: 'en',
      });
      englishIds.add(question.id);
      return question;
    }),
  );
};
const TWELVE = [2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3];

function card(
  props: {
    questions?: PoolQuestion[];
    englishQuestions?: PoolQuestion[];
    plan?: PlanKey;
    left?: number | null;
  } = {},
  inside: ReactNode = null,
) {
  return render(
    <DataProvider kind="real">
      <MemoryRouter>
        <ExamSetupCard
          session={session}
          questions={props.questions ?? spanish(300)}
          englishQuestions={props.englishQuestions ?? english(TWELVE)}
          plan={props.plan ?? 'monthly'}
          left={props.left === undefined ? null : props.left}
        />
        {inside}
      </MemoryRouter>
    </DataProvider>,
  );
}

beforeEach(() => {
  source.current = {
    kind: 'local',
    prepare: () => Promise.resolve('ready'),
    pool: () => Promise.resolve({ practice: [], exam: [], english: { practice: [], exam: [] } }),
    ensureBodies: (ids) =>
      Promise.resolve({ ready: [...ids], denied: [], quota: null, offline: false }),
    quota: () => Promise.resolve(null),
    refresh: () => Promise.resolve(),
  };
});
afterEach(() => {
  cleanup();
  clearExamState(user.id);
  englishIds.clear();
  source.current = null;
  localStorage.clear();
});

describe('tarjeta del examen con su parte en inglés (B13, 3.1 y 3.7)', () => {
  it('el de 280 dice 250 en español y 30 en inglés con el tiempo total de las dos secciones', () => {
    card();
    expect(screen.getByRole('combobox', { name: t.exam.size })).toHaveValue('280');
    expect(screen.getByRole('checkbox', { name: copy.include })).toBeChecked();
    // 250 por 77 s y 30 por 90 s son 6 horas 5 minutos 50 segundos, que se dicen como 6 h 06 min
    expect(
      screen.getByText(
        `${t.exam.timeTotal(250 * 77_000 + 30 * 90_000)} · ${copy.composition(250, 30)}`,
      ),
    ).toBeVisible();
    expect(t.exam.timeTotal(250 * 77_000 + 30 * 90_000)).toBe('Tiempo total 6 h 06 min');
    // Con los 30 reactivos publicados no está calibrando
    expect(screen.queryByText(t.states.calibrating.title)).toBeNull();
    expect(screen.queryByText(copy.onlySpanish)).toBeNull();
  });

  it('los exámenes cortos llevan la misma proporción', async () => {
    const typing = userEvent.setup();
    card();
    const size = screen.getByRole('combobox', { name: t.exam.size });
    for (const [value, spanishCount, englishCount] of [
      ['100', 89, 11],
      ['50', 45, 5],
      ['20', 18, 2],
    ] as const) {
      await typing.selectOptions(size, value);
      expect(
        screen.getByText(new RegExp(copy.composition(spanishCount, englishCount))),
      ).toBeVisible();
    }
  });

  it('quitar la casilla deja el examen solo en español del tamaño pedido', async () => {
    const typing = userEvent.setup();
    card();
    await typing.click(screen.getByRole('checkbox', { name: copy.include }));
    expect(screen.getByRole('checkbox', { name: copy.include })).not.toBeChecked();
    expect(screen.getByText(t.exam.timeTotal(280 * 77_000))).toBeVisible();
    expect(screen.queryByText(new RegExp(copy.composition(250, 30)))).toBeNull();
  });

  it('con 6 reactivos de inglés lleva la marca Calibrando, dice cuántos hay y el español no los rellena', () => {
    card({ englishQuestions: english([3, 3]) });
    expect(screen.getByText(t.states.calibrating.title)).toBeVisible();
    expect(
      screen.getByText(/6 de 30 reactivos de inglés\. Faltan 24 reactivos de inglés/),
    ).toBeVisible();
    expect(screen.getByText(copy.missing(6, 30))).toBeVisible();
    // 250 en español, 6 en inglés y 24 menos que los 280, con el tiempo de cada sección
    expect(
      screen.getByText(
        `${t.exam.timeTotal(250 * 77_000 + 6 * 90_000)} · ${copy.composition(250, 6)}`,
      ),
    ).toBeVisible();
  });

  it('sin ningún reactivo de inglés lo avisa y el examen es solo en español', () => {
    card({ englishQuestions: [] });
    expect(screen.getByText(copy.onlySpanish)).toBeVisible();
    expect(screen.getByText(/0 de 30 reactivos de inglés/)).toBeVisible();
    // El tamaño pedido se respeta: 280 en español
    expect(screen.getByText(t.exam.timeTotal(280 * 77_000))).toBeVisible();
    expect(screen.queryByText(new RegExp(' en español y '))).toBeNull();
    expect(screen.getByRole('button', { name: t.exam.start })).toBeEnabled();
  });

  it('sin la bandera medicalEnglish no hay casilla ni avisos y el examen es solo en español', () => {
    writeStoredFlags({ medicalEnglish: false });
    card();
    expect(screen.queryByRole('checkbox', { name: copy.include })).toBeNull();
    expect(screen.queryByText(copy.onlySpanish)).toBeNull();
    expect(screen.getByText(t.exam.timeTotal(280 * 77_000))).toBeVisible();
    expect(screen.queryByText(new RegExp(' en español y '))).toBeNull();
  });

  it('en Gratis un examen chico cabe con su parte en inglés dentro de lo que le queda hoy', () => {
    card({ plan: 'free', left: 20 });
    expect(screen.getByRole('combobox', { name: t.exam.size })).toHaveValue('20');
    expect(screen.getByText(new RegExp(copy.composition(18, 2)))).toBeVisible();
    expect(screen.getByText(t.exam.fullLocked)).toBeVisible();
  });

  it('empieza el examen con sus dos secciones y deja en la bitácora lo del inglés', async () => {
    const typing = userEvent.setup();
    card({ plan: 'free', left: 20 });
    await typing.click(screen.getByRole('button', { name: t.exam.start }));
    await waitFor(
      () => {
        expect(loadExamState(user.id)).not.toBeNull();
      },
      { timeout: 20_000 },
    );
    const state = loadExamState(user.id);
    expect(state?.questionIds).toHaveLength(20);
    const picked = state?.questionIds.filter((id) => englishIds.has(id)) ?? [];
    expect(picked).toHaveLength(2);
    // El caso va junto y en orden
    const at = state?.questionIds.indexOf(picked[0] ?? '') ?? -1;
    expect(state?.questionIds.slice(at, at + 2)).toEqual(picked);
    expect(state?.totalMs).toBe(18 * 77_000 + 2 * 90_000);
    expect(state).toMatchObject({ requested: 20, shortfall: 0 });
  });

  it('con la casilla quitada el examen que empieza no trae inglés', async () => {
    const typing = userEvent.setup();
    card({ plan: 'free', left: 20 });
    await typing.click(screen.getByRole('checkbox', { name: copy.include }));
    await typing.click(screen.getByRole('button', { name: t.exam.start }));
    await waitFor(
      () => {
        expect(loadExamState(user.id)).not.toBeNull();
      },
      { timeout: 20_000 },
    );
    const state = loadExamState(user.id);
    expect(state?.questionIds).toHaveLength(20);
    expect(state?.questionIds.some((id) => englishIds.has(id))).toBe(false);
    expect(state?.totalMs).toBe(20 * 77_000);
  });

  it('si el servidor niega un caso de inglés empieza con lo concedido y el faltante queda en el examen', async () => {
    const typing = userEvent.setup();
    source.current = {
      ...(source.current as QuestionSource),
      ensureBodies: (ids) => {
        const denied = ids.filter((id) => englishIds.has(id));
        return Promise.resolve({
          ready: ids.filter((id) => !denied.includes(id)),
          denied: denied.map((id) => ({ id, reason: 'daily_limit' as const })),
          quota: null,
          offline: false,
        });
      },
    };
    card({ plan: 'free', left: 20 });
    await typing.click(screen.getByRole('button', { name: t.exam.start }));
    await waitFor(
      () => {
        expect(loadExamState(user.id)).not.toBeNull();
      },
      { timeout: 20_000 },
    );
    const state = loadExamState(user.id);
    expect(state?.questionIds).toHaveLength(18);
    expect(state).toMatchObject({ requested: 20, shortfall: 2 });
    expect(state?.totalMs).toBe(18 * 77_000);
  });

  it('las dos secciones y sus avisos están dentro de la tarjeta del examen', () => {
    card({ englishQuestions: english([3, 3]) });
    const region = screen.getByRole('region', { name: t.exam.cardTitle });
    expect(within(region).getByRole('checkbox', { name: copy.include })).toBeVisible();
    expect(within(region).getByText(copy.missing(6, 30))).toBeVisible();
  });
});
