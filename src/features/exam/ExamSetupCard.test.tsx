// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import type { PlanKey } from '@/config/billing';
import { DataProvider } from '@/data/DataProvider';
import { makeUser, newId } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';
import type { ReadySession } from '../shared/RequireSession';
import { ExamSetupCard } from './ExamSetupCard';
import {
  createExamState,
  finishExamState,
  markSessionEnded,
  setQueuedErrors,
  type ExamState,
} from './examState';
import { clearExamState, saveExamState } from './examStorage';

const user = makeUser();
const session: ReadySession = { status: 'ready', user, settings: user.settings, isDemo: false };
const T0 = Date.UTC(2026, 9, 5, 16, 0, 0);

afterEach(() => {
  clearExamState(user.id);
});

function renderInRouter(node: ReactNode) {
  return render(
    <DataProvider kind="real">
      <MemoryRouter>{node}</MemoryRouter>
    </DataProvider>,
  );
}

function card(plan: PlanKey, left: number | null) {
  return renderInRouter(<ExamSetupCard session={session} questions={[]} plan={plan} left={left} />);
}

/** Un examen de 20 que ya terminó. Los pasos del cierre se anotan según el caso */
function finishedExam(steps: { ended?: number; queued?: number } = {}): ExamState {
  let state = finishExamState(
    createExamState({
      examId: newId(),
      userId: user.id,
      seed: 'semilla',
      questionIds: Array.from({ length: 20 }, () => newId()),
      requested: 20,
      shortfall: 0,
      totalMs: 20 * 77_000,
      nowMs: T0,
      highlight: false,
      askConfidence: false,
      alerts: true,
    }),
    T0 + 60_000,
    'completed',
  );
  if (steps.ended !== undefined) state = markSessionEnded(state, steps.ended);
  if (steps.queued !== undefined) state = setQueuedErrors(state, steps.queued);
  saveExamState(state);
  return state;
}

describe('tarjeta del examen en Simular', () => {
  it('con el examen completo permitido arranca en 280 y sin él en lo que le queda hoy', () => {
    card('monthly', null);
    expect(screen.getByRole('combobox', { name: t.exam.size })).toHaveValue('280');
    expect(screen.queryByText(t.exam.fullLocked)).toBeNull();
  });

  it('en el plan Gratis no ofrece 280 y arranca en 20', () => {
    card('free', 20);
    const select = screen.getByRole('combobox', { name: t.exam.size });
    expect(select).toHaveValue('20');
    expect(screen.queryByRole('option', { name: '280' })).toBeNull();
    expect(screen.getByText(t.exam.fullLocked)).toBeVisible();
  });

  it('un examen terminado que no se registró no se pisa. Lleva a guardarlo en los resultados', () => {
    finishedExam({ ended: undefined });
    card('free', 20);
    expect(screen.getByText(t.exam.unsavedTitle)).toBeVisible();
    expect(screen.getByRole('link', { name: t.exam.saveAndSee })).toHaveAttribute(
      'href',
      expect.stringContaining('resultados'),
    );
    expect(screen.queryByRole('button', { name: t.exam.start })).toBeNull();
    expect(screen.queryByRole('combobox', { name: t.exam.size })).toBeNull();
  });

  it('con el fin registrado pero sin pasar los errores al repaso todavía no se puede empezar otro', () => {
    finishedExam({ ended: 5 });
    card('free', 20);
    expect(screen.getByText(t.exam.unsavedTitle)).toBeVisible();
    expect(screen.queryByRole('button', { name: t.exam.start })).toBeNull();
  });

  it('ya registrado ofrece otro examen y dice cuántas acertó del total, no cuántas contestó', () => {
    finishedExam({ ended: 5, queued: 3 });
    card('free', 20);
    expect(screen.getByRole('button', { name: t.exam.start })).toBeVisible();
    expect(screen.getByText(t.exam.lastBody(5, 20))).toBeVisible();
    expect(screen.queryByText(t.exam.unsavedTitle)).toBeNull();
  });

  it('un examen cerrado antes de guardar los aciertos dice cuántas contestó', () => {
    const state = finishedExam({ ended: 5, queued: 3 });
    // Como lo dejaba la versión anterior del estado, sin el campo de aciertos
    saveExamState({ ...state, correct: null });
    card('free', 20);
    expect(screen.getByText(t.exam.lastBodyUnscored(0, 20))).toBeVisible();
  });

  it('con un examen en curso ofrece seguirlo y no armar otro', () => {
    const state = createExamState({
      examId: newId(),
      userId: user.id,
      seed: 'semilla',
      questionIds: [newId(), newId()],
      requested: 2,
      shortfall: 0,
      totalMs: 10 * 60_000,
      nowMs: Date.now(),
      highlight: false,
      askConfidence: false,
      alerts: true,
    });
    saveExamState(state);
    card('free', 20);
    expect(screen.getByText(t.exam.inProgressTitle)).toBeVisible();
    expect(screen.getByRole('link', { name: t.exam.resume })).toBeVisible();
    expect(screen.queryByRole('button', { name: t.exam.start })).toBeNull();
  });
});
