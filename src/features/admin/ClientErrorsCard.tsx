// Errores del navegador (pantalla 25, Fase G, G5, D-107). Lista los errores más recientes que mandaron
// los navegadores de alumnos con el permiso de mejora anónima, agrupados por huella y con su conteo.
// Solo se leen con la cuenta de la nube de un admin o del dueño, por el permiso por fila.
import { useEffect, useState } from 'react';
import { useCloud } from '@/app/cloudState';
import { fetchClientErrors, type ClientErrorRow } from '@/data/cloud/clientErrors';
import { loadCloud } from '@/data/cloud/client';
import { adminText } from '@/i18n/admin';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { formatDateTime } from './format';

type State =
  { status: 'loading' } | { status: 'failed' } | { status: 'ready'; rows: ClientErrorRow[] };

const KIND_BADGE = { error: 'danger', rejection: 'warning', render: 'danger' } as const;

export function ClientErrorsCard() {
  const text = adminText.clientErrors;
  const linked = useCloud((store) => store.state.status === 'linked');
  const [state, setState] = useState<State>({ status: 'loading' });
  // Cada vez que cambia, se vuelven a leer los errores
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!linked) return;
    let stopped = false;
    void loadCloud()
      .then((cloud) => (cloud ? fetchClientErrors(cloud) : null))
      .then((rows) => {
        if (!stopped) setState(rows ? { status: 'ready', rows } : { status: 'failed' });
      });
    return () => {
      stopped = true;
    };
  }, [linked, round]);

  return (
    <Card aria-labelledby="errores-navegador-titulo">
      <CardHeader>
        <CardTitle id="errores-navegador-titulo">{text.title}</CardTitle>
        <CardDescription>{text.description}</CardDescription>
      </CardHeader>
      {!linked ? (
        <p className="text-sm text-fg-muted">{text.needsCloud}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <Button
              variant="secondary"
              size="sm"
              disabled={state.status === 'loading'}
              onClick={() => {
                setState({ status: 'loading' });
                setRound((value) => value + 1);
              }}
            >
              {text.refresh}
            </Button>
          </div>
          <p role="status" className="text-sm text-fg-muted">
            {state.status === 'loading'
              ? text.loading
              : state.status === 'failed'
                ? text.failed
                : state.rows.length === 0
                  ? text.empty
                  : ''}
          </p>
          {state.status === 'ready' && state.rows.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {state.rows.map((row) => (
                <li
                  key={`${row.day}-${row.fingerprint}`}
                  className="flex flex-col gap-1 rounded-md border border-line p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={KIND_BADGE[row.kind]}>{text.kinds[row.kind]}</Badge>
                    <Badge variant="neutral">{text.times(row.occurrences)}</Badge>
                  </div>
                  <p className="break-words font-medium">{row.message}</p>
                  <p className="text-fg-muted">
                    {text.meta(row.screen, row.version, formatDateTime(row.last_seen))}
                  </p>
                  {row.stack ? (
                    <details>
                      <summary className="cursor-pointer text-fg-muted">{text.stack}</summary>
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 text-xs">
                        {row.stack}
                      </pre>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </Card>
  );
}
