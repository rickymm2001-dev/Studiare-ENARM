// Por qué fallas, por rama (B5, comentario 2). Lo que el alumno marcó en cada error, con el último
// motivo de cada uno, repartido por rama. Cada rama lleva la marca de su color junto al nombre
// (D-128), las barras van en el color de los indicadores y el resto en grises.
// Son sus propias marcas, así que se ven desde la primera. La lectura de su motivo principal vive en
// Conócete y calibra hasta tener suficientes, y la tarjeta dice cuánto falta.
import { INSIGHT_MINIMUMS } from '@/engines/insights';
import type { GroupMotives } from '@/engines/errorCauses';
import { t } from '@/i18n/es-MX';
import { BranchMark } from '@/ui/components/branch-tag';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { ProgressBar } from '@/ui/components/progress-bar';
import { CalibratingNote, LoadingState } from '@/ui/states/states';
import { NO_BRANCH } from './motivesView';

export function MotivesCard({ rows }: { rows: readonly GroupMotives[] | undefined }) {
  const text = t.examReview.progress;
  const total = (rows ?? []).reduce((sum, row) => sum + row.total, 0);
  return (
    <Card aria-labelledby="motivos-titulo">
      <CardHeader className="mb-3">
        <CardTitle id="motivos-titulo">{text.title}</CardTitle>
        <CardDescription>{text.hint}</CardDescription>
      </CardHeader>
      {rows === undefined ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-muted">{text.empty}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-4">
            {rows.map((row) => {
              const branch =
                row.group === NO_BRANCH ? text.noBranch : (t.branchNames[row.group] ?? row.group);
              return (
                <li key={row.group} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-x-2">
                    <span className="flex items-center gap-2 font-semibold">
                      {row.group === NO_BRANCH ? null : (
                        <BranchMark branch={row.group} className="h-5" />
                      )}
                      {branch}
                    </span>
                    <span className="text-sm text-fg-muted">{text.total(row.total)}</span>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {row.motives.map(({ motive, count }) => {
                      const name = t.review.causes[motive];
                      return (
                        <li
                          key={motive}
                          className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-2 text-sm"
                        >
                          <span className="truncate">{name}</span>
                          <ProgressBar
                            value={count}
                            max={row.total}
                            label={text.barLabel(name, count, row.total)}
                            className="h-2"
                          />
                          <span className="text-fg-muted tabular-nums">
                            {text.count(count, row.total)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
          {total < INSIGHT_MINIMUMS.causes ? (
            <div className="flex flex-col gap-1.5">
              <CalibratingNote current={total} target={INSIGHT_MINIMUMS.causes} unit={text.unit} />
              <p className="text-sm text-fg-muted">{text.calibrating}</p>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
