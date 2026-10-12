// Heatmap de estudio (9.3). Calendario por día con intensidad por actividad y resumen en texto para
// lectores de pantalla. Dividido por meses con el nombre del mes arriba (D-065). Rango de 90, 180
// o 365 días y métrica configurables (9.1).
import { useEffect, useRef } from 'react';
import { addDays, daysBetween } from '@/engines/studyDay';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import type { Snapshot } from '../snapshot';

import type { HeatmapSettings } from './heatmapSettings';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const LEVELS = ['bg-muted', 'bg-primary/25', 'bg-primary/50', 'bg-primary/75', 'bg-primary'];

export function HeatmapWidget({
  snapshot,
  settings,
  since,
  summaryAtEnd = false,
  large = false,
}: {
  snapshot: Snapshot;
  settings: HeatmapSettings;
  /** Día de estudio en que empezó el alumno, para el rango automático */
  since: string;
  /** El resumen en texto va abajo, junto a la escala, como en el diseño de Inicio (D-116) */
  summaryAtEnd?: boolean;
  /** Celdas más grandes en pantallas anchas, para que el año ocupe el ancho de Inicio */
  large?: boolean;
}) {
  // En el teléfono el año no cabe. Se abre en lo más reciente, que es lo que importa
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [snapshot.today]);
  const cell = large ? 'size-3 2xl:size-4' : 'size-3';
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

  const summary = (
    <p className="text-sm text-fg-muted">
      {t.widgets.heatmap.summary(active, length, total, metricName)}
    </p>
  );
  return (
    <div className="flex flex-col gap-2">
      {summaryAtEnd ? null : summary}
      <div ref={scroller} className="overflow-x-auto" aria-hidden>
        <div className="flex gap-2">
          {months.map((month) => (
            <div key={month.key} className="flex flex-col gap-1">
              <span className="text-[0.65rem] font-semibold tracking-wide text-fg-muted uppercase">
                {month.label}
              </span>
              <div className="flex gap-[3px]">
                {month.weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="flex flex-col gap-[3px]">
                    {week.map((day, dayIndex) =>
                      day === null ? (
                        <span key={dayIndex} className={cell} />
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
                            'rounded-[3px]',
                            LEVELS[levelOf(snapshot.activity[day]?.[settings.metric] ?? 0)],
                            day === snapshot.today && 'ring-1 ring-fg',
                          )}
                        />
                      ),
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
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
