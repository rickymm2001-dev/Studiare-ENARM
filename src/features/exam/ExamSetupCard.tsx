// El examen completo en Armar tu simulador (pantalla 7). Elegir cuántas preguntas, ver el tiempo total
// y empezar, o seguir con un examen en curso y ver el último. El plan Gratis se limita a las
// preguntas que le quedan hoy y el examen de 280 es de los planes de pago. Son banderas de acceso,
// la interfaz no pregunta por el plan.
// Desde D-150 no es una tarjeta aparte. Es lo que el formulario muestra en el modo Examen, con los mismos
// grupos del diseño, Preguntas en segmentado píldora, Tiempo con el control que le pasa la pantalla y el
// botón grande con su resumen. Sus ajustes finos van en una tarjeta debajo. La pantalla recibe con
// onPreview lo que arma, para decir en el lateral con qué entrena.
// Desde B11 el examen se reparte por los pesos de rama del ENARM (5.4). Con el banco de la nube se bajan
// todos sus cuerpos antes de empezar, en tandas, así el examen corre sin conexión. Si llega menos de lo
// armado, empieza con lo concedido y el marco de la app dice por qué.
// Desde B13 trae su parte en inglés, como el ENARM (3.1 y 3.7 del plan de B13). El de 280 son 250 en
// español y 30 en inglés, con la misma proporción en los cortos y el tiempo de cada sección. La casilla
// Incluir la parte en inglés aparece con la bandera medicalEnglish. Con menos reactivos de inglés de los
// que pide el umbral lleva la marca Calibrando y dice cuántos hay, y si no hay ninguno el examen es solo
// en español y lo avisa. El español no rellena lo que falte de inglés.
import { Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { screenPath } from '@/app/screens';
import { PLANS, type PlanKey } from '@/config/billing';
import { ENARM_FORMAT, ENGLISH_PLACEMENT } from '@/config/exam';
import { isFeatureEnabled } from '@/config/featureFlags';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { useDataApi } from '@/data/context';
import { newId } from '@/data/ids';
import { shortfallReason } from '@/data/bank/quota';
import type { PoolQuestion } from '@/data/bank/questionSource';
import { topicTaxonomy } from '@/demo/content';
import {
  buildExam,
  englishTargetFor,
  EXAM_SECONDS_PER_QUESTION,
  sectionOf,
  type ExamPlan,
  type ExamQuestion,
} from '@/engines/exam';
import { examBranchWeights } from '@/engines/topics';
import { cloudBankScreensText as bankText } from '@/i18n/cloudBankScreens';
import { t } from '@/i18n/es-MX';
import { englishText } from '@/i18n/english';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CheckboxField } from '@/ui/components/field';
import { SegmentedControl } from '@/ui/components/segmented';
import { CalibratingNote } from '@/ui/states/states';
import { useBankNotice } from '../shared/bankNotice';
import { chooseWithBodies } from '../shared/chooseWithBodies';
import { useLockedCta } from '../shared/useLockedCta';
import type { ReadySession } from '../shared/RequireSession';
import { useQuestionSource } from '../shared/useQuestionSource';
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

/** Lo que el examen armado le dice a la pantalla, para el lateral de con qué entrena */
export interface ExamPreviewInfo {
  count: number;
  branches: number;
  totalMs: number;
  alerts: boolean;
}

/** La pregunta del pool como la arma buildExam, con la sección que dice su idioma */
const toExamQuestion = (question: PoolQuestion): ExamQuestion => ({
  id: question.id,
  caseId: question.caseId,
  caseOrder: question.caseOrder,
  branch: question.branch,
  section: sectionOf(question),
});

export function ExamSetupCard({
  session,
  questions,
  englishQuestions = [],
  plan,
  left,
  timeControl,
  onPreview,
}: {
  session: ReadySession;
  /** Las preguntas en español que entran al examen */
  questions: readonly PoolQuestion[];
  /** Los reactivos de inglés que entran al examen (B13). Vacío si no hay textos */
  englishQuestions?: readonly PoolQuestion[];
  plan: PlanKey;
  /** Preguntas que le quedan hoy en su plan. null es sin límite */
  left: number | null;
  /** El segmentado de Tiempo de la pantalla, que va a la derecha de Preguntas */
  timeControl?: ReactNode;
  /** Avisa qué examen quedó armado con las opciones de ahora */
  onPreview?: (info: ExamPreviewInfo) => void;
}) {
  const api = useDataApi();
  const source = useQuestionSource();
  const showNotice = useBankNotice((state) => state.show);
  const navigate = useNavigate();
  const { user, settings } = session;
  const access = PLANS[plan].access;
  // El examen guardado se lee una vez al entrar y se actualiza con lo que se haga aquí
  const [stored, setStored] = useState<ExamState | null>(() => loadExamState(user.id));
  const [size, setSize] = useState<number>(() => defaultExamSize(access.fullExam, left));
  const [highlight, setHighlight] = useState(settings.negationHighlightExam);
  const [askConfidence, setAskConfidence] = useState(false);
  const [alerts, setAlerts] = useState(true);
  const [answerSheet, setAnswerSheet] = useState(false);
  // La parte en inglés va incluida, como en el ENARM, y el alumno la puede quitar (3.1)
  const [includeEnglish, setIncludeEnglish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // El botón del candado de Gratis, el mismo de Simular y los demás candados (B10)
  const lockedCta = useLockedCta();
  const text = t.exam;

  const requested = Math.min(size, left ?? Number.POSITIVE_INFINITY);
  const thresholds = DEFAULT_THRESHOLDS.english;
  // La casilla solo está con la bandera. Sin ningún reactivo de inglés el examen es solo en español del
  // tamaño pedido, y lo avisa. Con algunos entra a su parte aunque no alcance, y el español no la rellena
  const englishFlag = isFeatureEnabled('medicalEnglish');
  const hasEnglish = englishQuestions.length > 0;
  const withEnglish = englishFlag && includeEnglish && hasEnglish;
  const englishOptions = {
    include: withEnglish,
    secondsPerQuestion: thresholds.secondsPerItem,
    placement: ENGLISH_PLACEMENT,
  };
  const weights = examBranchWeights(topicTaxonomy);
  // Lo que traería el examen con estas opciones. Los conteos de cada sección no dependen de la semilla
  const preview = useMemo(
    () =>
      buildExam({
        questions: [...questions, ...(withEnglish ? englishQuestions : [])].map(toExamQuestion),
        requested,
        seed: 'vista',
        branchWeights: weights,
        english: englishOptions,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- weights y englishOptions salen de las demás
    [questions, englishQuestions, requested, withEnglish],
  );
  const count = preview.questionIds.length;
  // Cuántas ramas trae lo armado, para el resumen del botón. Es lo que de verdad eligió buildExam
  const branches = useMemo(() => {
    const picked = new Set(preview.questionIds);
    return new Set(
      [...questions, ...englishQuestions]
        .filter((question) => picked.has(question.id))
        .map((question) => question.branch),
    ).size;
  }, [preview, questions, englishQuestions]);
  // El tope de Gratis es lo que limita el examen cuando le quedan menos preguntas que el tamaño pedido y que
  // las que hay en el banco, contando las de inglés si entran
  const inBank = questions.length + (withEnglish ? englishQuestions.length : 0);
  const limitedByPlan = left !== null && left < Math.min(size, inBank);

  // La pantalla se entera de lo armado sin que su cambio de estado vuelva a disparar este aviso
  const previewRef = useRef(onPreview);
  previewRef.current = onPreview;
  useEffect(() => {
    previewRef.current?.({ count, branches, totalMs: preview.totalMs, alerts });
  }, [count, branches, preview.totalMs, alerts]);

  // La tarjeta de un examen guardado se nombra por su estado y no por Examen completo, que ya es el
  // nombre de la región del formulario que la contiene (D-150)
  const header = (
    <CardHeader className="mb-3">
      <CardTitle>{text.cardTitle}</CardTitle>
    </CardHeader>
  );

  if (stored && !isFinished(stored)) {
    const remaining = remainingMs(stored, clock());
    const total = stored.questionIds.length;
    const timeIsUp = remaining <= 0;
    return (
      <Card tone="cream" lift={false} aria-labelledby="examen-en-curso">
        {header}
        <p id="examen-en-curso" className="font-medium">
          {text.inProgressTitle}
        </p>
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
      <Card tone="cream" lift={false} aria-labelledby="examen-sin-guardar">
        {header}
        <p id="examen-sin-guardar" className="font-medium">
          {text.unsavedTitle}
        </p>
        <p className="mb-3 text-sm text-fg-muted">{text.unsavedBody}</p>
        <Button asChild className="self-start">
          <Link to={screenPath('examResults')}>{text.saveAndSee}</Link>
        </Button>
      </Card>
    );
  }

  const sizes = allowedExamSizes(access.fullExam);
  const minutes = Math.max(1, Math.round(preview.totalMs / 60_000));

  const start = async () => {
    setBusy(true);
    setFailed(null);
    try {
      // Primero se arma con las cuotas por rama y se bajan esos cuerpos. startExam arma de nuevo solo
      // con lo concedido, que cabe completo, y conserva cuántas faltaron de lo pedido. Sin conexión se
      // arma solo con lo ya bajado (M2)
      const seed = newId();
      const candidates = [...questions, ...(withEnglish ? englishQuestions : [])];
      // El último plan que armó choose. Sin conexión vuelve a elegir de lo ya bajado y arma otro
      const armed: { plan: ExamPlan | null } = { plan: null };
      const { ids, result, fromStored } = await chooseWithBodies({
        source,
        candidates,
        purpose: 'exam',
        choose: (from) => {
          armed.plan = buildExam({
            questions: from.map(toExamQuestion),
            requested,
            seed,
            branchWeights: weights,
            english: englishOptions,
          });
          return armed.plan.questionIds;
        },
      });
      const ready = new Set(result.ready);
      const chosen = candidates.filter((question) => ready.has(question.id));
      const reason = fromStored
        ? 'offline'
        : shortfallReason({
            denied: result.denied,
            offline: result.offline,
            missing: ids.length - chosen.length,
          });
      if (chosen.length === 0) {
        setFailed(reason ? bankText.shortfall.reasons[reason] : text.startError);
        return;
      }
      // Sin conexión se compara con lo que pidió, no con lo que alcanzó a armarse de lo bajado
      const planned = fromStored ? requested : ids.length;
      if (reason && (fromStored || chosen.length < planned)) {
        showNotice({
          reason,
          granted: chosen.length,
          requested: planned,
          retryAt: result.quota?.brake.retryAt ?? null,
        });
      }
      const state = await startExam({
        api,
        user,
        questions: chosen,
        requested,
        options: { highlight, askConfidence, alerts, answerSheet },
        english: englishOptions,
        ...(armed.plan ? { plan: armed.plan } : {}),
      });
      if (state) void navigate(screenPath('exam'));
      else setFailed(text.startError);
    } catch {
      setFailed(text.startError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <p className="group-title mb-3">{text.size}</p>
          <SegmentedControl
            label={text.size}
            options={sizes.map((option) => ({ value: option, label: text.sizeOption(option) }))}
            value={Math.min(size, sizes.at(-1) ?? size)}
            onChange={setSize}
            className="flex w-full"
            itemClassName="flex-1"
          />
          {limitedByPlan ? <p className="text-sm text-fg-muted">{text.limitedTo(left)}</p> : null}
          {access.fullExam ? null : <p className="text-sm text-fg-muted">{text.fullLocked}</p>}
          {preview.sections.clinical.shortfall > 0 && count > 0 ? (
            <p className="text-sm text-fg-muted">{text.shortfall(size, count)}</p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <p className="group-title mb-3">{t.simulator.time.legend}</p>
          {timeControl}
          <p className="text-sm text-fg-muted">
            {count > 0 ? text.timeTotal(preview.totalMs) : t.simulator.noQuestions}
            {count > 0 && preview.sections.english.picked > 0 ? (
              <>
                {' · '}
                {englishText.exam.composition(
                  preview.sections.clinical.picked,
                  preview.sections.english.picked,
                )}
              </>
            ) : null}
          </p>
          {count > 0 ? (
            <p className="text-sm text-fg-muted">
              {t.simulator.time.enarmNote(EXAM_SECONDS_PER_QUESTION)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2">
        {left === 0 ? (
          <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
            <Link to={lockedCta.path}>{lockedCta.label}</Link>
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
        {count > 0 ? (
          <p className="text-sm text-fg-muted">{t.simulator.summary(count, branches, minutes)}</p>
        ) : null}
      </div>
      {failed ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {failed}
        </p>
      ) : null}
      {englishFlag && includeEnglish ? (
        <EnglishExamNotes
          have={englishQuestions.length}
          preview={preview}
          min={thresholds.examMinItems}
        />
      ) : null}

      {/* Lo que no está en el diseño del formulario va debajo, en su tarjeta (D-150) */}
      <Card lift={false} aria-labelledby="examen-ajustes" className="flex flex-col gap-3">
        <CardHeader className="mb-0">
          <CardTitle id="examen-ajustes" as="h3" className="text-lg">
            {text.settings}
          </CardTitle>
          <CardDescription>{text.settingsSummary}</CardDescription>
        </CardHeader>
        {englishFlag ? (
          <CheckboxField
            label={englishText.exam.include}
            hint={englishText.exam.includeHint}
            checked={includeEnglish}
            onChange={(event) => {
              setIncludeEnglish(event.target.checked);
            }}
          />
        ) : null}
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
        <CheckboxField
          label={t.answerSheet.optionLabel}
          hint={t.answerSheet.optionHint}
          checked={answerSheet}
          onChange={(event) => {
            setAnswerSheet(event.target.checked);
          }}
        />
      </Card>
      {stored ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-cream p-3">
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
    </>
  );
}

/**
 * Lo que dice la tarjeta de la parte en inglés cuando hay pocos reactivos (3.7). Con menos de los que pide el
 * umbral lleva la marca Calibrando y dice cuántos hay. Si no hay ninguno el examen es solo en español, y si
 * hay algunos pero no alcanzan para los que pide el examen dice cuántos traerá, porque el español no los
 * rellena. Si hay de sobra pero los casos no suman lo que pide el examen, por ejemplo solo casos de tres
 * preguntas para un examen de 5, también dice cuántos entran, porque un texto entra completo
 */
function EnglishExamNotes({
  have,
  preview,
  min,
}: {
  have: number;
  preview: ExamPlan;
  min: number;
}) {
  const copy = englishText.exam;
  const { picked, requested: wanted } = preview.sections.english;
  // Solo el examen de 280 pide los 30 del examen real. Los cortos piden la misma proporción (11 de 100)
  const real = wanted >= ENARM_FORMAT.english;
  // Lo que pide la proporción del tamaño del examen. En el plan, requested de la sección es lo que sobrevivió
  // al tamaño de los casos, así que aquí se vuelve a sacar
  const target = Math.min(englishTargetFor(preview.requested), preview.requested);
  return (
    <div className="flex flex-col gap-1.5">
      {have < min ? (
        <CalibratingNote current={have} target={min} unit={englishText.itemsUnit} />
      ) : null}
      {have === 0 ? (
        <p role="status" className="text-sm font-medium text-fg">
          {copy.onlySpanish}
        </p>
      ) : preview.sections.english.shortfall > 0 ? (
        <p role="status" className="text-sm text-fg-muted">
          {copy.missing(picked, wanted, real)}
        </p>
      ) : picked < target ? (
        <p role="status" className="text-sm text-fg-muted">
          {copy.fits(picked, target)}
        </p>
      ) : null}
    </div>
  );
}
