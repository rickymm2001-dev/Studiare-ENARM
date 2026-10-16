// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/DataProvider';
import type { PoolQuestion } from '@/data/bank/questionSource';
import { makeUser } from '@/data/testing/fixtures';
import { englishText } from '@/i18n/english';
import { t } from '@/i18n/es-MX';
import type { ReadySession } from '../shared/RequireSession';
import { EnglishPracticeCard } from './EnglishPracticeCard';
import type * as EnglishPractice from './englishPractice';
import { startEnglishPractice } from './englishPractice';

// Empezar baja cuerpos y arma la práctica, y eso ya lo prueba englishPractice.test.ts. Aquí solo importa
// con qué se llama y qué hace la tarjeta con la respuesta
vi.mock('./englishPractice', async (importOriginal) => ({
  ...(await importOriginal<typeof EnglishPractice>()),
  startEnglishPractice: vi.fn(),
}));

const user = makeUser();
const session: ReadySession = { status: 'ready', user, settings: user.settings, isDemo: false };
const copy = englishText.practice;

function text(key: string, items: number): PoolQuestion[] {
  return Array.from({ length: items }, (_, order) => ({
    id: `${key}-${order + 1}`,
    questionId: `${key}-q${order + 1}`,
    version: 1,
    caseId: key,
    caseOrder: order + 1,
    branch: 'medical_english',
    topic: 'reading_comprehension',
    subtopic: 'english_pediatrics',
    physicianDifficulty: 3,
    isDemo: false,
    structure: { polarity: 'affirmative', task: 'data_interpretation', format: 'serial_case' },
    examEligible: true,
    language: 'en',
    distractorBiases: [],
    cached: false,
  }));
}
const POOL = [...text('a', 3), ...text('b', 2), ...text('c', 3), ...text('d', 2)];

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

function renderCard(
  props: Partial<React.ComponentProps<typeof EnglishPracticeCard>> = {},
  extra: ReactNode = null,
) {
  return render(
    <DataProvider kind="real">
      <MemoryRouter>
        <EnglishPracticeCard
          session={session}
          pool={{ practice: POOL, exam: POOL }}
          left={null}
          reserved={0}
          report={undefined}
          {...props}
        />
        <Where />
        {extra}
      </MemoryRouter>
    </DataProvider>,
  );
}

beforeEach(() => {
  vi.mocked(startEnglishPractice).mockResolvedValue({ started: true });
});
afterEach(() => {
  vi.mocked(startEnglishPractice).mockReset();
  cleanup();
});

describe('tarjeta de Inglés médico en Simular (B13, 2.1)', () => {
  it('sin textos dice Sin textos y que los agregan los médicos, sin prometer vocabulario ni mandar a los mazos', () => {
    renderCard({ pool: { practice: [], exam: [] } });
    const region = screen.getByRole('region', { name: copy.title });
    expect(within(region).getByText(copy.none.title)).toBeVisible();
    expect(
      within(region).getByText('Todavía no hay textos de lectura. Los agregan los médicos.'),
    ).toBeVisible();
    // El mazo de vocabulario puede no existir todavía, así que la tarjeta no lo promete ni manda a Mazos
    expect(region).not.toHaveTextContent(/vocabulario/i);
    expect(within(region).queryByRole('link')).toBeNull();
    expect(copy.none).not.toHaveProperty('vocabulary');
    expect(copy.none).not.toHaveProperty('goDecks');
    expect(screen.queryByRole('button', { name: copy.start })).toBeNull();
    expect(screen.queryByText(t.states.calibrating.title)).toBeNull();
  });

  it('con pocos reactivos la práctica está abierta y dice Calibrando con cuántos hay de los 30', () => {
    renderCard();
    expect(screen.getByText(t.states.calibrating.title)).toBeVisible();
    expect(
      screen.getByText(/10 de 30 reactivos de inglés\. Faltan 20 reactivos de inglés/),
    ).toBeVisible();
    expect(screen.getByText(`${copy.texts(4)} · ${copy.suggested(90)}`)).toBeVisible();
    expect(screen.getByRole('button', { name: copy.start })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: copy.countLabel })).toHaveValue('3');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      '1',
      '3',
      '5',
      '10',
    ]);
  });

  it('con 30 reactivos ya no dice Calibrando', () => {
    const many = Array.from({ length: 12 }, (_, i) => text(`t${i}`, i % 2 === 0 ? 2 : 3)).flat();
    renderCard({ pool: { practice: many, exam: many } });
    expect(screen.queryByText(t.states.calibrating.title)).toBeNull();
    expect(screen.getByText(copy.texts(12), { exact: false })).toBeVisible();
    expect(screen.getByRole('button', { name: copy.start })).toBeEnabled();
  });

  it('pedir más textos de los que hay lo dice y la práctica es de todos', async () => {
    const typing = userEvent.setup();
    renderCard();
    await typing.selectOptions(screen.getByRole('combobox', { name: copy.countLabel }), '10');
    expect(screen.getByText(copy.fewer(10, 4))).toBeVisible();
  });

  it('empieza con los textos que cabe y lleva a la pregunta', async () => {
    const typing = userEvent.setup();
    renderCard();
    await typing.click(screen.getByRole('button', { name: copy.start }));
    await waitFor(() => {
      expect(screen.getByTestId('where')).toHaveTextContent('/simular/pregunta');
    });
    expect(startEnglishPractice).toHaveBeenCalledWith(
      expect.objectContaining({ texts: 3, left: null, targetTags: [], secondsPerItem: 90 }),
    );
  });

  it('si no se pudo empezar dice por qué y se queda en Simular', async () => {
    const typing = userEvent.setup();
    vi.mocked(startEnglishPractice).mockResolvedValue({
      started: false,
      message: 'Vas muy rápido. Espera un minuto para seguir.',
    });
    renderCard();
    await typing.click(screen.getByRole('button', { name: copy.start }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Vas muy rápido');
    expect(screen.getByTestId('where')).toHaveTextContent('/');
    expect(screen.getByTestId('where').textContent).not.toContain('pregunta');
    expect(screen.getByRole('button', { name: copy.start })).toBeEnabled();
  });

  it('una falla inesperada no deja la tarjeta atorada', async () => {
    const typing = userEvent.setup();
    vi.mocked(startEnglishPractice).mockRejectedValue(new Error('sin red'));
    renderCard();
    await typing.click(screen.getByRole('button', { name: copy.start }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByRole('button', { name: copy.start })).toBeEnabled();
  });

  describe('con el plan Gratis', () => {
    it('sin preguntas hoy da el botón de los candados y no el de empezar', () => {
      renderCard({ left: 0 });
      expect(screen.getByText(copy.limitReached)).toBeVisible();
      expect(screen.queryByRole('button', { name: copy.start })).toBeNull();
      expect(
        screen.getByRole('link', {
          name: new RegExp(`${t.billing.featureSeePlans}|${t.billing.freeTrialCta}`),
        }),
      ).toBeVisible();
    });

    it('si un examen sin terminar tiene apartadas las preguntas, lleva al examen', () => {
      renderCard({ left: 0, reserved: 20 });
      expect(screen.getByText(copy.limitUsedByExam)).toBeVisible();
      expect(screen.getByRole('link', { name: copy.goToOpenExam })).toHaveAttribute(
        'href',
        '/simular/examen',
      );
    });

    it('si quedan 2 y el texto más corto trae 3, lo dice antes de empezar y no deja empezar', () => {
      const threes = [...text('a', 3), ...text('b', 3)];
      renderCard({ pool: { practice: threes, exam: threes }, left: 2 });
      expect(screen.getByText(copy.noFit(2, 3))).toBeVisible();
      expect(screen.getByRole('button', { name: copy.start })).toBeDisabled();
    });

    it('con lo que le queda dice hasta cuántos textos completos alcanza', () => {
      renderCard({ left: 5 });
      // Pide 3 y con 5 preguntas solo caben dos textos de 2 preguntas o uno de 2 y uno de 3
      expect(screen.getByText(copy.limitedTo(5, 2))).toBeVisible();
      expect(screen.getByRole('button', { name: copy.start })).toBeEnabled();
    });

    it('manda a la práctica lo que le queda hoy para que nunca pase de ahí', async () => {
      const typing = userEvent.setup();
      renderCard({ left: 5 });
      await typing.click(screen.getByRole('button', { name: copy.start }));
      await waitFor(() => {
        expect(startEnglishPractice).toHaveBeenCalledWith(
          expect.objectContaining({ left: 5, texts: 2 }),
        );
      });
    });
  });
});
