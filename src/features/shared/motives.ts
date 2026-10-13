// Los motivos de error en la interfaz (B5, comentario 2). Lee los que ya marcó el alumno y deja uno
// nuevo. Cambiar de motivo es otro evento y vale el último, porque la bitácora solo se agrega.
import type { DataApi } from '@/data/context';
import { useRepositories } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import { useLiveData } from '@/data/hooks';
import type { AppEvent } from '@/data/schemas/events';
import type { User } from '@/data/schemas/people';
import type { ErrorMotive, MotiveTargetKind } from '@/engines/errorCauses';

/** Los motivos que marcó el alumno, reactivos. Solo ese tipo de evento, que es poco */
export function useMotiveReports(userId: string): AppEvent[] | undefined {
  const repos = useRepositories();
  return useLiveData(
    () => repos.events.query({ userId, types: ['cause_reported'] }),
    [repos, userId],
  );
}

/** Deja el motivo de un error. Si ya había uno, este lo reemplaza al leer, sin editar el anterior */
export function reportMotive(
  api: Pick<DataApi, 'recordEvent'>,
  user: Pick<User, 'id' | 'timeZone'>,
  target: { kind: MotiveTargetKind; id: string },
  motive: ErrorMotive,
  sessionId: string | null = null,
): Promise<AppEvent> {
  return api.recordEvent(
    createEvent(
      'cause_reported',
      { targetKind: target.kind, targetId: target.id, cause: motive },
      { userId: user.id, tz: user.timeZone, sessionId },
    ),
  );
}
