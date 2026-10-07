// Tarjeta del examen completo en Simular (pantalla 7). Elegir cuántas preguntas, ver el tiempo total
// y empezar, o seguir con un examen en curso y ver el último. El plan Gratis se limita a las
// preguntas que le quedan hoy y el examen de 280 es de los planes de pago. Son banderas de acceso,
// la interfaz no pregunta por el plan.
import { Play } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { screenPath } from '@/app/screens';
import { PLANS, type PlanKey } from '@/config/billing';
import { useDataApi } from '@/data/context';
import type { Question } from '@/data/schemas/bank';
import { examTotalMs } from '@/engines/exam';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { CheckboxField, SelectField } from '@/ui/components/field';
import { DemoContentLabel } from '@/ui/components/labels';
import type { ReadySession } from '../shared/RequireSession';
import { clock } from '../simulator/practice';
import { startExam } from './examSession';
import { allowedExamSizes, defaultExamSize } from './examSizes';
import {
  answeredCount,
  finishExamState,
  isClosed,
  isFinished,
  remainingMs,
  type ExamState,
} from './examState';
import { loadExamState, saveExamState } from './examStorage';

export function ExamSetupCard({
  session,
  questions,
  plan,
  left,
}: {
  session: ReadySession;
  questions: readonly Question[];
  plan: PlanKey;
  /** Preguntas que le quedan hoy en su plan. null es sin límite */
  left: number | null;
}) {
  const api = useDataApi();
  const navigate = useNavigate();
  const { user, settings } = session;
  const access = PLANS[plan].access;
  // El examen guardado se lee una vez al entrar y se actualiza con lo que se haga aquí
  const [stored, setStored] = useState<ExamState | null>(() => loadExamState(user.id));
  const [size, setSize] = useState<number>(() => defaultExamSize(access.fullExam, left));
  const [highlight, setHighlight] = useState(settings.negationHighlightExam);
  const [askConfidence, setAskConfidence] = useState(false);
  const [alerts, setAlerts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const text = t.exam;

  const header = (
    <CardHeader className="mb-3">
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle id="examen-titulo">{text.cardTitle}</CardTitle>
        <DemoContentLabel />
      </div>
    </CardHeader>
  );

  if (stored && !isFinished(stored)) {
    const remaining = remainingMs(stored, clock());
    const total = stored.questionIds.length;
    const timeIsUp = remaining <= 0;
    return (
      <Card aria-labelledby="examen-titulo">
        {header}
        <p className="font-medium">{text.inProgressTitle}</p>
        <p className="mb-3 text-sm text-fg-muted">
          {text.inProgressBody(answeredCount(stored), total, remaining)}
        </p>
        <div className="flex flex-wrap gap-2">
          {timeIsUp ? null : (
            <Button asChild>
              <Link to={screenPath('exam')}>
                <Play aria-hidden />
                {text.resume}
              </Link>
            </Button>
          )}
          <Button
            variant={timeIsUp ? 'primary' : 'secondary'}
            onClick={() => {
              const closed = finishExamState(stored, clock(), timeIsUp ? 'time_up' : 'abandoned');
              saveExamState(closed);
              setStored(closed);
              void navigate(screenPath('examResults'));
            }}
          >
            {text.finishNow}
          </Button>
        </div>
      </Card>
    );
  }

  // Un examen que terminó y todavía no se registra no se pisa con otro. Los resultados lo retoman
  if (stored && !isClosed(stored)) {
    return (
      <Card aria-labelledby="examen-titulo">
        {header}
        <p className="font-medium">{text.unsavedTitle}</p>
        <p className="mb-3 text-sm text-fg-muted">{text.unsavedBody}</p>
        <Button asChild className="self-start">
          <Link to={screenPath('examResults')}>{text.saveAndSee}</Link>
        </Button>
      </Card>
    );
  }

  const sizes = allowedExamSizes(access.fullExam);
  const requested = Math.min(size, left ?? Number.POSITIVE_INFINITY);
  const count = Math.min(requested, questions.length);
  const limitedByPlan = left !== null && left < Math.min(size, questions.length);

  const start = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const state = await startExam({
        api,
        user,
        questions,
        requested,
        options: { highlight, askConfidence, alerts },
      });
      if (state) void navigate(screenPath('exam'));
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card aria-labelledby="examen-titulo">
      {header}
      <CardDescription className="mb-3">{text.cardIntro}</CardDescription>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <SelectField
            label={text.size}
            value={String(Math.min(size, sizes.at(-1) ?? size))}
            options={sizes.map((option) => ({
              value: String(option),
              label: text.sizeOption(option),
            }))}
            onChange={(event) => {
              setSize(Number(event.target.value));
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {left === 0 ? (
            <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
              <Link to={screenPath('subscription')}>{t.simulator.seePlans}</Link>
            </Button>
          ) : (
            <Button
              size="lg"
              className="w-full sm:w-auto"
              disabled={count === 0 || busy}
              onClick={() => {
                void start();
              }}
            >
              <Play aria-hidden />
              {busy ? text.starting : text.start}
            </Button>
          )}
          <p className="text-sm text-fg-muted">
            {count > 0 ? text.timeTotal(examTotalMs(count)) : t.simulator.noQuestions}
          </p>
        </div>
        {failed ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {text.startError}
          </p>
        ) : null}
        {size > questions.length && questions.length > 0 ? (
          <p className="text-sm text-fg-muted">{text.shortfall(size, questions.length)}</p>
        ) : null}
        {limitedByPlan ? <p className="text-sm text-fg-muted">{text.limitedTo(left)}</p> : null}
        {access.fullExam ? null : <p className="text-sm text-fg-muted">{text.fullLocked}</p>}
        <Disclosure title={text.settings} summary={text.settingsSummary}>
          <CheckboxField
            label={text.highlight}
            checked={highlight}
            onChange={(event) => {
              setHighlight(event.target.checked);
            }}
          />
          <CheckboxField
            label={text.askConfidence}
            hint={text.askConfidenceHint}
            checked={askConfidence}
            onChange={(event) => {
              setAskConfidence(event.target.checked);
            }}
          />
          <CheckboxField
            label={text.alerts}
            hint={text.alertsHint}
            checked={alerts}
            onChange={(event) => {
              setAlerts(event.target.checked);
            }}
          />
        </Disclosure>
        {stored ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted p-3">
            <div>
              <p className="font-medium">{text.lastTitle}</p>
              <p className="text-sm text-fg-muted">
                {stored.correct === null
                  ? text.lastBodyUnscored(answeredCount(stored), stored.questionIds.length)
                  : text.lastBody(stored.correct, stored.questionIds.length)}
              </p>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link to={screenPath('examResults')}>{text.seeResults}</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
