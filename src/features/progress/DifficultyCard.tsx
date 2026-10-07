// Exactitud según la dificultad de la pregunta (7.7, pantalla 10). Fácil, media y difícil con los
// mismos grupos del filtro de Simular. Cada grupo muestra calibrando con cuánto falta hasta tener
// respuestas suficientes.
import { t } from '@/i18n/es-MX';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { ProgressBar } from '@/ui/components/progress-bar';
import type { DifficultyRow } from './difficultyView';

export function DifficultyCard({ rows }: { rows: readonly DifficultyRow[] }) {
  return (
    <Card aria-labelledby="dificultad-titulo">
      <CardHeader className="mb-3">
        <CardTitle id="dificultad-titulo">{t.progress.difficultyTitle}</CardTitle>
        <CardDescription>{t.progress.difficultyHint}</CardDescription>
      </CardHeader>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const name = t.simulator.difficulties[row.group];
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
                  {t.progress.difficultyCalibrating(row.responsesNeeded)}
                </p>
              ) : (
                <>
                  <ProgressBar
                    value={row.correct}
                    max={row.total}
                    label={`${name}. ${t.progress.difficultyOf(row.correct, row.total)}`}
                    className="h-2"
                  />
                  <span className="text-sm text-fg-muted">
                    {t.progress.difficultyOf(row.correct, row.total)}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
