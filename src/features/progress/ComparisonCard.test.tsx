// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { ComparisonCell, ComparisonSnapshot } from '@/data/model/contracts';
import { distributionCuts, type ComparisonFact } from '@/engines/comparison';
import { modelTexts } from '@/i18n/model';
import type { ComparisonState } from '../model/modelSnapshots';
import { ComparisonCard } from './ComparisonCard';

const text = modelTexts.comparison;
const FORBIDDEN =
  /puntaje (estimado|esperado|probable)|probabilidad|plaza|ranking|lugar n[uú]mero/i;

const accuracyCuts = distributionCuts(
  Array.from({ length: 60 }, (_, index) => Math.round((0.3 + index * 0.01) * 100) / 100),
  'sim_accuracy',
);
const reviewCuts = distributionCuts(
  Array.from({ length: 60 }, (_, index) => index * 10),
  'reviews',
);
const cell = (
  over: Partial<ComparisonCell> & Pick<ComparisonCell, 'metric' | 'branch'>,
): ComparisonCell => ({
  cohort: 'all',
  students: 60,
  state: 'ready',
  cuts: null,
  ...over,
});

const snapshotOf = (over: Partial<ComparisonSnapshot> = {}): ComparisonSnapshot => ({
  available: true,
  runAt: '2026-10-15T10:23:00.000Z',
  studyDay: '2026-10-15',
  windowDays: 30,
  minGroupSize: 30,
  specialty: null,
  cells: [
    cell({ metric: 'sim_accuracy', branch: '*', cuts: accuracyCuts }),
    cell({ metric: 'sim_accuracy', branch: 'pediatrics', cuts: accuracyCuts }),
    cell({ metric: 'sim_accuracy', branch: 'general_surgery', students: 14, state: 'calibrating' }),
    cell({ metric: 'reviews', branch: '*', cuts: reviewCuts }),
  ],
  ...over,
});
const ready = (
  snapshot: ComparisonSnapshot,
  source: 'cloud' | 'demo' = 'cloud',
): ComparisonState => ({
  status: 'ready',
  snapshot,
  source,
});

const answer = (branch: string, correct: boolean, day: string): ComparisonFact => ({
  day,
  kind: 'answer',
  branch,
  correct,
  sessionKind: 'practice',
});
/** 25 respuestas en pediatría con 18 aciertos, que quedan en el percentil 70 */
const facts: ComparisonFact[] = [
  ...Array.from({ length: 25 }, (_, index) =>
    answer('pediatrics', index < 18, `2026-10-${String(1 + (index % 10)).padStart(2, '0')}`),
  ),
  { day: '2026-10-02', kind: 'review', count: 450 },
];

const renderCard = (state: ComparisonState, given: readonly ComparisonFact[] = facts) =>
  render(
    <MemoryRouter>
      <ComparisonCard state={state} facts={given} />
    </MemoryRouter>,
  );

describe('Cómo vas frente a otros', () => {
  it('siempre trae su pie fijo, que dice que no es un pronóstico', () => {
    renderCard({ status: 'loading' });
    expect(screen.getByRole('heading', { name: text.title })).toBeVisible();
    expect(screen.getByText(text.footer)).toBeVisible();
    expect(text.footer).toMatch(/no es un pronóstico/i);
  });

  it('mientras llega la foto dice que carga', () => {
    renderCard({ status: 'loading' });
    expect(screen.getByRole('status')).toHaveTextContent(text.loading);
  });

  it('sin la nube o sin foto publicada dice calibrando y explica por qué', () => {
    const { unmount } = renderCard({ status: 'unavailable', reason: 'no_cloud' });
    expect(screen.getByRole('status')).toHaveTextContent(text.unavailable.no_cloud);
    expect(screen.getByRole('status')).toHaveTextContent('Calibrando');
    unmount();
    renderCard({ status: 'unavailable', reason: 'no_snapshot' });
    expect(screen.getByRole('status')).toHaveTextContent(text.unavailable.no_snapshot);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('con la foto lista dice el percentil de cada rama, de los repasos y la noche que la calculó', () => {
    renderCard(ready(snapshotOf()));
    const pediatrics = screen.getByText('Pediatría').closest('li');
    expect(pediatrics).not.toBeNull();
    const row = within(pediatrics as HTMLElement);
    expect(row.getByText('Percentil 70')).toBeVisible();
    expect(row.getByText(text.sentence.sim_accuracy.mid(70, 30))).toBeVisible();
    expect(row.getByRole('progressbar', { name: 'Pediatría. Percentil 70' })).toBeVisible();
    // Repasos hechos con su percentil
    const reviews = screen.getByRole('region', { name: text.metrics.reviews });
    expect(within(reviews).getByText(/^Percentil \d+$/)).toBeVisible();
    // La noche del corte menos uno
    expect(screen.getByText(text.calculated('14 de octubre'))).toBeVisible();
  });

  it('un grupo chico calibra y dice cuántos alumnos con datos le faltan', () => {
    renderCard(ready(snapshotOf()));
    const surgery = screen.getByText('Cirugía general').closest('li') as HTMLElement;
    expect(within(surgery).getByRole('status')).toHaveTextContent(
      `Calibrando. ${text.groupCalibrating(16)}`,
    );
    expect(within(surgery).queryByRole('progressbar')).toBeNull();
  });

  it('con pocas respuestas propias en la rama calibra y dice cuántas lleva', () => {
    renderCard(
      ready(snapshotOf()),
      facts.filter((fact) => fact.kind !== 'answer' || fact.day < '2026-10-03'),
    );
    const pediatrics = screen.getByText('Pediatría').closest('li') as HTMLElement;
    expect(within(pediatrics).getByRole('status')).toHaveTextContent(
      text.ownCalibratingBranch(6, 20),
    );
  });

  it('sin especialidad elegida solo hay Todos y un enlace a Tus datos', () => {
    renderCard(ready(snapshotOf({ specialty: null })));
    expect(screen.queryByRole('button', { name: text.cohorts.specialty })).toBeNull();
    expect(screen.getByText(text.noSpecialty)).toBeVisible();
    expect(screen.getByRole('link', { name: text.goToData })).toHaveAttribute(
      'href',
      '/configuracion#perfil',
    );
  });

  it('con especialidad elegida se puede comparar con quienes buscan lo mismo', async () => {
    const snapshot = snapshotOf({
      specialty: 'general_surgery',
      cells: [
        ...snapshotOf().cells,
        cell({
          cohort: 'specialty',
          metric: 'sim_accuracy',
          branch: '*',
          students: 40,
          cuts: accuracyCuts,
        }),
        cell({
          cohort: 'specialty',
          metric: 'reviews',
          branch: '*',
          students: 12,
          state: 'calibrating',
        }),
      ],
    });
    renderCard(ready(snapshot));
    expect(screen.queryByText(text.noSpecialty)).toBeNull();
    const specialty = screen.getByRole('button', { name: text.cohorts.specialty });
    const all = screen.getByRole('button', { name: text.cohorts.all });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(specialty);
    expect(specialty).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(text.specialtyFor('Cirugía General'))).toBeVisible();
    // El grupo de 12 alumnos con datos en repasos calibra
    const reviews = screen.getByRole('region', { name: text.metrics.reviews });
    expect(within(reviews).getByRole('status')).toHaveTextContent(text.groupCalibrating(18));
    // Las ramas de Todos no están en este grupo
    expect(screen.queryByText('Pediatría')).toBeNull();
  });

  it('una especialidad sin ninguna celda dice que todavía no hay alumnos con datos', async () => {
    renderCard(ready(snapshotOf({ specialty: 'anesthesiology' })));
    await userEvent.click(screen.getByRole('button', { name: text.cohorts.specialty }));
    expect(screen.getByRole('status')).toHaveTextContent(text.emptyGroup);
  });

  it('en la demostración lleva la etiqueta de datos simulados y lo explica', () => {
    renderCard(ready(snapshotOf(), 'demo'));
    expect(screen.getAllByText('Datos simulados').length).toBeGreaterThan(0);
    expect(screen.getByText(text.simulated)).toBeVisible();
  });

  it('con la nube real no lleva la etiqueta de datos simulados', () => {
    renderCard(ready(snapshotOf(), 'cloud'));
    expect(screen.queryByText('Datos simulados')).toBeNull();
    expect(screen.queryByText(text.simulated)).toBeNull();
  });

  it('nunca habla de puntaje estimado, de probabilidad, de plaza ni de lugares en una lista', () => {
    const snapshot = snapshotOf({
      specialty: 'general_surgery',
      cells: [
        ...snapshotOf().cells,
        cell({
          cohort: 'specialty',
          metric: 'reviews',
          branch: '*',
          students: 12,
          state: 'calibrating',
        }),
      ],
    });
    const states: ComparisonState[] = [
      { status: 'loading' },
      { status: 'unavailable', reason: 'no_cloud' },
      { status: 'unavailable', reason: 'no_snapshot' },
      ready(snapshot),
      ready(snapshot, 'demo'),
    ];
    for (const state of states) {
      const { container, unmount } = renderCard(state);
      expect(container.textContent).not.toMatch(FORBIDDEN);
      unmount();
    }
  });
});
