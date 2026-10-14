import { describe, expect, it } from 'vitest';
import type { PartyOverview } from '@/data/cloud/party';
import type { AppEvent } from '@/data/schemas/events';
import { newId } from '@/data/testing/fixtures';
import { answered, event, minute, option, question } from '../tutor/testing/fixtures';
import {
  contributionTo,
  myPartyNumbers,
  playedDuelsToSubmit,
  submittableResult,
} from './cloudNumbers';
import { partyModeOf } from './partyMode';

const day = (cards: number, questions: number, xp: number) => ({
  cards,
  questions,
  xp,
  focusMinutes: 0,
});
const snapshot = {
  today: '2026-10-15',
  weeklyXp: 260,
  activity: {
    '2026-10-11': day(100, 100, 999),
    '2026-10-12': day(10, 4, 80),
    '2026-10-13': day(20, 6, 100),
    '2026-10-15': day(5, 2, 80),
  },
};

const DUEL = '6e5d4c3b-2a19-4f8e-9d7c-6b5a4f3e2d1c';
const questions = Array.from({ length: 20 }, () => question({ id: newId() }));

function overview(
  duelMine: PartyOverview['groups'][number]['duels'][number]['mine'],
): PartyOverview {
  return {
    weekStart: '2026-10-12',
    groups: [
      {
        id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
        name: 'Guardia',
        inviteCode: 'ABC234',
        isOwner: true,
        joinedAt: '2026-10-12T15:00:00.000Z',
        members: [],
        challenges: [
          {
            id: '5b2a1c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d',
            title: 'Tarjetas',
            metric: 'cards',
            target: 100,
            startsAt: '2026-10-12T15:00:00.000Z',
            endsAt: '2026-10-19T15:00:00.000Z',
            createdBySelf: true,
            total: 0,
            mine: null,
          },
          {
            id: '0f1e2d3c-4b5a-4968-8776-655443322110',
            title: 'Ya terminó',
            metric: 'xp',
            target: 100,
            startsAt: '2026-10-01T15:00:00.000Z',
            endsAt: '2026-10-08T15:00:00.000Z',
            createdBySelf: false,
            total: 0,
            mine: null,
          },
        ],
        duels: [
          {
            id: DUEL,
            challengerId: '2f6c4b1e-8a3d-4c7e-9b10-6d2e5f7a8b01',
            opponentId: '7a1d3c5e-2b4f-4a6c-8e9d-0f1a2b3c4d5e',
            questionIds: questions.map((item) => item.id),
            createdAt: '2026-10-12T15:00:00.000Z',
            startedAt: null,
            mine: duelMine,
            rival: null,
          },
        ],
      },
    ],
  };
}

describe('aportes a los retos de la nube', () => {
  it('cuenta lo del alumno desde el día en que empezó el reto según su métrica', () => {
    const challenge = {
      metric: 'cards' as const,
      startsAt: '2026-10-12T15:00:00.000Z',
      endsAt: '2026-10-19T15:00:00.000Z',
    };
    expect(contributionTo(challenge, snapshot, 'America/Merida')).toBe(35);
    expect(contributionTo({ ...challenge, metric: 'questions' }, snapshot, 'America/Merida')).toBe(
      12,
    );
    // accuracy era de los duelos de antes y cuenta como preguntas
    expect(contributionTo({ ...challenge, metric: 'accuracy' }, snapshot, 'America/Merida')).toBe(
      12,
    );
  });

  it('no cuenta lo que se estudió después de que terminó el reto', () => {
    expect(
      contributionTo(
        { metric: 'xp', startsAt: '2026-10-12T15:00:00.000Z', endsAt: '2026-10-13T15:00:00.000Z' },
        snapshot,
        'America/Merida',
      ),
    ).toBe(180);
  });

  it('publica el XP de la semana y solo los retos que todavía se pueden publicar', () => {
    const numbers = myPartyNumbers(
      overview(null),
      snapshot,
      'America/Merida',
      new Date('2026-10-15T18:00:00.000Z'),
    );
    expect(numbers.weeklyXp).toBe(260);
    expect([...numbers.contributions]).toEqual([['5b2a1c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d', 35]]);
  });

  it('recorta a los topes del servidor, así nunca se rechaza la publicación (PT004)', () => {
    const big = {
      ...snapshot,
      weeklyXp: 80_000,
      activity: { ...snapshot.activity, '2026-10-13': day(500, 6, 100) },
    };
    const numbers = myPartyNumbers(
      overview(null),
      big,
      'America/Merida',
      new Date('2026-10-15T18:00:00.000Z'),
    );
    expect(numbers.weeklyXp).toBe(50_000);
    // Nadie aporta más que la meta de 100 tarjetas de todo el grupo
    expect(numbers.contributions.get('5b2a1c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d')).toBe(100);
  });
});

describe('duelos jugados en este dispositivo', () => {
  const sessionId = newId();
  const right = option(newId(), true, 'Correcta');
  const played: AppEvent[] = [
    event(
      'session_started',
      { kind: 'challenge', config: { duelId: DUEL, count: 20 } },
      minute(0),
      sessionId,
    ),
    ...questions.map((item, index) =>
      answered(item, right.id, index < 13, minute(1 + index), { msToAnswer: 30_000 }, sessionId),
    ),
    event(
      'session_ended',
      {
        kind: 'challenge',
        reason: 'completed',
        items: 20,
        correct: 13,
        durationMs: 900_000,
        xp: 0,
      },
      minute(30),
      sessionId,
    ),
  ];

  it('manda el resultado de un duelo terminado que el servidor todavía no tiene', () => {
    expect(playedDuelsToSubmit(overview(null), played)).toEqual([
      { duelId: DUEL, correct: 13, totalMs: 600_000 },
    ]);
  });

  it('un intento que se dejó a medias cuenta, con las que faltan como incorrectas', () => {
    // Sin el fin de la sesión y con solo 5 respuestas
    const halfway = played.slice(0, 6);
    expect(playedDuelsToSubmit(overview(null), halfway)).toEqual([
      { duelId: DUEL, correct: 5, totalMs: 150_000 },
    ]);
    // Empezar otra sesión del mismo duelo no cambia nada. Cuenta la primera
    const replay = newId();
    const again: AppEvent[] = [
      ...halfway,
      event(
        'session_started',
        { kind: 'challenge', config: { duelId: DUEL, count: 20 } },
        minute(40),
        replay,
      ),
      ...questions.map((item, index) =>
        answered(item, right.id, true, minute(41 + index), { msToAnswer: 30_000 }, replay),
      ),
    ];
    expect(playedDuelsToSubmit(overview(null), again)).toEqual([
      { duelId: DUEL, correct: 5, totalMs: 150_000 },
    ]);
  });

  it('no manda el duelo que tiene abierto en esta pestaña hasta que lo termine o lo deje', () => {
    expect(playedDuelsToSubmit(overview(null), played.slice(0, 6), sessionId)).toEqual([]);
    expect(playedDuelsToSubmit(overview(null), played.slice(0, 6), newId())).toHaveLength(1);
  });

  it('un tiempo menor al mínimo por acierto se manda como el mínimo', () => {
    expect(submittableResult({ correct: 2, totalMs: 0 })).toEqual({ correct: 2, totalMs: 6_000 });
    expect(submittableResult({ correct: 0, totalMs: 0 })).toEqual({ correct: 0, totalMs: 0 });
    expect(submittableResult({ correct: 4, totalMs: 90_000 })).toEqual({
      correct: 4,
      totalMs: 90_000,
    });
    const fast: AppEvent[] = [
      played[0] as AppEvent,
      ...questions
        .slice(0, 3)
        .map((item, index) =>
          answered(item, right.id, true, minute(1 + index), { msToAnswer: 500 }, sessionId),
        ),
    ];
    expect(playedDuelsToSubmit(overview(null), fast)).toEqual([
      { duelId: DUEL, correct: 3, totalMs: 9_000 },
    ]);
  });

  it('no manda nada si no lo ha empezado o si el servidor ya lo tiene', () => {
    expect(playedDuelsToSubmit(overview(null), [])).toEqual([]);
    expect(
      playedDuelsToSubmit(
        overview({
          correct: 13,
          answered: 20,
          totalMs: 600_000,
          finishedAt: '2026-10-12T16:00:00.000Z',
        }),
        played,
      ),
    ).toEqual([]);
  });
});

describe('dónde vive Party', () => {
  it('la demostración siempre es local y una cuenta real usa la nube conectada', () => {
    expect(partyModeOf(true, 'linked')).toBe('demo');
    expect(partyModeOf(false, 'linked')).toBe('cloud');
    expect(partyModeOf(false, 'checking')).toBe('checking');
    expect(partyModeOf(false, 'error')).toBe('cloud_error');
    expect(partyModeOf(false, 'signed-out')).toBe('signed_out');
    expect(partyModeOf(false, 'off')).toBe('local_only');
  });
});
