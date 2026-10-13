// Un duelo de la nube entre dos alumnos reales (B7 del plan del cambio, respuesta 69). Antes de jugar
// dice las reglas y deja jugar sin mostrar nada del rival. Ya jugado muestra el resultado propio y
// espera al rival. Con los dos resultados muestra quién ganó. El servidor solo manda el resultado del
// rival después del propio, y mientras el propio se guarda se lee de la bitácora de este dispositivo.
import type { DuelScore, PartyDuel, PartyMember } from '@/data/cloud/party';
import type { AppEvent } from '@/data/schemas/events';
import type { DuelResult } from '@/engines/party';
import { t } from '@/i18n/es-MX';
import { formatDuration } from '../simulator/practice';
import type { ReadySession } from '../shared/RequireSession';
import { localDuelResult } from './cloudNumbers';
import { DuelFrame, DuelPlayArea, DuelScoreTable } from './DuelRow';

const text = t.partyCloud.duels;

const resultOf = (score: DuelScore, memberId: string): DuelResult => ({
  memberId,
  correct: score.correct,
  answered: score.answered,
  totalMs: score.totalMs,
});

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
  const self = members.find((member) => member.isSelf);
  const rivalId = duel.challengerId === self?.userId ? duel.opponentId : duel.challengerId;
  const rival = members.find((member) => member.userId === rivalId && !member.isSelf);
  const rivalAlias = rival?.alias ?? text.formerMember;
  const mine = duel.mine ? resultOf(duel.mine, 'self') : localDuelResult(events, duel);

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
      ) : (
        <DuelPlayArea
          duel={duel}
          session={session}
          questionsLeft={questionsLeft}
          canPlay={rival !== undefined}
          note={rival ? null : text.rivalLeft}
        />
      )}
    </DuelFrame>
  );
}
