// Pregunta del examen. Caso clínico, frase con negaciones resaltadas si el alumno lo pidió y opciones
// que se pueden descartar. Descartar no cambia la respuesta, solo ayuda a pensar, y queda registrado
// para medir cómo descarta (D-080). No muestra si acertó, eso llega con los resultados.
import { useEffect, useRef } from 'react';
import { structureDictionary } from '@/demo/content';
import { findNegations } from '@/engines/structure';
import { t } from '@/i18n/es-MX';
import { toneClasses } from '@/ui/branches';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { HighlightedPrompt } from '../simulator/HighlightedPrompt';
import { OptionChoice } from '../simulator/OptionChoice';
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
  position,
  focusPrompt,
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
  /** Dónde va en el examen, por ejemplo Pregunta 3 de 20. Se lee al pasar el foco al enunciado */
  position: string;
  /** Pasa el foco al enunciado al mostrarse, para que el lector de pantalla lo lea */
  focusPrompt: boolean;
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
  const promptRef = useRef<HTMLHeadingElement>(null);
  // La pregunta se monta de nuevo en cada cambio (la pantalla le pone key), así que basta al montar
  useEffect(() => {
    if (focusPrompt) promptRef.current?.focus();
  }, [focusPrompt]);

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
        <CardTitle
          id="examen-pregunta-frase"
          ref={promptRef}
          tabIndex={-1}
          className="mt-3 text-lg leading-snug focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <span className="sr-only">{position}. </span>
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
          <legend className="mb-1 text-sm text-fg-muted">{t.choice.optionsHint}</legend>
          <ul className="flex flex-col gap-2">
            {shown.map((option, position) => (
              <OptionChoice
                key={option.id}
                name="opcion-examen"
                letter={String.fromCharCode(65 + position)}
                text={option.text}
                selected={answer.optionId === option.id}
                discarded={answer.eliminated.includes(option.id)}
                onChoose={() => {
                  onChoose(option.id);
                }}
                onToggleDiscard={() => {
                  onToggleDiscard(option.id);
                }}
              />
            ))}
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
