// Abre una práctica con una lista de preguntas ya elegida, por ejemplo las que se fallaron en un
// examen. Deja el inicio de sesión en la bitácora y arma la práctica en curso, igual que la
// configuración del simulador, y la pantalla de pregunta la toma desde ahí.
import type { DataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import { newId } from '@/data/ids';
import type { User } from '@/data/schemas/people';
import { clock, usePractice } from './practice';

export async function startPracticeWithQuestions(
  api: Pick<DataApi, 'recordEvent'>,
  user: Pick<User, 'id' | 'timeZone'>,
  questionIds: readonly string[],
  origin: 'exam_missed',
): Promise<boolean> {
  if (questionIds.length === 0) return false;
  const sessionId = newId();
  await api.recordEvent(
    createEvent(
      'session_started',
      { kind: 'practice', config: { count: questionIds.length, sampling: origin } },
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
    kind: 'practice',
    duelId: null,
    targetTags: [],
  });
  return true;
}
