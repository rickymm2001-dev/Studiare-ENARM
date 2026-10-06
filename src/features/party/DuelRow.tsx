// Un duelo en la lista de retos de un grupo (9.6). Antes de jugar dice las reglas y deja jugar, sin
// mostrar nada del rival. Ya jugado muestra los dos resultados y quién ganó. El rival es un compañero
// simulado y su resultado va marcado como tal (D-028).
import { Swords, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import type { Challenge, Membership } from '@/data/schemas/activity';
import type { AppEvent } from '@/data/schemas/events';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { SimulatedDataLabel } from '@/ui/components/labels';
import { formatDuration } from '../simulator/practice';
import type { ReadySession } from '../shared/RequireSession';
import { duelSize, duelView, type DuelVerdict } from './duels';
import { startDuel } from './duelActions';

const verdictKey = (verdict: DuelVerdict) =>
  verdict.kind === 'draw' ? 'draw' : (`${verdict.kind}_${verdict.by}` as const);

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
  const text = t.party.duel;
  const api = useDataApi();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const size = duelSize(challenge);
  const view = rival
    ? duelView({ events, challenge, selfId: self.id, opponent: rival })
    : ({ status: 'pending' } as const);
  const canPlay = rival !== undefined && (questionsLeft === null || questionsLeft >= size);

  const play = async () => {
    setFailed(false);
    const started = await startDuel(api, session.user, challenge);
    if (started) void navigate(screenPath('question'));
    else setFailed(true);
  };

  return (
    <li className="rounded-md bg-muted p-3">
      <p className="flex flex-wrap items-center gap-2 font-medium">
        <Swords aria-hidden className="size-4" />
        {challenge.title}
        <SimulatedDataLabel />
      </p>

      {view.status === 'decided' && rival ? (
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
                { key: 'yo', who: text.you, result: view.self, simulated: false },
                { key: 'rival', who: rival.alias, result: view.rival, simulated: true },
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
                  <td className="py-1 text-right tabular-nums">
                    {formatDuration(row.result.totalMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p role="status" className="mt-2 flex items-center gap-2 font-semibold">
            {view.verdict.kind === 'win' ? (
              <Trophy aria-hidden className="size-4 text-gold" />
            ) : null}
            {text.verdicts[verdictKey(view.verdict)]}
          </p>
        </>
      ) : (
        <div className="mt-1 flex flex-col gap-2">
          <p className="text-sm text-fg-muted">{text.rules(size)}</p>
          <p className="text-sm text-fg-muted">{text.oneTry}</p>
          {rival ? <p className="text-sm">{text.rivalPlayed}</p> : null}
          {canPlay ? (
            <Button
              size="sm"
              className="self-start"
              onClick={() => {
                void play();
              }}
            >
              <Swords aria-hidden />
              {text.play}
            </Button>
          ) : rival ? (
            <div className="flex flex-col gap-2">
              <p role="status" className="text-sm font-medium">
                {text.needQuestions(size, questionsLeft ?? 0)}
              </p>
              <Button asChild size="sm" variant="secondary" className="self-start">
                <Link to={screenPath('subscription')}>{text.seePlans}</Link>
              </Button>
            </div>
          ) : null}
          {failed ? (
            <p role="alert" className="text-sm text-danger">
              {text.createFailed}
            </p>
          ) : null}
        </div>
      )}
    </li>
  );
}
