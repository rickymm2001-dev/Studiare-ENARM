// Pregunta del examen. Caso clínico, frase con negaciones resaltadas si el alumno lo pidió y opciones
// que se pueden descartar. Descartar no cambia la respuesta, solo ayuda a pensar, y queda registrado
// para medir cómo descarta (D-080). No muestra si acertó, eso llega con los resultados.
// Desde D-150 sigue el diseño de la pregunta. Una tarjeta grande con esquinas de 24 px y sombra marina
// suave con la rama en píldora de su color, el tipo de reactivo, el caso en texto de lectura y la
// pregunta final en marino, las opciones como tarjetas píldora debajo y, si la sesión la pide, la
// confianza en segmentado píldora.
// Una pregunta de la parte en inglés (B13, 3.5) lleva el texto de lectura dentro de la tarjeta, con el
// texto, la pregunta y las opciones en inglés (lang="en") y la línea de la fuente bajo el texto. El
// resaltado de negaciones sigue apagado por omisión, como en español.
import { Flag } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { structureDictionary } from '@/demo/content';
import { findNegations } from '@/engines/structure';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Badge } from '@/ui/components/badge';
import { BranchBadge } from '@/ui/components/branch-tag';
import { Card, CardTitle } from '@/ui/components/card';
import { segmentedItem, segmentedList } from '@/ui/components/segmented-classes';
import { HighlightedPrompt } from '../simulator/HighlightedPrompt';
import { OptionChoice } from '../simulator/OptionChoice';
import { ReadingPassage } from '../simulator/ReadingPassage';
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
  sheetMode = false,
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
  /** La respuesta se llena en la hoja de respuestas. Las opciones solo se leen y se pueden descartar */
  sheetMode?: boolean;
}) {
  const { question, options, vignette } = bundle;
  const shown = shownIds.flatMap((id) => {
    const option = options.find((candidate) => candidate.id === id);
    return option ? [option] : [];
  });
  const english = question.language === 'en';
  const lang = english ? 'en' : undefined;
  const ranges = highlight
    ? findNegations(question.prompt, structureDictionary, english ? 'en' : 'es')
    : [];
  const promptRef = useRef<HTMLHeadingElement>(null);
  // La región del texto de una pregunta de lectura, que va antes del enunciado
  const passageRef = useRef<HTMLDivElement>(null);
  // La primera pregunta de un texto lleva el foco al texto y no al enunciado, que va después. Las demás, al
  // enunciado. Una pregunta de inglés sin caso es su propio texto
  const firstOfText = english && (question.caseOrder ?? 1) <= 1;
  // La pregunta se monta de nuevo en cada cambio (la pantalla le pone key), así que basta al montar
  useEffect(() => {
    if (!focusPrompt) return;
    (firstOfText ? (passageRef.current ?? promptRef.current) : promptRef.current)?.focus();
  }, [focusPrompt, firstOfText]);

  return (
    <>
      <Card
        lift={false}
        aria-labelledby="examen-pregunta-frase"
        className="flex w-full flex-col gap-4 rounded-xl p-6 shadow-navy sm:p-8"
      >
        <div className="flex flex-wrap items-center gap-2">
          {/* Rama y tema pueden ser largos, así que la etiqueta sí parte en renglones. Va en el
              color de la rama (D-128) */}
          <BranchBadge branch={question.branch} className="whitespace-normal">
            {t.branchNames[question.branch] ?? question.branch} ·{' '}
            {TOPIC_NAMES.get(question.topic) ?? question.topic}
          </BranchBadge>
          {english ? null : (
            <span className="text-sm text-fg-muted">
              {vignette ? t.exam.reactiveKind : t.exam.singleQuestion}
            </span>
          )}
          {answer.marked ? (
            <Badge variant="warning">
              <Flag aria-hidden className="size-3 fill-current" />
              {t.exam.marked}
            </Badge>
          ) : null}
        </div>
        {english ? (
          <ReadingPassage
            text={vignette}
            refs={question.gpcRefs}
            fold={(question.caseOrder ?? 1) > 1 ? 'phone' : 'never'}
            scrollable
            regionRef={passageRef}
            describedBy="examen-pregunta-lugar"
          />
        ) : vignette ? (
          <p className="text-lg leading-relaxed whitespace-pre-line text-fg">{vignette}</p>
        ) : null}
        <CardTitle
          id="examen-pregunta-frase"
          ref={promptRef}
          tabIndex={-1}
          lang={lang}
          className="text-xl leading-snug font-bold tracking-tight text-heading focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus sm:text-2xl"
        >
          <span id="examen-pregunta-lugar" className="sr-only" lang="es">
            {position}.{' '}
          </span>
          <HighlightedPrompt text={question.prompt} ranges={ranges} />
        </CardTitle>
        {nudge ? (
          <p
            role="status"
            className="rounded-md border border-warning bg-warning-soft p-3 text-sm font-medium"
          >
            {nudge}
          </p>
        ) : null}
      </Card>

      <fieldset className="flex flex-col gap-3">
        <legend className={cn('text-sm text-fg-muted', sheetMode ? 'mb-2' : 'sr-only')}>
          {sheetMode ? t.answerSheet.readOnlyNote : t.exam.optionsLegend}
        </legend>
        <ul className="flex flex-col gap-3">
          {shown.map((option, index) => (
            <OptionChoice
              key={option.id}
              name="opcion-examen"
              letter={String.fromCharCode(65 + index)}
              text={option.text}
              lang={lang}
              selected={answer.optionId === option.id}
              readOnlyChoice={sheetMode}
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
        <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <legend className="sr-only">{t.exam.confidenceOptional}</legend>
          <span aria-hidden className="text-sm text-fg-muted">
            {t.exam.confidenceOptional}
          </span>
          <div className={segmentedList}>
            {(['guessed', 'unsure', 'sure'] as const).map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={answer.confidence === level}
                disabled={answer.optionId === null}
                onClick={() => {
                  onConfidence(answer.confidence === level ? null : level);
                }}
                className={segmentedItem(
                  answer.confidence === level,
                  'min-h-9 disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {t.simulator.confidence[level]}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
    </>
  );
}
