// Pregunta del examen. Caso clínico, frase con negaciones resaltadas si el alumno lo pidió y opciones
// que se pueden descartar. Descartar no cambia la respuesta, solo ayuda a pensar, y queda registrado
// para medir cómo descarta (D-080). No muestra si acertó, eso llega con los resultados.
import { Ban, RotateCcw } from 'lucide-react';
import { structureDictionary } from '@/demo/content';
import { findNegations } from '@/engines/structure';
import { t } from '@/i18n/es-MX';
import { toneClasses } from '@/ui/branches';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { HighlightedPrompt } from '../simulator/HighlightedPrompt';
import type { QuestionBundle } from '../simulator/useQuestion';
import { TOPIC_NAMES } from '../shared/topics';
import type { ExamAnswerState } from './examState';

type Confidence = 'guessed' | 'unsure' | 'sure';

export function ExamQuestion({
  bundle,
  shownIds,
  answer,
  highlight,
  askConfidence,
  nudge,
  onChoose,
  onToggleDiscard,
  onConfidence,
}: {
  bundle: QuestionBundle;
  /** Opciones en el orden en que se le muestran */
  shownIds: readonly string[];
  answer: ExamAnswerState;
  highlight: boolean;
  askConfidence: boolean;
  /** Aviso de que lleva mucho en esta pregunta. null si no toca */
  nudge: string | null;
  onChoose: (optionId: string) => void;
  onToggleDiscard: (optionId: string) => void;
  onConfidence: (level: Confidence | null) => void;
}) {
  const { question, options, vignette } = bundle;
  const shown = shownIds.flatMap((id) => {
    const option = options.find((candidate) => candidate.id === id);
    return option ? [option] : [];
  });
  const ranges = highlight ? findNegations(question.prompt, structureDictionary) : [];
  const twoColumns = Boolean(vignette);

  return (
    <Card
      aria-labelledby="examen-pregunta-frase"
      className={cn(
        'w-full',
        twoColumns ? 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-6' : 'lg:max-w-reading',
      )}
    >
      <CardHeader className={twoColumns ? 'lg:sticky lg:top-4 lg:mb-0' : undefined}>
        <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
          <span
            className={`rounded-full px-2.5 py-0.5 font-semibold ${toneClasses(question.branch).chip}`}
          >
            {t.branchNames[question.branch] ?? question.branch} ·{' '}
            {TOPIC_NAMES.get(question.topic) ?? question.topic}
          </span>
          {answer.marked ? (
            <span className="rounded-full bg-warning-soft px-2.5 py-0.5 font-semibold text-warning">
              {t.exam.marked}
            </span>
          ) : null}
        </div>
        {vignette ? (
          <div className="mt-2 rounded-md bg-muted p-3">
            <p className="mb-1 text-xs font-semibold uppercase text-fg-muted">
              {t.simulator.caseLabel}
            </p>
            <p className="whitespace-pre-line">{vignette}</p>
          </div>
        ) : null}
        <CardTitle id="examen-pregunta-frase" className="mt-3 text-lg leading-snug">
          <HighlightedPrompt text={question.prompt} ranges={ranges} />
        </CardTitle>
      </CardHeader>

      <div className="flex flex-col gap-3">
        {nudge ? (
          <p
            role="status"
            className="rounded-md border border-warning bg-warning-soft p-3 text-sm font-medium"
          >
            {nudge}
          </p>
        ) : null}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm text-fg-muted">{t.exam.optionsHint}</legend>
          <ul className="flex flex-col gap-2">
            {shown.map((option, position) => {
              const letter = String.fromCharCode(65 + position);
              const selected = answer.optionId === option.id;
              const discarded = answer.eliminated.includes(option.id);
              return (
                <li
                  key={option.id}
                  className={cn(
                    'flex items-stretch rounded-md border border-line',
                    selected && 'border-primary bg-primary-soft',
                    discarded && 'bg-muted',
                  )}
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 p-3 hover:bg-muted/60">
                    <input
                      type="radio"
                      name="opcion-examen"
                      className="mt-1"
                      checked={selected}
                      onChange={() => {
                        onChoose(option.id);
                      }}
                    />
                    <span className={cn(discarded && 'text-fg-muted line-through')}>
                      <span className="mr-1 font-semibold">{letter}.</span>
                      {option.text}
                      {discarded ? (
                        <span className="sr-only"> ({t.exam.discardedLabel})</span>
                      ) : null}
                    </span>
                  </label>
                  <button
                    type="button"
                    aria-pressed={discarded}
                    aria-label={
                      discarded ? t.exam.restoreOption(letter) : t.exam.discardOption(letter)
                    }
                    title={discarded ? t.exam.restore : t.exam.discard}
                    disabled={selected}
                    onClick={() => {
                      onToggleDiscard(option.id);
                    }}
                    className={cn(
                      'flex w-11 shrink-0 items-center justify-center rounded-r-md border-l border-line text-fg-muted hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40',
                      discarded && 'text-danger',
                    )}
                  >
                    {discarded ? (
                      <RotateCcw aria-hidden className="size-4" />
                    ) : (
                      <Ban aria-hidden className="size-4" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>

        {askConfidence ? (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium">{t.exam.confidenceOptional}</legend>
            <div className="flex flex-wrap gap-2">
              {(['guessed', 'unsure', 'sure'] as const).map((level) => (
                <Button
                  key={level}
                  size="sm"
                  variant={answer.confidence === level ? 'primary' : 'secondary'}
                  aria-pressed={answer.confidence === level}
                  disabled={answer.optionId === null}
                  onClick={() => {
                    onConfidence(answer.confidence === level ? null : level);
                  }}
                >
                  {t.simulator.confidence[level]}
                </Button>
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>
    </Card>
  );
}
