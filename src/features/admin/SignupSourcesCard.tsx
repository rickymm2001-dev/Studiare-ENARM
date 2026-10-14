// Cómo nos conocieron (B9 del plan del cambio, respuesta 22). Conteos por canal y por código de
// influencer de la respuesta opcional del registro. Nadie ve la respuesta de una persona, solo totales,
// y nada de esto va a la analítica. Solo con la cuenta de la nube.
import { useEffect, useState } from 'react';
import { loadCloud } from '@/data/cloud/client';
import {
  readSignupSourceCounts,
  type SignupSourceCounts,
  type SourcesFailure,
} from '@/data/cloud/signupSources';
import { t } from '@/i18n/es-MX';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { LoadingState } from '@/ui/states/states';

type State =
  | { status: 'loading' }
  | { status: 'failed'; reason: SourcesFailure }
  | { status: 'ready'; counts: SignupSourceCounts };

function CountTable({
  caption,
  rows,
  empty,
}: {
  caption: string;
  rows: { label: string; total: number }[];
  empty: string;
}) {
  const text = t.accounts.admin.sources;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{caption}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="py-1.5 text-left font-normal">
                  {row.label}
                </th>
                <td className="py-1.5 text-right font-semibold tabular-nums">
                  {text.people(row.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function SignupSourcesCard() {
  const text = t.accounts.admin.sources;
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let stopped = false;
    void loadCloud()
      .then((cloud) =>
        cloud ? readSignupSourceCounts(cloud) : ({ ok: false, reason: 'network' } as const),
      )
      .then((result) => {
        if (stopped) return;
        setState(
          result.ok
            ? { status: 'ready', counts: result.counts }
            : { status: 'failed', reason: result.reason },
        );
      });
    return () => {
      stopped = true;
    };
  }, []);

  return (
    <Card aria-labelledby="fuentes-titulo">
      <CardHeader>
        <CardTitle id="fuentes-titulo">{text.title}</CardTitle>
        <CardDescription>{text.description}</CardDescription>
      </CardHeader>
      {state.status === 'loading' ? <LoadingState label={text.loading} /> : null}
      {state.status === 'failed' ? (
        <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
          {text.errors[state.reason]}
        </p>
      ) : null}
      {state.status === 'ready' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <CountTable
            caption={text.channelsTitle}
            empty={text.empty}
            rows={state.counts.channels.map((row) => ({
              label: t.accounts.signup.heardFrom.channels[row.channel],
              total: row.total,
            }))}
          />
          <CountTable
            caption={text.codesTitle}
            empty={text.noCodes}
            rows={state.counts.codes.map((row) => ({ label: row.code, total: row.total }))}
          />
        </div>
      ) : null}
    </Card>
  );
}
