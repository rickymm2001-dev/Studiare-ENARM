// Sección Correos y alertas de Plataforma (pantalla 25, 3.1 y 2.4 del plan de B15). El interruptor de envío
// de todos los correos con la pausa por tipo, el interruptor de los eventos de dinero de la analítica, los
// conteos de correos de los últimos 7 días por tipo y estado, sin destinatarios, y el botón Mandar error de
// prueba para comprobar que las alertas de Sentry llegan. Los interruptores y los conteos viven en el
// servidor y solo se leen y cambian con la cuenta de la nube conectada como admin con su segundo factor.
// Todo nace apagado y se prende cuando Ricardo pone las llaves (docs/PENDIENTES_DE_RICARDO.md).
import { useState } from 'react';
import { useCloud } from '@/app/cloudState';
import {
  readAnalyticsSwitch,
  readEmailDelivery,
  readEmailOverview,
  saveAnalyticsSwitch,
  saveEmailDelivery,
  sendServerAlertTest,
  type ServerAlertResult,
} from '@/data/cloud/adminEngagement';
import type { EmailDelivery, EmailOverview } from '@/data/cloud/engagementContracts';
import { EditorialError } from '@/data/editorial/editorialRepo';
import { adminEngagementText as text } from '@/i18n/adminEngagement';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CheckboxField } from '@/ui/components/field';
import { ErrorState, LoadingState } from '@/ui/states/states';
import { askSecondFactor } from '../physician/secondFactor';
import { bankCodeText } from './bankErrors';
import { requireCloud, useBankAdminQuery } from './useBankAdminQuery';

/** Lo que manda el error de prueba del navegador. Lo da el destino de errores a Sentry (B15, paquete B) */
export type BrowserAlertTest = () => Promise<'sent' | 'blocked'>;

interface Loaded {
  delivery: EmailDelivery;
  analytics: boolean;
  overview: EmailOverview;
}

export function EngagementSettings({ sendBrowserTest }: { sendBrowserTest?: BrowserAlertTest }) {
  const linked = useCloud((store) => store.state.status === 'linked');
  return (
    <Card aria-labelledby="correos-alertas-titulo" className="flex flex-col gap-4">
      <CardHeader>
        <CardTitle id="correos-alertas-titulo">{text.title}</CardTitle>
        <CardDescription>{text.description}</CardDescription>
      </CardHeader>
      {linked ? (
        <EngagementFields sendBrowserTest={sendBrowserTest} />
      ) : (
        <p className="text-sm text-fg-muted">{text.needsCloud}</p>
      )}
    </Card>
  );
}

function EngagementFields({ sendBrowserTest }: { sendBrowserTest: BrowserAlertTest | undefined }) {
  const { state, reload } = useBankAdminQuery<Loaded>(async (cloud, onForbidden) => {
    const [delivery, analytics, overview] = await Promise.all([
      readEmailDelivery(cloud),
      readAnalyticsSwitch(cloud),
      readEmailOverview(cloud, onForbidden),
    ]);
    // Un interruptor que no se pudo leer no se muestra apagado, que sería decir algo que no se sabe
    if (delivery === null || analytics === null) throw new EditorialError('network');
    return { delivery, analytics: analytics.enabled, overview };
  }, 'engagement-settings');
  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'failed') {
    return <ErrorState description={bankCodeText(state.code)} onRetry={reload} />;
  }
  return <Panel loaded={state.value} reload={reload} sendBrowserTest={sendBrowserTest} />;
}

function Panel({
  loaded,
  reload,
  sendBrowserTest,
}: {
  loaded: Loaded;
  reload: () => void;
  sendBrowserTest: BrowserAlertTest | undefined;
}) {
  const { delivery, analytics, overview } = loaded;
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<'saved' | 'failed' | null>(null);

  /** Guarda en el servidor y vuelve a leer. Si no se pudo, puede faltar el código del segundo factor */
  const commit = async (
    write: (cloud: Awaited<ReturnType<typeof requireCloud>>) => Promise<boolean>,
  ) => {
    setBusy(true);
    setSaved(null);
    try {
      const ok = await write(await requireCloud());
      if (!ok) askSecondFactor();
      setSaved(ok ? 'saved' : 'failed');
      if (ok) reload();
    } catch {
      setSaved('failed');
    } finally {
      setBusy(false);
    }
  };

  const setEnabled = (enabled: boolean) =>
    commit((cloud) => saveEmailDelivery(cloud, { ...delivery, enabled }));
  const setPaused = (kind: string, paused: boolean) =>
    commit((cloud) =>
      saveEmailDelivery(cloud, {
        ...delivery,
        paused: paused
          ? [...delivery.paused, kind]
          : delivery.paused.filter((item) => item !== kind),
      }),
    );

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="correos-envio-titulo" className="flex flex-col gap-3">
        <h3 id="correos-envio-titulo" className="font-semibold">
          {text.delivery.title}
        </h3>
        <CheckboxField
          label={text.delivery.switchLabel}
          hint={text.delivery.switchHint}
          checked={delivery.enabled}
          disabled={busy}
          onChange={(event) => {
            void setEnabled(event.target.checked);
          }}
        />
        <p className="text-sm text-fg-muted">{text.counts.caption(overview.days)}</p>
        <ul className="flex flex-col gap-2">
          {overview.kinds.map((row) => {
            const label = text.kinds[row.kind] ?? row.kind;
            const paused = delivery.paused.includes(row.kind);
            return (
              <li
                key={row.kind}
                className="flex flex-col gap-2 rounded-md border border-line p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {label}
                    {paused ? <Badge variant="warning">{text.delivery.paused}</Badge> : null}
                  </p>
                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-fg-muted">
                    {(['queued', 'sent', 'skipped', 'failed'] as const).map((status) => (
                      <div key={status} className="flex gap-1">
                        <dt>{text.counts[status]}</dt>
                        <dd className="font-medium text-fg">{row[status]}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  aria-label={paused ? text.resumeLabel(label) : text.pauseLabel(label)}
                  onClick={() => {
                    void setPaused(row.kind, !paused);
                  }}
                >
                  {paused ? text.resume : text.pause}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="correos-analitica-titulo" className="flex flex-col gap-3">
        <h3 id="correos-analitica-titulo" className="font-semibold">
          {text.analytics.title}
        </h3>
        <CheckboxField
          label={text.analytics.switchLabel}
          hint={text.analytics.switchHint}
          checked={analytics}
          disabled={busy}
          onChange={(event) => {
            // El valor se lee ahora, porque cuando termine de guardar la casilla ya volvió a la de la base
            const enabled = event.target.checked;
            void commit((cloud) => saveAnalyticsSwitch(cloud, { enabled }));
          }}
        />
      </section>

      <p role="status" aria-live="polite" className="text-sm text-fg-muted">
        {saved === 'saved' ? text.saved : saved === 'failed' ? text.saveFailed : ''}
      </p>

      <AlertTest sendBrowserTest={sendBrowserTest} />
    </div>
  );
}

/** El botón del error de prueba y lo que respondió cada lado */
function AlertTest({ sendBrowserTest }: { sendBrowserTest: BrowserAlertTest | undefined }) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{
    browser: 'sent' | 'blocked' | 'unavailable';
    server: ServerAlertResult;
  } | null>(null);

  const send = async () => {
    setBusy(true);
    setResults(null);
    try {
      let browser: 'sent' | 'blocked' | 'unavailable' = 'unavailable';
      if (sendBrowserTest) {
        try {
          browser = await sendBrowserTest();
        } catch {
          browser = 'blocked';
        }
      }
      let server: ServerAlertResult;
      try {
        server = await sendServerAlertTest(await requireCloud());
      } catch {
        server = 'failed';
      }
      if (server === 'forbidden') askSecondFactor();
      setResults({ browser, server });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="correos-alertas-prueba-titulo" className="flex flex-col gap-3">
      <h3 id="correos-alertas-prueba-titulo" className="font-semibold">
        {text.alerts.title}
      </h3>
      <p className="text-sm text-fg-muted">{text.alerts.hint}</p>
      <div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            void send();
          }}
        >
          {busy ? text.alerts.sending : text.alerts.button}
        </Button>
      </div>
      <div role="status" aria-live="polite" className="text-sm text-fg-muted">
        {results ? (
          <ul className="flex flex-col gap-1">
            <li>{text.alerts.browser[results.browser]}</li>
            <li>{text.alerts.server[results.server]}</li>
          </ul>
        ) : null}
      </div>
    </section>
  );
}
