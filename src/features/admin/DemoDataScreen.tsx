// Datos de demostración (pantalla 24, 11.2, 11.3). El admin genera, borra y ajusta los alumnos simulados
// y regenera al alumno de la demostración. Todo ocurre en la base de demostración, que es aparte de
// Mi cuenta y nunca se mezcla con ella. Borrar y regenerar piden confirmación porque no se deshacen.
import { FlaskConical, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import {
  DEMO_COHORT_DEFAULT,
  DEMO_COHORT_MAX,
  DEMO_COHORT_MIN,
  DEMO_SEED_DEFAULT,
  DEMO_STUDENT_ALIAS,
} from '@/demo/constants';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { TextField } from '@/ui/components/field';
import { SimulatedDataLabel } from '@/ui/components/labels';
import { StatCell, StatPanel } from '@/ui/components/stat-panel';
import { EmptyState, LoadingState } from '@/ui/states/states';
import { readAdjustments, type DemoFields } from './demoAdjust';
import { formatInt } from './format';

type Phase =
  | { kind: 'idle' }
  | { kind: 'confirm'; action: 'regenerate' | 'clear' }
  | { kind: 'working'; action: 'generate' | 'regenerate' | 'clear' }
  | { kind: 'done'; action: 'generate' | 'regenerate' | 'clear'; events: number }
  | { kind: 'error' };

export function DemoDataScreen() {
  const text = t.adminDemo;
  const { repos, demo } = useDataApi();
  const counts = useLiveData(async () => {
    const [users, truths] = await Promise.all([
      repos.users.list(),
      repos.simTruth ? repos.simTruth.list() : Promise.resolve([]),
    ]);
    return {
      users: users.length,
      simulated: truths.length,
      hasDemoStudent: users.some((user) => user.alias === DEMO_STUDENT_ALIAS),
    };
  }, [repos]);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [fields, setFields] = useState<DemoFields>({
    cohortSize: String(DEMO_COHORT_DEFAULT),
    seed: DEMO_SEED_DEFAULT,
    examDate: '',
  });
  const header = <ScreenHeader title={text.title} description={t.screens.demoData.description} />;

  if (!demo) {
    return (
      <>
        {header}
        <EmptyState
          title={text.notDemo.title}
          description={text.notDemo.description}
          action={
            <Button asChild variant="secondary">
              <Link to={`${screenPath('settings')}?seccion=account`}>{text.notDemo.go}</Link>
            </Button>
          }
        />
      </>
    );
  }
  if (counts === undefined) {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }

  const { adjust, errors } = readAdjustments(fields);
  const valid = Object.keys(errors).length === 0;
  const seeded = counts.users > 0;
  const working = phase.kind === 'working';

  const run = async (
    action: 'generate' | 'regenerate' | 'clear',
    job: () => Promise<{ events: number } | undefined>,
  ) => {
    setPhase({ kind: 'working', action });
    try {
      const summary = await job();
      setPhase({ kind: 'done', action, events: summary?.events ?? 0 });
    } catch {
      setPhase({ kind: 'error' });
    }
  };
  const edit = (key: keyof DemoFields) => (event: { target: { value: string } }) => {
    setFields((current) => ({ ...current, [key]: event.target.value }));
  };

  return (
    <>
      {header}
      <StatPanel label={text.stats.label}>
        <StatCell
          icon={<FlaskConical />}
          label={text.stats.simulated}
          value={formatInt(counts.simulated)}
          caption={text.stats.simulatedCaption}
        />
        <StatCell
          icon={<Sparkles />}
          label={text.stats.demoStudent}
          value={counts.hasDemoStudent ? text.stats.yes : text.stats.no}
          caption={text.stats.demoStudentCaption}
        />
      </StatPanel>

      <Card aria-labelledby="demo-ajustes">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle id="demo-ajustes">{text.adjust.title}</CardTitle>
            <SimulatedDataLabel />
          </div>
          <CardDescription>{seeded ? text.adjust.ready : text.adjust.empty}</CardDescription>
        </CardHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextField
            label={text.fields.cohort}
            hint={text.fields.cohortHint(DEMO_COHORT_MIN, DEMO_COHORT_MAX)}
            type="number"
            inputMode="numeric"
            min={DEMO_COHORT_MIN}
            max={DEMO_COHORT_MAX}
            value={fields.cohortSize}
            error={errors.cohortSize ?? null}
            onChange={edit('cohortSize')}
          />
          <TextField
            label={text.fields.seed}
            hint={text.fields.seedHint}
            value={fields.seed}
            maxLength={40}
            error={errors.seed ?? null}
            onChange={edit('seed')}
          />
          <TextField
            label={text.fields.examDate}
            hint={text.fields.examDateHint}
            type="date"
            value={fields.examDate}
            error={errors.examDate ?? null}
            onChange={edit('examDate')}
          />
        </div>

        {phase.kind === 'confirm' ? (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-sm">
              {phase.action === 'clear' ? text.confirmClear : text.confirmRegenerate}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger"
                onClick={() => {
                  const action = phase.action;
                  void run(action, () =>
                    action === 'clear'
                      ? demo.clear().then(() => undefined)
                      : demo.regenerate(adjust),
                  );
                }}
              >
                {phase.action === 'clear' ? text.confirmClearYes : text.confirmRegenerateYes}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setPhase({ kind: 'idle' });
                }}
              >
                {text.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {seeded ? (
              <Button
                variant="secondary"
                disabled={working || !valid}
                onClick={() => {
                  setPhase({ kind: 'confirm', action: 'regenerate' });
                }}
              >
                <RefreshCw aria-hidden />
                {text.regenerate}
              </Button>
            ) : (
              <Button
                disabled={working || !valid}
                onClick={() => void run('generate', () => demo.generate(adjust))}
              >
                <Sparkles aria-hidden />
                {text.generate}
              </Button>
            )}
            {seeded ? (
              <Button
                variant="ghost"
                disabled={working}
                onClick={() => {
                  setPhase({ kind: 'confirm', action: 'clear' });
                }}
              >
                <Trash2 aria-hidden />
                {text.clear}
              </Button>
            ) : null}
          </div>
        )}

        <p className="mt-3 text-sm text-fg-muted" role="status" aria-live="polite">
          {phase.kind === 'working'
            ? text.working[phase.action]
            : phase.kind === 'done'
              ? text.done[phase.action](phase.events)
              : phase.kind === 'error'
                ? text.error
                : ''}
        </p>
      </Card>
    </>
  );
}
