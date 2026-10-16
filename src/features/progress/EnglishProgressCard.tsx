// Tarjeta de Inglés médico en Progreso (B13, 2.7 del plan de B13), aparte de las ramas. Da el porcentaje de
// aciertos con su intervalo, el ritmo contra el tiempo sugerido y cuántos textos lleva. Mientras el
// alumno no tiene las respuestas que pide el umbral de inglés (20 de fábrica) dice calibrando, cuánto
// lleva y cuánto falta, y no muestra ninguna cifra. La comparación con otros alumnos y la dificultad
// calibrada son de B14. Sin textos publicados no pide reactivos ni manda a practicar, porque no hay nada que
// practicar. Dice que todavía no hay textos de lectura.
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { englishText } from '@/i18n/english';
import type { EnglishSummary } from '@/engines/englishSection';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { CalibratingNote } from '@/ui/states/states';

const percent = (value: number) => Math.round(value * 100);

/** El ritmo contra lo sugerido, dicho con palabras. Dentro de 5 segundos es justo en lo sugerido */
function paceVerdict(median: number, suggested: number): string {
  const copy = englishText.progress;
  const diff = Math.round(median - suggested);
  if (Math.abs(diff) <= 5) return copy.paceOn;
  return diff > 0 ? copy.paceAbove(diff) : copy.paceBelow(-diff);
}

export function EnglishProgressCard({
  summary,
  texts,
  practiceAvailable,
}: {
  summary: EnglishSummary;
  /** Textos distintos en los que ha contestado */
  texts: number;
  /** Hay casos de lectura publicados que practicar. Sin ellos no se pide contestar ni se manda a Simular */
  practiceAvailable: boolean;
}) {
  const copy = englishText.progress;
  const practice = practiceAvailable ? (
    <Button asChild variant="secondary" size="sm" className="self-start">
      <Link to={screenPath('simulatorSetup')}>{copy.goPractice}</Link>
    </Button>
  ) : null;
  return (
    <Card aria-labelledby="ingles-progreso">
      <CardHeader className="mb-3">
        <CardTitle id="ingles-progreso">{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      {summary.calibrating || summary.accuracy === null ? (
        <div className="flex flex-col gap-2">
          <CalibratingNote
            current={summary.answered}
            target={summary.minAnswers}
            unit={englishText.itemsUnit}
          />
          <p className="text-sm text-fg-muted">
            {practiceAvailable
              ? copy.calibrating(summary.minAnswers, summary.answered)
              : copy.noTexts}
          </p>
          {texts > 0 ? <p className="text-sm text-fg-muted">{copy.texts(texts)}</p> : null}
          {practice}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <dl
            aria-label={copy.statsLabel}
            className="grid grid-cols-1 gap-3 rounded-lg border border-line p-3 sm:grid-cols-3"
          >
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium text-fg-muted">{copy.accuracyLabel}</dt>
              <dd className="text-xl font-bold tabular-nums">
                {copy.accuracy(
                  percent(summary.accuracy.mean),
                  percent(summary.accuracy.low),
                  percent(summary.accuracy.high),
                )}
              </dd>
              <dd className="text-xs text-fg-muted">
                {copy.accuracyCaption(summary.correct, summary.answered)}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium text-fg-muted">{copy.paceLabel}</dt>
              {summary.medianSecondsPerItem === null ? (
                <dd className="text-xl font-bold">—</dd>
              ) : (
                <>
                  <dd className="text-xl font-bold tabular-nums">
                    {copy.pace(summary.medianSecondsPerItem)}
                  </dd>
                  <dd className="text-xs text-fg-muted">
                    {copy.paceCaption(summary.suggestedSeconds)} ·{' '}
                    {paceVerdict(summary.medianSecondsPerItem, summary.suggestedSeconds)}
                  </dd>
                </>
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium text-fg-muted">{copy.textsLabel}</dt>
              <dd className="text-xl font-bold tabular-nums">{texts.toLocaleString('es-MX')}</dd>
              <dd className="text-xs text-fg-muted">{copy.textsCaption}</dd>
            </div>
          </dl>
          <p className="text-xs text-fg-muted">{copy.intervalNote}</p>
          {practice}
        </div>
      )}
    </Card>
  );
}
