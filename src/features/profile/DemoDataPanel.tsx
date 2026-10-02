// Generar y regenerar los datos de demostración (11.2, 11.3). Solo aparece en la base demo.
// En la Fase D también vivirá en la pantalla de admin de datos de demostración (24).
import { RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SimulatedDataLabel } from '@/ui/components/labels';

type Phase =
  | { kind: 'idle' }
  | { kind: 'confirm' }
  | { kind: 'working' }
  | { kind: 'done'; events: number }
  | { kind: 'error' };

export function DemoDataPanel() {
  const { repos, demo } = useDataApi();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const profiles = useLiveData(() => repos.users.list().then((users) => users.length), [repos]);
  if (!demo) return null;

  const run = async (action: () => Promise<{ events: number }>) => {
    setPhase({ kind: 'working' });
    try {
      const summary = await action();
      setPhase({ kind: 'done', events: summary.events });
    } catch {
      setPhase({ kind: 'error' });
    }
  };
  const seeded = (profiles ?? 0) > 0;
  const working = phase.kind === 'working';

  return (
    <Card aria-labelledby="demo-datos-titulo">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle id="demo-datos-titulo">{t.demoData.title}</CardTitle>
          <SimulatedDataLabel />
        </div>
        <CardDescription>
          {profiles === undefined ? null : seeded ? t.demoData.ready(profiles) : t.demoData.empty}
        </CardDescription>
      </CardHeader>

      {phase.kind === 'confirm' ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">{t.demoData.confirmText}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => void run(demo.regenerate)}>
              {t.demoData.confirm}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setPhase({ kind: 'idle' });
              }}
            >
              {t.demoData.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {seeded ? (
            <Button
              variant="secondary"
              disabled={working}
              onClick={() => {
                setPhase({ kind: 'confirm' });
              }}
            >
              <RefreshCw aria-hidden />
              {t.demoData.regenerate}
            </Button>
          ) : (
            <Button
              disabled={working || profiles === undefined}
              onClick={() => void run(demo.generate)}
            >
              <Sparkles aria-hidden />
              {t.demoData.generate}
            </Button>
          )}
        </div>
      )}

      <p className="mt-3 text-sm text-fg-muted" role="status" aria-live="polite">
        {phase.kind === 'working'
          ? t.demoData.working
          : phase.kind === 'done'
            ? t.demoData.done(phase.events)
            : phase.kind === 'error'
              ? t.demoData.error
              : ''}
      </p>
    </Card>
  );
}
