// Exactitud según el nivel cognitivo de la pregunta (V4-B5). Bajo, medio y alto con la taxonomía de
// Bloom, junto a la tarjeta de dificultad. Cada grupo calibra hasta tener respuestas suficientes. Las
// preguntas sin nivel no cuentan en ninguno, porque el nivel solo lo pone el médico y nunca se adivina.
import { t } from '@/i18n/es-MX';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { ProgressBar } from '@/ui/components/progress-bar';
import type { CognitiveRow } from '@/engines/bloom';

export function CognitiveCard({ rows }: { rows: readonly CognitiveRow[] }) {
  const text = t.cognitive;
  return (
    <Card aria-labelledby="cognitivo-titulo">
      <CardHeader className="mb-3">
        <CardTitle id="cognitivo-titulo">{text.progressTitle}</CardTitle>
        <CardDescription>{text.progressHint}</CardDescription>
      </CardHeader>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const name = text.groups[row.group];
          return (
            <li key={row.group} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="font-medium">{name}</span>
                {row.accuracy === null ? null : (
                  <span className="text-sm font-semibold tabular-nums">
                    {Math.round(row.accuracy * 100)}%
                  </span>
                )}
              </div>
              {row.accuracy === null ? (
                <p role="status" className="text-sm text-fg-muted">
                  {text.calibrating(row.responsesNeeded)}
                </p>
              ) : (
                <>
                  <ProgressBar
                    value={row.correct}
                    max={row.total}
                    label={`${name}. ${text.of(row.correct, row.total)}`}
                    className="h-2"
                  />
                  <span className="text-sm text-fg-muted">{text.of(row.correct, row.total)}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
