// Un duelo de Party (9.6). Antes de jugar dice las reglas y deja jugar, sin mostrar nada del rival. Ya
// jugado muestra los dos resultados y quién ganó. Aquí vive el duelo de la demostración, con un rival
// simulado marcado como tal (D-028), y las piezas que comparte con el duelo de la nube (CloudDuelRow).
import { Swords, Trophy } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import type { Challenge, Membership } from '@/data/schemas/activity';
import type { AppEvent } from '@/data/schemas/events';
import type { DuelResult } from '@/engines/party';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { SimulatedDataLabel } from '@/ui/components/labels';
import { formatDuration } from '../simulator/practice';
import type { ReadySession } from '../shared/RequireSession';
import { duelView, verdictFor, type DuelVerdict } from './duels';
import { startDuel, type DuelToPlay } from './duelActions';

const text = t.party.duel;

const verdictKey = (verdict: DuelVerdict) =>
  verdict.kind === 'draw' ? 'draw' : (`${verdict.kind}_${verdict.by}` as const);

/** El renglón de un duelo con su título, para la demostración y para la nube */
export function DuelFrame({
  title,
  simulated,
  children,
}: {
  title: string;
  simulated: boolean;
  children: ReactNode;
}) {
  return (
    <li className="rounded-md bg-muted p-3">
      <p className="flex flex-wrap items-center gap-2 font-medium">
        <Swords aria-hidden className="size-4" />
        {title}
        {simulated ? <SimulatedDataLabel /> : null}
      </p>
      {children}
    </li>
  );
}

/** Los dos resultados y quién ganó. Gana más exactitud y desempata el menor tiempo */
export function DuelScoreTable({
  self,
  rival,
  rivalAlias,
  rivalSimulated,
}: {
  self: DuelResult;
  rival: DuelResult;
  rivalAlias: string;
  rivalSimulated: boolean;
}) {
  const verdict = verdictFor(self, rival);
  return (
    <>
      <table className="mt-2 w-full text-sm">
        <caption className="sr-only">{text.result}</caption>
        <thead>
          <tr className="text-left text-fg-muted">
            <th scope="col" className="py-1 pr-2 font-medium">
              {text.player}
            </th>
            <th scope="col" className="py-1 pr-2 text-right font-medium">
              {text.hits}
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              {text.time}
            </th>
          </tr>
        </thead>
        <tbody>
          {[
            { key: 'yo', who: text.you, result: self, simulated: false },
            { key: 'rival', who: rivalAlias, result: rival, simulated: rivalSimulated },
          ].map((row) => (
            <tr key={row.key} className="border-t border-line">
              <th scope="row" className="py-1 pr-2 text-left font-normal">
                {row.who}
                {row.simulated ? (
                  <span className="ml-1 text-xs text-fg-muted">· {t.party.simulated}</span>
                ) : null}
              </th>
              <td className="py-1 pr-2 text-right tabular-nums">
                {text.hitsOf(row.result.correct, row.result.answered)}
              </td>
              <td className="py-1 text-right tabular-nums">{formatDuration(row.result.totalMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p role="status" className="mt-2 flex items-center gap-2 font-semibold">
        {verdict.kind === 'win' ? <Trophy aria-hidden className="size-4 text-fg-muted" /> : null}
        {text.verdicts[verdictKey(verdict)]}
      </p>
    </>
  );
}

/**
 * Las reglas y el botón para jugar. Sin las preguntas que pide el duelo en el plan Gratis, en lugar
 * del botón lleva a los planes. note es una línea más sobre el rival, si hace falta
 */
export function DuelPlayArea({
  duel,
  session,
  questionsLeft,
  canPlay,
  note,
}: {
  duel: DuelToPlay;
  session: ReadySession;
  /** Preguntas que le quedan hoy según su plan. null es sin límite */
  questionsLeft: number | null;
  /** false si el duelo ya no se puede jugar, por ejemplo porque el rival salió del grupo */
  canPlay: boolean;
  note?: string | null;
}) {
  const api = useDataApi();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const size = duel.questionIds.length;
  const enough = questionsLeft === null || questionsLeft >= size;

  const play = async () => {
    setFailed(false);
    setBusy(true);
    try {
      const started = await startDuel(api, session.user, duel);
      if (started) void navigate(screenPath('question'));
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1 flex flex-col gap-2">
      <p className="text-sm text-fg-muted">{text.rules(size)}</p>
      <p className="text-sm text-fg-muted">{text.oneTry}</p>
      {note ? <p className="text-sm">{note}</p> : null}
      {!canPlay ? null : enough ? (
        <Button
          size="sm"
          className="self-start"
          disabled={busy}
          onClick={() => {
            void play();
          }}
        >
          <Swords aria-hidden />
          {text.play}
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-sm font-medium">
            {text.needQuestions(size, questionsLeft)}
          </p>
          <Button asChild size="sm" variant="secondary" className="self-start">
            <Link to={screenPath('subscription')}>{text.seePlans}</Link>
          </Button>
        </div>
      )}
      {failed ? (
        <p role="alert" className="text-sm text-danger">
          {t.partyCloud.duels.playFailed}
        </p>
      ) : null}
    </div>
  );
}

/** Un duelo de la demostración contra un compañero simulado */
export function DuelRow({
  challenge,
  rival,
  self,
  events,
  session,
  questionsLeft,
}: {
  challenge: Challenge;
  /** El compañero retado. undefined si ya salió del grupo */
  rival: Membership | undefined;
  self: Membership;
  events: readonly AppEvent[];
  session: ReadySession;
  /** Preguntas que le quedan hoy según su plan. null es sin límite */
  questionsLeft: number | null;
}) {
  const view = rival
    ? duelView({ events, challenge, selfId: self.id, opponent: rival })
    : ({ status: 'pending' } as const);

  return (
    <DuelFrame title={challenge.title} simulated>
      {view.status === 'decided' && rival ? (
        <DuelScoreTable
          self={view.self}
          rival={view.rival}
          rivalAlias={rival.alias}
          rivalSimulated
        />
      ) : (
        <DuelPlayArea
          duel={{ id: challenge.id, questionIds: challenge.questionIds ?? [] }}
          session={session}
          questionsLeft={questionsLeft}
          canPlay={rival !== undefined}
          note={rival ? text.rivalPlayed : null}
        />
      )}
    </DuelFrame>
  );
}
