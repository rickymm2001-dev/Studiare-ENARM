// Componentes de misiones para Inicio y Progreso (D-119 B3).
import { CheckCircle2, Circle } from 'lucide-react';
import type { Mission } from '@/engines/rewards';
import { t } from '@/i18n/es-MX';
import { missionTitle } from './labels';
import { cn } from '@/ui/cn';
import { ProgressBar } from '@/ui/components/progress-bar';

const text = t.rewards;

export function MissionRow({ mission }: { mission: Mission }) {
  const title = missionTitle(mission);
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-start gap-2">
        {mission.done ? (
          <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
        ) : (
          <Circle aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-muted" />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className={cn('text-sm font-medium', mission.done && 'text-fg-muted line-through')}>
            {title}
          </span>
          <span className="text-xs text-fg-muted">
            {mission.calibrating
              ? text.calibrating(mission.calibrating.have, mission.calibrating.need)
              : mission.done
                ? text.done
                : text.progress(mission.current, mission.target)}
          </span>
        </div>
      </div>
      {mission.calibrating ? null : (
        <ProgressBar
          value={mission.current}
          max={mission.target}
          label={`${title}. ${text.progress(mission.current, mission.target)}`}
          tone={mission.done ? 'neutral' : 'primary'}
        />
      )}
    </li>
  );
}

export function MissionList({ missions, label }: { missions: readonly Mission[]; label: string }) {
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {missions.map((mission) => (
        <MissionRow key={mission.key} mission={mission} />
      ))}
    </ul>
  );
}
