// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/DataProvider';
import type { Challenge, Membership } from '@/data/schemas/activity';
import type { AppEvent } from '@/data/schemas/events';
import { makeUser, newId } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';
import type { ReadySession } from '../shared/RequireSession';
import { answered, event, minute, option, question } from '../tutor/testing/fixtures';
import { DuelRow } from './DuelRow';

const user = makeUser();
const session: ReadySession = { status: 'ready', user, settings: user.settings, isDemo: false };
const now = '2026-10-01T15:00:00.000Z';

const self: Membership = {
  id: newId(),
  groupId: newId(),
  userId: user.id,
  alias: 'Yo',
  isSimulated: false,
  joinedAt: now,
  leftAt: null,
};
const rival: Membership = {
  ...self,
  id: newId(),
  userId: newId(),
  alias: 'Ana R.',
  isSimulated: true,
};
const questions = Array.from({ length: 20 }, () => question({ id: newId() }));
const challenge: Challenge = {
  id: newId(),
  groupId: self.groupId,
  kind: 'duel',
  title: t.party.duel.title('Ana R.'),
  metric: 'accuracy',
  target: 20,
  isSimulated: true,
  startsAt: now,
  endsAt: '2026-10-08T15:00:00.000Z',
  opponentId: rival.id,
  questionIds: questions.map((item) => item.id),
};

function renderRow(
  props: { questionsLeft: number | null; events?: AppEvent[]; rival?: Membership | undefined } = {
    questionsLeft: null,
  },
  node: ReactNode = null,
) {
  return render(
    <DataProvider kind="real">
      <MemoryRouter>
        <ul>
          <DuelRow
            challenge={challenge}
            rival={'rival' in props ? props.rival : rival}
            self={self}
            events={props.events ?? []}
            session={session}
            questionsLeft={props.questionsLeft}
          />
        </ul>
        {node}
      </MemoryRouter>
    </DataProvider>,
  );
}

describe('duelo pendiente y el límite del plan Gratis', () => {
  it('con las preguntas del día suficientes o sin límite deja jugar', () => {
    for (const left of [null, 20, 45]) {
      const { unmount } = renderRow({ questionsLeft: left });
      expect(screen.getByRole('button', { name: t.party.duel.play })).toBeEnabled();
      expect(screen.getByText(t.party.duel.rivalPlayed)).toBeVisible();
      expect(screen.queryByRole('table')).toBeNull();
      unmount();
    }
  });

  it('con menos preguntas de las que pide el duelo no deja jugar y lleva a los planes', () => {
    for (const left of [12, 19, 0]) {
      const { unmount } = renderRow({ questionsLeft: left });
      expect(screen.queryByRole('button', { name: t.party.duel.play })).toBeNull();
      expect(screen.getByText(t.party.duel.needQuestions(20, left))).toBeVisible();
      expect(screen.getByRole('link', { name: t.party.duel.seePlans })).toHaveAttribute(
        'href',
        expect.stringContaining('suscripcion'),
      );
      unmount();
    }
  });

  it('si el compañero ya salió del grupo no se puede jugar ni se promete un rival', () => {
    renderRow({ questionsLeft: null, rival: undefined });
    expect(screen.queryByRole('button', { name: t.party.duel.play })).toBeNull();
    expect(screen.queryByText(t.party.duel.rivalPlayed)).toBeNull();
  });

  it('siempre marca al compañero como datos simulados', () => {
    renderRow({ questionsLeft: null });
    expect(screen.getByText(t.labels.simulatedData)).toBeVisible();
  });
});

describe('duelo jugado', () => {
  const sessionId = newId();
  const right = option(newId(), true, 'Correcta');
  const events: AppEvent[] = [
    event(
      'session_started',
      { kind: 'challenge', config: { duelId: challenge.id, count: 20 } },
      minute(0),
      sessionId,
    ),
    ...questions.map((item, index) =>
      answered(item, right.id, index < 14, minute(1 + index), { msToAnswer: 30_000 }, sessionId),
    ),
    event(
      'session_ended',
      {
        kind: 'challenge',
        reason: 'completed',
        items: 20,
        correct: 14,
        durationMs: 900_000,
        xp: 0,
      },
      minute(30),
      sessionId,
    ),
  ];

  it('muestra los dos resultados, el veredicto y ya no ofrece jugar', () => {
    renderRow({ questionsLeft: 20, events });
    const table = screen.getByRole('table', { name: t.party.duel.result });
    const rows = within(table).getAllByRole('row');
    // Encabezado, el alumno y el compañero simulado
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent(t.party.duel.you);
    expect(rows[1]).toHaveTextContent(t.party.duel.hitsOf(14, 20));
    // 20 respuestas de 30 segundos son 10 minutos
    expect(rows[1]).toHaveTextContent('10:00');
    expect(rows[2]).toHaveTextContent('Ana R.');
    expect(rows[2]).toHaveTextContent(t.party.simulated);
    expect(screen.getByRole('status')).toHaveTextContent(
      new RegExp(Object.values(t.party.duel.verdicts).join('|')),
    );
    expect(screen.queryByRole('button', { name: t.party.duel.play })).toBeNull();
    expect(screen.queryByText(t.party.duel.rivalPlayed)).toBeNull();
  });
});
