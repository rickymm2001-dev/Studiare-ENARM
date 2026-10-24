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
    expect(
      within(screen.getByRole('group', { name: t.exam.size })).getByRole('button', {
        pressed: true,
      }),
    ).toHaveTextContent('280');
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
    const size = screen.getByRole('group', { name: t.exam.size });
    for (const [value, spanishCount, englishCount] of [
      ['100', 89, 11],
      ['50', 45, 5],
      ['20', 18, 2],
    ] as const) {
      await typing.click(within(size).getByRole('button', { name: value }));
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
    expect(screen.getByText(copy.missing(6, 30, true))).toBeVisible();
    // 250 en español, 6 en inglés y 24 menos que los 280, con el tiempo de cada sección
    expect(
      screen.getByText(
        `${t.exam.timeTotal(250 * 77_000 + 6 * 90_000)} · ${copy.composition(250, 6)}`,
      ),
    ).toBeVisible();
  });

  it('el aviso de faltantes dice lo que pide este examen y solo el de 280 dice lo que trae el examen real', async () => {
    const typing = userEvent.setup();
    card({ englishQuestions: english([3, 3]) });
    // Con el de 280 son los 30 del examen real
    expect(
      screen.getByText(
        'Solo hay 6 reactivos de inglés de los 30 que trae el examen real. Tu examen llevará 6 y el español no los rellena.',
      ),
    ).toBeVisible();
    // Con los cortos piden la misma proporción, y eso no es lo que trae el examen real
    const size = screen.getByRole('group', { name: t.exam.size });
    await typing.click(within(size).getByRole('button', { name: '100' }));
    expect(
      screen.getByText(
        'Solo hay 6 reactivos de inglés de los 11 que pide este examen. Tu examen llevará 6 y el español no los rellena.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/que trae el examen real/)).toBeNull();
    expect(screen.getByText(copy.missing(6, 11, false))).toBeVisible();
    // Con 50 piden 5 y con 6 reactivos no falta ninguno, así que no hay aviso de faltantes
    await typing.click(within(size).getByRole('button', { name: '50' }));
    expect(screen.queryByText(/Solo hay/)).toBeNull();
  });

  it('si hay inglés de sobra pero los casos no suman lo que pide el examen, dice cuántos entran', async () => {
    const typing = userEvent.setup();
    // Solo casos de tres preguntas, 36 reactivos. Hay más que los 30 del examen real, pero un texto entra completo
    card({ englishQuestions: english(Array.from({ length: 12 }, () => 3)) });
    const size = screen.getByRole('group', { name: t.exam.size });
    // El de 280 pide 30 y diez casos de tres suman 30, así que no hay nada que avisar
    expect(screen.queryByText(/Con los casos que hay/)).toBeNull();
    expect(screen.getByText(new RegExp(copy.composition(250, 30)))).toBeVisible();

    // El de 100 pide 11 y entran tres casos, 9
    await typing.click(within(size).getByRole('button', { name: '100' }));
    expect(screen.getByText(copy.fits(9, 11))).toBeVisible();
    expect(screen.getByText(new RegExp(copy.composition(91, 9)))).toBeVisible();
    expect(screen.queryByText(/Solo hay/)).toBeNull();

    // El de 50 pide 5 y entra un caso, 3
    await typing.click(within(size).getByRole('button', { name: '50' }));
    expect(screen.getByText(copy.fits(3, 5))).toBeVisible();
    expect(
      screen.getByText(
        /^Con los casos que hay entran 3 de inglés\. Este examen pide 5 reactivos y un texto entra completo/,
      ),
    ).toBeVisible();
    expect(screen.getByText(new RegExp(copy.composition(47, 3)))).toBeVisible();

    // El de 20 pide 2 y no cabe ningún caso: sale sin inglés y lo dice
    await typing.click(within(size).getByRole('button', { name: '20' }));
    expect(screen.getByText(copy.fits(0, 2))).toBeVisible();
    expect(screen.getByText(/^Con los casos que hay no entra ninguno de inglés\./)).toBeVisible();
    expect(screen.queryByText(new RegExp(' en español y .* en inglés'))).toBeNull();
    // No es que falte inglés ni que no haya textos, así que no dice lo de los otros avisos
    expect(screen.queryByText(copy.onlySpanish)).toBeNull();
    expect(screen.queryByText(t.states.calibrating.title)).toBeNull();
  });

  it('cuando los casos suman justo lo que pide el examen no hay aviso en ningún tamaño', async () => {
    const typing = userEvent.setup();
    card();
    const size = screen.getByRole('group', { name: t.exam.size });
    for (const value of ['280', '100', '50', '20']) {
      await typing.click(within(size).getByRole('button', { name: value }));
      expect(screen.queryByText(/Con los casos que hay/), value).toBeNull();
      expect(screen.queryByText(/Solo hay/), value).toBeNull();
    }
  });

  it('con pocos reactivos y un examen chico dice cuántos entran, sin decir que faltan', async () => {
    const typing = userEvent.setup();
    // 6 reactivos de inglés: el de 50 pide 5 y entra un caso de 3, pero no falta inglés
    card({ englishQuestions: english([3, 3]) });
    await typing.click(
      within(screen.getByRole('group', { name: t.exam.size })).getByRole('button', { name: '50' }),
    );
    expect(screen.getByText(copy.fits(3, 5))).toBeVisible();
    expect(screen.queryByText(/Solo hay/)).toBeNull();
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
    expect(
      within(screen.getByRole('group', { name: t.exam.size })).getByRole('button', {
        pressed: true,
      }),
    ).toHaveTextContent('20');
    expect(screen.getByText(new RegExp(copy.composition(18, 2)))).toBeVisible();
    expect(screen.getByText(t.exam.fullLocked)).toBeVisible();
  });

  it('en Gratis con menos preguntas libres que el examen dice que el plan lo limita, con o sin inglés', async () => {
    const typing = userEvent.setup();
    card({ plan: 'free', left: 1 });
    expect(screen.getByText(t.exam.limitedTo(1))).toBeVisible();
    // Con 5 libres cabe un examen de 5 en español, porque 5 preguntas no alcanzan para un texto de inglés
    cleanup();
    card({ plan: 'free', left: 5 });
    expect(screen.getByText(t.exam.limitedTo(5))).toBeVisible();
    expect(screen.queryByText(new RegExp(' en español y '))).toBeNull();
    // Quitar la parte en inglés no cambia que el límite del día sea lo que lo limita
    await typing.click(screen.getByRole('checkbox', { name: copy.include }));
    expect(screen.getByText(t.exam.limitedTo(5))).toBeVisible();
  });

  it('si las preguntas libres alcanzan para todo el examen no dice que el plan lo limita', () => {
    card({ plan: 'free', left: 20 });
    expect(screen.queryByText(t.exam.limitedTo(20))).toBeNull();
    cleanup();
    // Un banco más chico que lo que le queda hoy tampoco lo limita el plan
    card({ plan: 'free', left: 20, questions: spanish(6), englishQuestions: english([3]) });
    expect(screen.queryByText(t.exam.limitedTo(20))).toBeNull();
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

  it('la casilla de inglés vive en los ajustes del examen y su aviso queda junto al botón', () => {
    card({ englishQuestions: english([3, 3]) });
    // Los ajustes finos van en su tarjeta debajo del formulario (D-150)
    const settings = screen.getByRole('region', { name: t.exam.settings });
    expect(within(settings).getByRole('checkbox', { name: copy.include })).toBeVisible();
    expect(screen.getByText(copy.missing(6, 30, true))).toBeVisible();
  });
});
