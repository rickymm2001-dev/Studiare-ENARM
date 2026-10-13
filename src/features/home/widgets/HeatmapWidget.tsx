// Heatmap de estudio (9.3). Calendario por día con intensidad por actividad y resumen en texto para
// lectores de pantalla. Dividido por meses con el nombre del mes arriba (D-065). Rango de 90, 180
// o 365 días y métrica configurables (9.1). En Inicio las celdas se estiran para ocupar todo el ancho
// (D-117), y en el teléfono, donde el año no cabe, se desplaza de lado. A la izquierda va la inicial
// de cada día, de lunes a domingo.
import { useEffect, useRef, type CSSProperties } from 'react';
import { addDays, daysBetween } from '@/engines/studyDay';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import type { Snapshot } from '../snapshot';

import type { HeatmapSettings } from './heatmapSettings';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const LEVELS = [
  'bg-muted',
  'bg-indicator/25',
  'bg-indicator/50',
  'bg-indicator/75',
  'bg-indicator',
];
/** Separación entre celdas, en px */
const CELL_GAP = 3;
/**
 * Ancho mínimo de un mes que se estira. Las celdas miden al menos 12 px en el teléfono, donde el
 * calendario se desplaza, y 8 px en computadora, para que el año quepa desde 1024 px
 */
const MONTH_MIN =
  'min-w-[calc(var(--weeks)*12px_+_(var(--weeks)_-_1)*3px)] lg:min-w-[calc(var(--weeks)*8px_+_(var(--weeks)_-_1)*3px)]';

export function HeatmapWidget({
  snapshot,
  settings,
  since,
  summaryAtEnd = false,
  fluid = false,
}: {
  snapshot: Snapshot;
  settings: HeatmapSettings;
  /** Día de estudio en que empezó el alumno, para el rango automático */
  since: string;
  /** El resumen en texto va abajo, junto a la escala, como en el diseño de Inicio (D-116) */
  summaryAtEnd?: boolean;
  /** Las celdas crecen hasta llenar el ancho, como en Inicio (D-117) */
  fluid?: boolean;
}) {
  // En el teléfono el año no cabe. Se abre en lo más reciente, que es lo que importa
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [snapshot.today]);
  // Rango automático. Del primer día del mes en que empezó, o de su primera actividad si es antes,
  // hasta hoy. Así el calendario crece mes con mes
  const firstActivity = Object.keys(snapshot.activity).sort()[0] ?? since;
  const start = `${(firstActivity < since ? firstActivity : since).slice(0, 7)}-01`;
  const length =
    settings.range === 'auto' ? daysBetween(start, snapshot.today) + 1 : settings.range;
  const days = Array.from({ length }, (_, index) => addDays(snapshot.today, index - length + 1));
  const values = days.map((day) => snapshot.activity[day]?.[settings.metric] ?? 0);
  const max = Math.max(1, ...values);
  const metricName = t.widgets.heatmap.metrics[settings.metric].toLowerCase();
  const active = values.filter((value) => value > 0).length;
  const total = values.reduce((sum, value) => sum + value, 0);
  // Un bloque por mes. Cada bloque tiene columnas por semana que empiezan en lunes
  const months: { key: string; label: string; weeks: (string | null)[][] }[] = [];
  for (const day of days) {
    const key = day.slice(0, 7);
    let month = months.at(-1);
    if (month?.key !== key) {
      const firstWeekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
      month = { key, label: MONTHS[Number(day.slice(5, 7)) - 1] ?? key, weeks: [[]] };
      for (let pad = 0; pad < firstWeekday; pad += 1) month.weeks[0]?.push(null);
      months.push(month);
    }
    let week = month.weeks.at(-1) as (string | null)[];
    if (week.length === 7) {
      week = [];
      month.weeks.push(week);
    }
    week.push(day);
  }
  const levelOf = (value: number) => (value === 0 ? 0 : Math.min(4, Math.ceil((value / max) * 4)));
  const cell = fluid ? 'aspect-square w-full' : 'size-3';
  const square = (day: string | null, key: string) =>
    day === null ? (
      <span key={key} className={cell} />
    ) : (
      <span
        key={day}
        title={t.widgets.heatmap.cell(
          day,
          snapshot.activity[day]?.[settings.metric] ?? 0,
          metricName,
        )}
        className={cn(
          cell,
          fluid ? 'rounded-[4px]' : 'rounded-[3px]',
          LEVELS[levelOf(snapshot.activity[day]?.[settings.metric] ?? 0)],
          day === snapshot.today && 'ring-1 ring-fg',
        )}
      />
    );

  const summary = (
    <p className="text-sm text-fg-muted">
      {t.widgets.heatmap.summary(active, length, total, metricName)}
    </p>
  );
  return (
    <div className="flex flex-col gap-2">
      {summaryAtEnd ? null : summary}
      <div ref={scroller} className="overflow-x-auto" aria-hidden>
        <div className={cn('flex gap-2', fluid && 'w-full')}>
          {/* Inicial de cada día. Se estira a la altura de los meses y reparte siete filas iguales,
              así cada letra queda frente a su fila aunque las celdas cambien de tamaño. Se queda
              pegada a la izquierda cuando el calendario se desplaza en el teléfono */}
          <div className="sticky left-0 z-10 flex shrink-0 flex-col gap-1 bg-surface pr-0.5">
            <span className="h-3" />
            <div
              className="grid grow gap-[3px]"
              style={{ gridTemplateRows: 'repeat(7, minmax(0, 1fr))' }}
            >
              {t.widgets.heatmap.weekdays.map((letter, index) => (
                <span
                  key={index}
                  className="flex items-center justify-end text-xs leading-none font-semibold text-fg-muted"
                >
                  {letter}
                </span>
              ))}
            </div>
          </div>
          {months.map((month) => {
            const weeks = month.weeks.length;
            // Cada mes crece en proporción a sus semanas, así todas las celdas miden lo mismo
            const grow: CSSProperties | undefined = fluid
              ? ({
                  flex: `${String(weeks)} 1 ${String((weeks - 1) * CELL_GAP)}px`,
                  '--weeks': weeks,
                } as CSSProperties)
              : undefined;
            return (
              <div
                key={month.key}
                className={cn('flex flex-col gap-1', fluid && MONTH_MIN)}
                style={grow}
              >
                <span className="h-3 text-xs leading-3 font-semibold tracking-wide text-fg-muted">
                  {month.label}
                </span>
                {fluid ? (
                  <div
                    className="grid grid-flow-col gap-[3px]"
                    style={{
                      gridTemplateColumns: `repeat(${String(weeks)}, minmax(0, 1fr))`,
                      gridTemplateRows: 'repeat(7, auto)',
                    }}
                  >
                    {month.weeks.flatMap((week, weekIndex) =>
                      week.map((day, dayIndex) =>
                        square(day, `${String(weekIndex)}-${String(dayIndex)}`),
                      ),
                    )}
                  </div>
                ) : (
                  <div className="flex gap-[3px]">
                    {month.weeks.map((week, weekIndex) => (
                      <div key={weekIndex} className="flex flex-col gap-[3px]">
                        {week.map((day, dayIndex) => square(day, String(dayIndex)))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {summaryAtEnd ? summary : <span />}
        <div className="flex items-center gap-1 text-xs text-fg-muted" aria-hidden>
          <span>{t.widgets.heatmap.less}</span>
          {LEVELS.map((level) => (
            <span key={level} className={cn('size-3 rounded-[3px]', level)} />
          ))}
          <span>{t.widgets.heatmap.more}</span>
        </div>
      </div>
    </div>
  );
}
