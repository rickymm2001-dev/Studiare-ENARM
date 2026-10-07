// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n/es-MX';
import { HypothesisCard, type ArtifactStatus } from './HypothesisCard';
import { hypothesisKey, type Hypothesis } from './tutorModel';

const hypothesis: Hypothesis = {
  key: hypothesisKey('misreading', 'nephrology'),
  rule: 'misreading',
  area: 'nephrology',
  status: 'confirmed',
  recentFindings: 6,
  findingsNeeded: 0,
  confidence: 'low',
  actions: ['enable_highlight', 'subtopic_simulator', 'review_explanation', 'split_card'],
  items: [
    {
      eventId: 'e1',
      itemId: 'q1',
      kind: 'question',
      at: '2026-10-05T10:00:00.000Z',
      confusedWithItemId: null,
    },
    {
      eventId: 'e2',
      itemId: 'q2',
      kind: 'question',
      at: '2026-10-04T10:00:00.000Z',
      confusedWithItemId: 'q3',
    },
  ],
  causesReported: 0,
  causeMismatches: 0,
};
const lookup = { labelOf: (_kind: string, id: string) => `Pregunta ${id}` };

function renderCard(status: ArtifactStatus | undefined, handlers = {}) {
  const onAction = vi.fn();
  const onRespond = vi.fn();
  render(
    <MemoryRouter>
      <HypothesisCard
        hypothesis={hypothesis}
        status={status}
        lookup={lookup}
        baseTopic={undefined}
        message={undefined}
        busy={false}
        onAction={onAction}
        onRespond={onRespond}
        {...handlers}
      />
    </MemoryRouter>,
  );
  return { onAction, onRespond };
}

describe('tarjeta de una hipótesis del tutor', () => {
  it('dice qué cree con su confianza, sin afirmar, y muestra la evidencia al pedirla', async () => {
    const typing = userEvent.setup();
    renderCard(undefined);
    expect(screen.getByText(t.tutor.confirmedBadge)).toBeVisible();
    expect(screen.getByText(t.tutor.confidence.low)).toBeVisible();
    expect(screen.getByRole('heading', { name: t.tutor.rules.misreading.title })).toBeVisible();
    await typing.click(screen.getByText(t.tutor.showEvidence));
    const evidence = screen.getByText(t.tutor.evidenceTitle).closest('div');
    expect(evidence).not.toBeNull();
    expect(screen.getByText('Pregunta q1')).toBeVisible();
    expect(screen.getByText(t.tutor.evidenceConfused('Pregunta q3'))).toBeVisible();
  });

  it('aplica la acción que cambia algo y lleva a otra pantalla con las que navegan', async () => {
    const typing = userEvent.setup();
    const { onAction } = renderCard(undefined);
    await typing.click(screen.getByRole('button', { name: t.tutor.actions.enable_highlight }));
    expect(onAction).toHaveBeenLastCalledWith('enable_highlight');
    const practice = screen.getByRole('link', { name: t.tutor.actions.subtopic_simulator });
    expect(practice).toHaveAttribute('href', expect.stringContaining('topic=nephrology'));
    await typing.click(practice);
    expect(onAction).toHaveBeenLastCalledWith('subtopic_simulator');
    // Dividir la tarjeta solo lleva a Mazos y así lo dice
    expect(screen.getByRole('link', { name: t.tutor.actions.split_card })).toHaveAttribute(
      'href',
      expect.stringContaining('mazos'),
    );
  });

  it('después de Me sirve las acciones siguen disponibles', async () => {
    const typing = userEvent.setup();
    const { onAction } = renderCard('approved');
    expect(screen.getByText(t.tutor.answered.approved)).toBeVisible();
    expect(screen.queryByRole('button', { name: t.tutor.helpful })).toBeNull();
    await typing.click(screen.getByRole('button', { name: t.tutor.actions.enable_highlight }));
    expect(onAction).toHaveBeenCalledWith('enable_highlight');
  });

  it('responde Me sirve y No me ayuda', async () => {
    const typing = userEvent.setup();
    const { onRespond } = renderCard(undefined);
    await typing.click(screen.getByRole('button', { name: t.tutor.helpful }));
    expect(onRespond).toHaveBeenLastCalledWith(true);
    await typing.click(screen.getByRole('button', { name: t.tutor.notHelpful }));
    expect(onRespond).toHaveBeenLastCalledWith(false);
  });

  it('una descartada no ofrece acciones', () => {
    renderCard('rejected');
    expect(screen.queryByText(t.tutor.actionsTitle)).toBeNull();
    const card = screen.getByRole('heading', { name: t.tutor.rules.misreading.title });
    expect(
      within(card.parentElement as HTMLElement).queryByRole('button', {
        name: t.tutor.actions.enable_highlight,
      }),
    ).toBeNull();
  });
});
