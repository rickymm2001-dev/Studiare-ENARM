// El formulario de la encuesta de los primeros días (B18 del plan del cambio, 1.3, 1.5 y 1.6 del diseño). Ocho preguntas
// en una sola pantalla, "Pregunta 3 de 8". Las siete cerradas son obligatorias y un faltante se nombra arriba, con un
// enlace a cada una, y lleva el foco a la primera. El comentario es opcional y, si parece traer un correo o un teléfono,
// se avisa y no se envía hasta quitarlo. El servidor vuelve a revisar todo (submit_survey).
//
// Accesibilidad. Cada pregunta es un fieldset con su legend, con radios y casillas nativos. Las escalas van en fila con
// el texto de los dos extremos a la vista, y todo objetivo mide 44 px. El contador del comentario cuelga de
// aria-describedby y no se anuncia letra por letra. Enter dentro del formulario no envía, solo el botón. El borrador
// vive en este dispositivo y se borra al enviar. Sin red, el botón se puede volver a pulsar.
import { Loader2, Send } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import {
  QUESTION_COUNT,
  QUESTION_IDS,
  SCALE_VALUES,
  SURVEY_COMMENT_MAX,
  SURVEY_QUESTIONS,
  answeredCount,
  cleanComment,
  commentProblem,
  completeAnswers,
  missingQuestions,
  toggleOption,
  type QuestionId,
  type SurveyDraft,
  type SurveyQuestion,
} from '@/config/surveys';
import { track } from '@/data/analytics/catalog';
import { loadCloud } from '@/data/cloud/client';
import { submitSurvey } from '@/data/cloud/survey';
import { surveyTexts } from '@/i18n/survey';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { clearDraft, readDraft, writeDraft } from './surveyState';
import { forgetSurveyStatus } from './surveyStatus';

/** Cómo terminó el formulario. La pantalla pinta lo que sigue */
export type SurveyOutcome = 'sent' | 'already' | 'closed';

type Failure = 'send' | 'invalid' | 'device' | null;

const text = surveyTexts;
const fieldId = (base: string, id: QuestionId) => `${base}-${id}`;

export function SurveyForm({
  userId,
  onDone,
}: {
  userId: string;
  onDone: (outcome: SurveyOutcome) => void;
}) {
  const base = useId();
  const [initial] = useState(() => readDraft(userId));
  const [answers, setAnswers] = useState<SurveyDraft>(initial.answers);
  const [comment, setComment] = useState(initial.comment);
  const [attempted, setAttempted] = useState(false);
  const [commentTouched, setCommentTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  const failureRef = useRef<HTMLParagraphElement>(null);

  // El borrador se guarda en este dispositivo con cada cambio. Vacío, se quita
  useEffect(() => {
    if (Object.keys(answers).length === 0 && comment === '') clearDraft(userId);
    else writeDraft(userId, { answers, comment });
  }, [userId, answers, comment]);

  const missing = missingQuestions(answers);
  const clean = cleanComment(comment);
  const problem = commentProblem(clean);
  const commentId = `${base}-comentario`;
  // El aviso del comentario sale al salir del campo o al intentar enviar, no mientras se escribe
  const showProblem = problem !== null && (commentTouched || attempted);

  const focusQuestion = (id: QuestionId) => {
    const first = document
      .getElementById(fieldId(base, id))
      ?.querySelector<HTMLElement>('input:not([disabled])');
    first?.focus();
  };

  const answer = (id: QuestionId, value: SurveyDraft[QuestionId]) => {
    setAnswers((current) => ({ ...current, [id]: value }));
    setFailure(null);
  };

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (sending) return;
    setAttempted(true);
    setFailure(null);
    const complete = completeAnswers(answers);
    if (complete === null || problem !== null) {
      const first = missing[0];
      if (first !== undefined) focusQuestion(first);
      else document.getElementById(commentId)?.focus();
      return;
    }
    setSending(true);
    const cloud = await loadCloud();
    const result = cloud
      ? await submitSurvey(cloud, complete, clean)
      : ({ ok: false, reason: 'network' } as const);
    setSending(false);
    if (result.ok) {
      clearDraft(userId);
      forgetSurveyStatus(userId);
      track('survey_completed', { answered: answeredCount(clean) });
      onDone('sent');
      return;
    }
    if (result.reason === 'already' || result.reason === 'closed') {
      clearDraft(userId);
      forgetSurveyStatus(userId);
      onDone(result.reason);
      return;
    }
    setFailure(
      result.reason === 'invalid'
        ? 'invalid'
        : result.reason === 'inactive_device' || result.reason === 'no_session'
          ? 'device'
          : 'send',
    );
    queueMicrotask(() => failureRef.current?.focus());
  };

  // Enter en un radio o en una casilla enviaría el formulario sin querer. Solo envía el botón
  const keepEnterFromSending = (event: KeyboardEvent<HTMLFormElement>) => {
    const target = event.target as HTMLElement;
    if (event.key === 'Enter' && target.tagName === 'INPUT') event.preventDefault();
  };

  const showErrors = attempted && (missing.length > 0 || problem !== null);

  return (
    <form
      noValidate
      aria-label={text.title}
      className="flex flex-col gap-6"
      onSubmit={(event) => void submit(event)}
      onKeyDown={keepEnterFromSending}
    >
      {showErrors ? (
        <div
          role="alert"
          className="rounded-md border border-danger bg-danger-soft p-3 text-sm text-danger"
        >
          {missing.length > 0 ? (
            <>
              <p className="font-semibold">{text.errors.heading(missing.length)}</p>
              <ul className="mt-1 list-disc pl-5">
                {missing.map((id) => {
                  const n = QUESTION_IDS.indexOf(id) + 1;
                  return (
                    <li key={id}>
                      <a
                        href={`#${fieldId(base, id)}`}
                        className="underline underline-offset-2"
                        onClick={(event) => {
                          event.preventDefault();
                          focusQuestion(id);
                        }}
                      >
                        {text.position(n, QUESTION_COUNT)}. {text.questions[id].label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
          {problem !== null ? (
            <p className={cn('font-semibold', missing.length > 0 && 'mt-2')}>
              <a
                href={`#${commentId}`}
                className="underline underline-offset-2"
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(commentId)?.focus();
                }}
              >
                {text.errors.commentProblem}
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      {SURVEY_QUESTIONS.map((question, index) => (
        <Question
          key={question.id}
          fieldId={fieldId(base, question.id)}
          question={question}
          number={index + 1}
          draft={answers}
          showError={attempted && missing.includes(question.id)}
          onChange={answer}
        />
      ))}

      <div className="flex flex-col gap-1">
        <label htmlFor={commentId} className="flex flex-col gap-0.5">
          <span className="eyebrow text-fg-muted">
            {text.position(QUESTION_COUNT, QUESTION_COUNT)}
          </span>
          <span className="text-base font-semibold text-fg">{text.comment.label}</span>
        </label>
        <p id={`${commentId}-ayuda`} className="text-sm text-fg-muted">
          {text.comment.hint}
        </p>
        <textarea
          id={commentId}
          value={comment}
          maxLength={SURVEY_COMMENT_MAX}
          rows={4}
          aria-invalid={showProblem ? true : undefined}
          aria-describedby={[
            `${commentId}-ayuda`,
            `${commentId}-contador`,
            showProblem ? `${commentId}-aviso` : null,
          ]
            .filter(Boolean)
            .join(' ')}
          className="min-h-24 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base leading-relaxed text-fg focus-visible:outline-2 focus-visible:outline-focus"
          onChange={(event) => {
            setComment(event.target.value);
            setFailure(null);
          }}
          onBlur={() => {
            setCommentTouched(true);
          }}
        />
        <p id={`${commentId}-contador`} className="text-sm text-fg-muted">
          {text.comment.counter(comment.length, SURVEY_COMMENT_MAX)}
        </p>
        {showProblem ? (
          <p id={`${commentId}-aviso`} className="text-sm text-danger">
            {text.comment.problems[problem]}
          </p>
        ) : null}
      </div>

      <p className="text-sm text-fg-muted">{text.draftNote}</p>

      {failure ? (
        <p
          ref={failureRef}
          tabIndex={-1}
          role="alert"
          className="rounded-md border border-danger bg-danger-soft p-3 text-sm text-danger outline-none"
        >
          {failure === 'invalid'
            ? text.states.invalid
            : failure === 'device'
              ? text.states.notActiveDevice
              : text.states.sendFailed}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="self-start" disabled={sending}>
        {sending ? (
          <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
        ) : (
          <Send aria-hidden />
        )}
        {sending ? text.actions.sending : text.actions.send}
      </Button>
    </form>
  );
}

function Question({
  fieldId: id,
  question,
  number,
  draft,
  showError,
  onChange,
}: {
  fieldId: string;
  question: SurveyQuestion;
  number: number;
  draft: SurveyDraft;
  showError: boolean;
  onChange: (id: QuestionId, value: SurveyDraft[QuestionId]) => void;
}) {
  const qtext = text.questions[question.id];
  const hint = 'hint' in qtext ? qtext.hint : undefined;
  const hintId = hint ? `${id}-ayuda` : undefined;
  const errorId = showError ? `${id}-error` : undefined;
  return (
    <fieldset
      id={id}
      aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
      className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0"
    >
      <legend className="mb-2 p-0">
        <span className="eyebrow block text-fg-muted">{text.position(number, QUESTION_COUNT)}</span>
        <span className="block text-base font-semibold text-fg">{qtext.label}</span>
      </legend>
      {hint ? (
        <p id={hintId} className="text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
      {question.kind === 'scale' ? (
        <Scale
          name={id}
          value={draft[question.id]}
          low={text.questions[question.id].low}
          high={text.questions[question.id].high}
          onPick={(value) => {
            onChange(question.id, value);
          }}
        />
      ) : question.kind === 'single' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {question.options.map((option) => (
            <Choice
              key={option}
              kind="radio"
              name={id}
              label={optionLabel(question.id, option)}
              checked={draft[question.id] === option}
              onPick={() => {
                onChange(question.id, option);
              }}
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {question.options.map((option) => {
            const current: readonly string[] = draft[question.id] ?? [];
            const checked = current.includes(option);
            return (
              <Choice
                key={option}
                kind="checkbox"
                name={id}
                label={optionLabel(question.id, option)}
                checked={checked}
                disabled={
                  !checked && option !== question.exclusive && current.length >= question.max
                }
                onPick={() => {
                  // La lista se arma con la regla de la pregunta (Nada todavía y Nada me frenó excluyen a las demás)
                  const next = toggleOption(
                    question as { options: readonly string[]; exclusive: string; max: number },
                    current,
                    option,
                  );
                  onChange(question.id, next as SurveyDraft[QuestionId]);
                }}
              />
            );
          })}
        </div>
      )}
      {showError ? (
        <p id={errorId} className="text-sm font-semibold text-danger">
          {text.errors.required}
        </p>
      ) : null}
    </fieldset>
  );
}

/** El texto de una opción de una pregunta de una o de varias respuestas */
function optionLabel(id: QuestionId, option: string): string {
  const options = text.questions[id] as { options?: Record<string, string> };
  return options.options?.[option] ?? option;
}

function Choice({
  kind,
  name,
  label,
  checked,
  disabled = false,
  onPick,
}: {
  kind: 'radio' | 'checkbox';
  name: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onPick: () => void;
}) {
  return (
    <label
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line bg-surface px-3 py-2 text-base text-fg',
        'hover:bg-muted has-[:checked]:border-indicator has-[:checked]:bg-primary-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
        disabled && 'cursor-not-allowed opacity-50 hover:bg-surface',
      )}
    >
      <input
        type={kind}
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onPick}
        className="size-5 shrink-0 accent-[var(--color-indicator)]"
      />
      <span>{label}</span>
    </label>
  );
}

function Scale({
  name,
  value,
  low,
  high,
  onPick,
}: {
  name: string;
  value: number | undefined;
  low: string;
  high: string;
  onPick: (value: (typeof SCALE_VALUES)[number]) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-5 gap-2">
        {SCALE_VALUES.map((option) => (
          <label key={option} className="relative block cursor-pointer">
            <input
              type="radio"
              name={name}
              className="peer sr-only"
              checked={value === option}
              onChange={() => {
                onPick(option);
              }}
            />
            <span
              className={cn(
                'flex min-h-11 items-center justify-center rounded-md border border-line-strong bg-surface text-lg font-semibold text-fg hover:bg-muted',
                'peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-fg',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
              )}
            >
              <span aria-hidden>{option}</span>
              <span className="sr-only">{text.scale.optionLabel(option, low, high)}</span>
            </span>
          </label>
        ))}
      </div>
      <div aria-hidden className="flex justify-between gap-4 text-sm text-fg-muted">
        <span>{low}</span>
        <span className="text-right">{high}</span>
      </div>
    </div>
  );
}
