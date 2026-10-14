// Un duelo de la nube entre dos alumnos reales (B7 del plan del cambio, respuesta 69). Antes de jugar
// dice las reglas y deja jugar sin mostrar nada del rival. Es un solo intento. Al tocar Jugar el inicio
// queda en el servidor y desde ahí no se vuelve a ofrecer jugar, ni en otro dispositivo. A medias deja
// continuar en la misma pestaña. Ya jugado muestra el resultado propio y espera al rival. Con los dos
// resultados muestra quién ganó. El servidor solo manda el resultado del rival después del propio, y
// mientras el propio se guarda se lee de la bitácora de este dispositivo.
import { getCloud } from '@/data/cloud/client';
import {
  startPartyDuel,
  type DuelScore,
  type PartyDuel,
  type PartyMember,
} from '@/data/cloud/party';
import type { AppEvent } from '@/data/schemas/events';
import type { DuelResult } from '@/engines/party';
import { t } from '@/i18n/es-MX';
import { formatDuration } from '../simulator/practice';
import type { ReadySession } from '../shared/RequireSession';
import { localDuelResult, submittableResult } from './cloudNumbers';
import { useActiveDuelSession, type DuelStartClaim } from './duelActions';
import { DuelFrame, DuelInProgress, DuelPlayArea, DuelScoreTable } from './DuelRow';
import { duelAttemptSession } from './duels';

const text = t.partyCloud.duels;

const resultOf = (score: DuelScore, memberId: string): DuelResult => ({
  memberId,
  correct: score.correct,
  answered: score.answered,
  totalMs: score.totalMs,
});

/** Registra el inicio del duelo en el servidor antes de abrir la práctica */
async function claimCloudStart(duelId: string): Promise<DuelStartClaim> {
  const cloud = getCloud();
  if (!cloud) return 'failed';
  const reply = await startPartyDuel(cloud, duelId);
  return reply.ok ? reply.value : 'failed';
}

export function CloudDuelRow({
  duel,
  members,
  session,
  events,
  questionsLeft,
}: {
  duel: PartyDuel;
  /** Los miembros activos del grupo. El rival que salió ya no está aquí */
  members: readonly PartyMember[];
  session: ReadySession;
  events: readonly AppEvent[];
  /** Preguntas que le quedan hoy según su plan. null es sin límite */
  questionsLeft: number | null;
}) {
  const activeSessionId = useActiveDuelSession(session.user.id);
  const self = members.find((member) => member.isSelf);
  const rivalId = duel.challengerId === self?.userId ? duel.opponentId : duel.challengerId;
  const rival = members.find((member) => member.userId === rivalId && !member.isSelf);
  const rivalAlias = rival?.alias ?? text.formerMember;
  const attempt = duelAttemptSession(events, duel.id);
  const inProgress = duel.mine === null && attempt !== null && attempt === activeSessionId;
  const local = attempt !== null && !inProgress ? localDuelResult(events, duel) : null;
  // Lo de la bitácora se muestra como se manda, con el tiempo mínimo por acierto
  const mine = duel.mine
    ? resultOf(duel.mine, 'self')
    : local
      ? { ...local, ...submittableResult(local) }
      : null;

  return (
    <DuelFrame title={t.party.duel.title(rivalAlias)} simulated={false}>
      {mine && duel.rival ? (
        <DuelScoreTable
          self={mine}
          rival={resultOf(duel.rival, 'rival')}
          rivalAlias={rivalAlias}
          rivalSimulated={false}
        />
      ) : mine ? (
        <div className="mt-1 flex flex-col gap-1 text-sm">
          <p>{text.yourResult(mine.correct, mine.answered, formatDuration(mine.totalMs))}</p>
          <p role="status" className="text-fg-muted">
            {rival ? text.waiting(rival.alias) : text.rivalLeft}
          </p>
        </div>
      ) : inProgress ? (
        <DuelInProgress />
      ) : duel.startedAt !== null ? (
        // Lo empezó en otro dispositivo, o su intento ya no está en este. No se vuelve a jugar
        <p role="status" className="mt-1 text-sm">
          {text.startedElsewhere}
        </p>
      ) : (
        <DuelPlayArea
          duel={duel}
          session={session}
          questionsLeft={questionsLeft}
          canPlay={rival !== undefined}
          note={rival ? null : text.rivalLeft}
          claimStart={() => claimCloudStart(duel.id)}
        />
      )}
    </DuelFrame>
  );
}
