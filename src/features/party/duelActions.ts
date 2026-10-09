// Lo que el alumno hace con un duelo desde Party (9.6). Crearlo fija sus preguntas y empezarlo abre la
// práctica con esas preguntas como una sesión de tipo reto. El resultado nunca se guarda aparte, sale
// de la bitácora (duels.ts).
import type { DataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import { newId } from '@/data/ids';
import type { Challenge, Group, Membership } from '@/data/schemas/activity';
import type { User } from '@/data/schemas/people';
import { ensureDemoBank } from '@/data/usecases/bank';
import { createDuel } from '@/data/usecases/party';
import { listStudentPool } from '@/data/usecases/studentBank';
import { DUEL_QUESTIONS } from '@/engines/party';
import { t } from '@/i18n/es-MX';
import { pickQuestions } from '../simulator/pickQuestions';
import { clock, usePractice } from '../simulator/practice';

/** Reta a un compañero con las mismas preguntas para los dos. null si el banco no tiene preguntas */
export async function challengeToDuel(
  api: Pick<DataApi, 'repos'>,
  group: Group,
  opponent: Pick<Membership, 'id' | 'alias'>,
): Promise<Challenge | null> {
  await ensureDemoBank(api);
  const { practice: questions } = await listStudentPool(api);
  if (questions.length === 0) return null;
  const id = newId();
  // La semilla es el id del duelo, así las preguntas salen en el mismo orden para quien las juegue
  const picked = pickQuestions(questions, `duel|${id}`, DUEL_QUESTIONS);
  return createDuel(api, group, {
    id,
    title: t.party.duel.title(opponent.alias),
    opponent,
    questionIds: picked.map((question) => question.id),
  });
}

/** Abre la práctica del duelo. false si el reto no es un duelo con preguntas */
export async function startDuel(
  api: Pick<DataApi, 'recordEvent'>,
  user: Pick<User, 'id' | 'timeZone'>,
  challenge: Challenge,
): Promise<boolean> {
  const questionIds = challenge.questionIds;
  if (challenge.kind !== 'duel' || !questionIds?.length) return false;
  const sessionId = newId();
  await api.recordEvent(
    createEvent(
      'session_started',
      { kind: 'challenge', config: { duelId: challenge.id, count: questionIds.length } },
      { userId: user.id, tz: user.timeZone, sessionId },
    ),
  );
  usePractice.getState().set({
    sessionId,
    userId: user.id,
    questionIds: [...questionIds],
    index: 0,
    answers: [],
    startedAt: clock(),
    ended: false,
    kind: 'challenge',
    duelId: challenge.id,
    targetTags: [],
  });
  return true;
}
