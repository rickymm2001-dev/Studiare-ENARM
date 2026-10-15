// Tarjeta de Inglés médico en Simular (B13, 2.1 del plan de B13). Casos de lectura en inglés, como los 30
// del ENARM, aparte de la práctica en español y antes del examen completo. Dice qué es, cuántos textos hay
// y el tiempo sugerido por reactivo, y tiene tres estados. Sin textos, cuando todavía no hay un caso
// publicado. Calibrando, con la práctica abierta y cuántos reactivos hay de los que pide la parte del examen.
// Lista, con reactivos suficientes. Se elige cuántos textos (1, 3, 5 o 10) y si se dirigen las opciones a las
// trampas del alumno, igual que en español. Con el plan Gratis cada reactivo cuenta en sus preguntas del
// día y un texto se abre completo o no se abre.
import { Play } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { screenPath } from '@/app/screens';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { PoolQuestion } from '@/data/bank/questionSource';
import { useDataApi } from '@/data/context';
import type { InsightReport } from '@/engines/insights';
import { cloudBankScreensText as bankText } from '@/i18n/cloudBankScreens';
import { englishText } from '@/i18n/english';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField } from '@/ui/components/field';
import { CalibratingNote, EmptyState } from '@/ui/states/states';
import type { ReadySession } from '../shared/RequireSession';
import { useLockedCta } from '../shared/useLockedCta';
import { useQuestionSource } from '../shared/useQuestionSource';
import { targetBiasTags } from '../progress/focusItems';
import {
  ENGLISH_TEXT_COUNTS,
  englishCardState,
  englishPracticePlan,
  startEnglishPractice,
} from './englishPractice';
import { TargetedSamplingField } from './TargetedSamplingField';

export function EnglishPracticeCard({
  session,
  pool,
  left,
  reserved,
  report,
}: {
  session: ReadySession;
  /** El inglés del pool del alumno. El de práctica da los textos y el del examen, los 30 del ENARM */
  pool: { practice: PoolQuestion[]; exam: PoolQuestion[] };
  /** Preguntas que le quedan hoy en su plan. null es sin límite */
  left: number | null;
  /** Preguntas apartadas por un examen sin terminar, que ya cuentan en lo de hoy */
  reserved: number;
  /** El informe de Conócete, para dirigir las opciones a sus trampas. undefined mientras carga */
  report: InsightReport | undefined;
}) {
  const api = useDataApi();
  const navigate = useNavigate();
  const source = useQuestionSource();
  const lockedCta = useLockedCta();
  const thresholds = DEFAULT_THRESHOLDS.english;
  const copy = englishText.practice;
  const [count, setCount] = useState('3');
  const [targeted, setTargeted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  const state = englishCardState(pool, thresholds);
  const requested = Number(count);
  const plan = englishPracticePlan(pool.practice, requested, left);

  const header = (
    <CardHeader className="mb-3">
      <CardTitle id="ingles-titulo">{copy.title}</CardTitle>
      <CardDescription>{copy.intro()}</CardDescription>
    </CardHeader>
  );

  if (state.kind === 'none') {
    return (
      <Card aria-labelledby="ingles-titulo">
        {header}
        <EmptyState
          title={copy.none.title}
          description={`${copy.none.body} ${copy.none.vocabulary}`}
          action={
            <Button asChild variant="secondary" size="sm">
              <Link to={screenPath('decks')}>{copy.none.goDecks}</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  if (state.kind === 'waiting') {
    return (
      <Card aria-labelledby="ingles-titulo">
        {header}
        <CalibratingNote current={state.cases} target={state.needed} unit="textos" />
        <p className="mt-2 text-sm text-fg-muted">{copy.waiting(state.cases, state.needed)}</p>
      </Card>
    );
  }

  const start = async () => {
    const targetTags = targeted && report ? targetBiasTags(report) : [];
    const result = await startEnglishPractice({
      api,
      user: session.user,
      source,
      pool: pool.practice,
      texts: plan.texts,
      left,
      targetTags,
      secondsPerItem: thresholds.secondsPerItem,
    });
    if (result.started) void navigate(screenPath('question'));
    else setBlocked(result.message);
  };

  // El tope de Gratis. Si quedan menos preguntas que las del texto más corto, no cabe ni uno
  const noneFits = left !== null && left > 0 && plan.fitting === 0;
  return (
    <Card aria-labelledby="ingles-titulo">
      {header}
      <div className="flex flex-col gap-3">
        {state.kind === 'calibrating' ? (
          <CalibratingNote
            current={state.items}
            target={state.target}
            unit={englishText.itemsUnit}
          />
        ) : null}
        <p className="text-sm text-fg-muted">
          {copy.texts(state.cases)} · {copy.suggested(thresholds.secondsPerItem)}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField
            label={copy.countLabel}
            value={count}
            options={ENGLISH_TEXT_COUNTS.map((n) => ({
              value: String(n),
              label: copy.countOption(n),
            }))}
            onChange={(event) => {
              setCount(event.target.value);
            }}
          />
        </div>
        <TargetedSamplingField report={report} checked={targeted} onChange={setTargeted} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {left === 0 && reserved > 0 ? (
            // El límite del día lo tiene apartado un examen que todavía no termina
            <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
              <Link to={screenPath('exam')}>{copy.goToOpenExam}</Link>
            </Button>
          ) : left === 0 ? (
            <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
              <Link to={lockedCta.path}>{lockedCta.label}</Link>
            </Button>
          ) : (
            <Button
              size="lg"
              className="w-full sm:w-auto"
              disabled={plan.texts === 0 || starting}
              onClick={() => {
                setStarting(true);
                setBlocked(null);
                void start()
                  .catch(() => {
                    setBlocked(bankText.shortfall.none);
                  })
                  .finally(() => {
                    setStarting(false);
                  });
              }}
            >
              <Play aria-hidden />
              {copy.start}
            </Button>
          )}
          {left === 0 ? (
            <p className="text-sm font-semibold text-fg">
              {reserved > 0 ? copy.limitUsedByExam : copy.limitReached}
            </p>
          ) : null}
        </div>
        {noneFits && plan.smallest !== null ? (
          <p role="status" className="text-sm font-medium text-fg">
            {copy.noFit(left, plan.smallest)}
          </p>
        ) : null}
        {left !== null &&
        left > 0 &&
        plan.texts < Math.min(requested, plan.available) &&
        !noneFits ? (
          <p className="text-sm text-fg-muted">{copy.limitedTo(left, plan.texts)}</p>
        ) : null}
        {requested > plan.available && plan.available > 0 ? (
          <p className="text-sm text-fg-muted">{copy.fewer(requested, plan.available)}</p>
        ) : null}
        {blocked ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {blocked}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
