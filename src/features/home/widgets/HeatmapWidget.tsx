// Heatmap de estudio (9.3). Calendario por día con intensidad por actividad y resumen en texto para
// lectores de pantalla. Rango de 90, 180 o 365 días y métrica configurables (9.1).
import { addDays } from '@/engines/studyDay';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import type { Snapshot } from '../snapshot';

import type { HeatmapSettings } from './heatmapSettings';

const LEVELS = ['bg-muted', 'bg-primary/25', 'bg-primary/50', 'bg-primary/75', 'bg-primary'];

export function HeatmapWidget({
  snapshot,
  settings,
}: {
  snapshot: Snapshot;
  settings: HeatmapSettings;
}) {
  const days = Array.from({ length: settings.range }, (_, index) =>
    addDays(snapshot.today, index - settings.range + 1),
  );
  const values = days.map((day) => snapshot.activity[day]?.[settings.metric] ?? 0);
  const max = Math.max(1, ...values);
  const metricName = t.widgets.heatmap.metrics[settings.metric].toLowerCase();
  const active = values.filter((value) => value > 0).length;
  const total = values.reduce((sum, value) => sum + value, 0);
  // Columnas por semana que empiezan en lunes
  const firstWeekday = (new Date(`${days[0] ?? snapshot.today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const padded: (string | null)[] = [...Array.from({ length: firstWeekday }, () => null), ...days];
  const weeks: (string | null)[][] = [];
  for (let index = 0; index < padded.length; index += 7) weeks.push(padded.slice(index, index + 7));
  const levelOf = (value: number) => (value === 0 ? 0 : Math.min(4, Math.ceil((value / max) * 4)));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-fg-muted">
        {t.widgets.heatmap.summary(active, settings.range, total, metricName)}
      </p>
      <div className="overflow-x-auto" aria-hidden>
        <div className="flex gap-[3px]">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-[3px]">
              {week.map((day, dayIndex) =>
                day === null ? (
                  <span key={dayIndex} className="size-3" />
                ) : (
                  <span
                    key={day}
                    title={t.widgets.heatmap.cell(
                      day,
                      snapshot.activity[day]?.[settings.metric] ?? 0,
                      metricName,
                    )}
                    className={cn(
                      'size-3 rounded-[3px]',
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
      <div className="flex items-center gap-1 self-end text-xs text-fg-muted" aria-hidden>
        <span>{t.widgets.heatmap.less}</span>
        {LEVELS.map((level) => (
          <span key={level} className={cn('size-3 rounded-[3px]', level)} />
        ))}
        <span>{t.widgets.heatmap.more}</span>
      </div>
    </div>
  );
}
