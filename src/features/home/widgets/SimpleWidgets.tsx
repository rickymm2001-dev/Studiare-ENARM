// Widgets de racha, nivel y XP, para hoy, cuenta regresiva y meta diaria (9.1, 9.4, 9.5).
import { BookOpenCheck, Flame, Snowflake, Target, Trophy } from 'lucide-react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { ProgressBar } from '@/ui/components/progress-bar';
import { StatCell, StatPanel } from '@/ui/components/stat-panel';
import type { Snapshot } from '../snapshot';

function BigNumber({
  icon,
  value,
  caption,
}: {
  icon: React.ReactNode;
  value: string;
  caption?: string;
}) {
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <span className="text-primary [&_svg]:size-6 sm:[&_svg]:size-8" aria-hidden>
        {icon}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-xl font-bold sm:text-2xl">{value}</span>
        {caption ? <span className="text-sm text-fg-muted">{caption}</span> : null}
      </div>
    </div>
  );
}

export function StreakWidget({ snapshot }: { snapshot: Snapshot }) {
  const { streak } = snapshot;
  return (
    <div className="flex flex-col gap-2">
      <BigNumber
        icon={<Flame />}
        value={t.widgets.streak.current(streak.current)}
        caption={t.widgets.streak.best(streak.best)}
      />
      <p className="flex items-center gap-2 text-sm text-fg-muted">
        <Snowflake aria-hidden className="size-4 shrink-0" />
        {t.widgets.streak.freezes(streak.freezesAvailable)}
      </p>
      <p className="text-sm">
        {streak.todayMet ? t.widgets.streak.todayMet : t.widgets.streak.todayPending}
      </p>
    </div>
  );
}

export function LevelWidget({ snapshot }: { snapshot: Snapshot }) {
  const { level } = snapshot;
  return (
    <div className="flex flex-col gap-2">
      <BigNumber
        icon={<Trophy />}
        value={t.widgets.level.level(level.level)}
        caption={level.title}
      />
      <ProgressBar
        value={level.xpIntoLevel}
        max={level.xpForNext}
        label={t.widgets.level.progress(level.xpIntoLevel, level.xpForNext)}
      />
      <p className="text-sm text-fg-muted">
        {t.widgets.level.total(snapshot.totalXp)} · {t.widgets.level.weekly(snapshot.weeklyXp)}
      </p>
    </div>
  );
}

export function TodayWidget({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="flex flex-col gap-2">
      <BigNumber
        icon={<BookOpenCheck />}
        value={t.widgets.today.due(snapshot.dueCards)}
        caption={t.widgets.today.done(
          snapshot.todayActivity.cards,
          snapshot.todayActivity.questions,
        )}
      />
      {snapshot.errorsToday > 0 ? (
        <p className="text-sm">{t.widgets.today.errors(snapshot.errorsToday)}</p>
      ) : null}
      {snapshot.dueCards === 0 ? (
        <p className="text-sm text-fg-muted">{t.widgets.today.nothingDue}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link to={screenPath('review')}>{t.widgets.today.review}</Link>
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link to={screenPath('simulatorSetup')}>{t.widgets.today.simulate}</Link>
        </Button>
      </div>
    </div>
  );
}

export function DailyGoalWidget({ snapshot }: { snapshot: Snapshot }) {
  const { goal } = snapshot;
  const done = snapshot.todayActivity[goal.metric];
  const metric = t.widgets.goal.metricNames[goal.metric];
  return (
    <div className="flex flex-col gap-2">
      <BigNumber
        icon={<Target />}
        value={t.widgets.goal.ratio(Math.min(done, goal.value), goal.value)}
        caption={done >= goal.value ? t.widgets.goal.met : metric}
      />
      <ProgressBar
        value={Math.min(done, goal.value)}
        max={goal.value}
        label={t.widgets.goal.progress(done, goal.value, metric)}
      />
    </div>
  );
}

export type SummaryPart = 'streak' | 'daily_goal' | 'level_xp';

/**
 * Racha, meta y nivel en una sola tarjeta oscura con tres cifras, en el orden del tablero (D-091).
 * Solo se ve fuera del modo de edición, donde cada widget conserva su tarjeta para moverlo o quitarlo
 */
export function SummaryWidget({
  snapshot,
  parts,
  className,
}: {
  snapshot: Snapshot;
  parts: readonly SummaryPart[];
  className?: string;
}) {
  const { streak, goal, level } = snapshot;
  const done = Math.min(snapshot.todayActivity[goal.metric], goal.value);
  const metric = t.widgets.goal.metricNames[goal.metric];
  const text = t.widgets.summary;
  const cells: Record<SummaryPart, React.ReactNode> = {
    streak: (
      <StatCell
        icon={<Flame />}
        label={text.streak}
        value={t.widgets.streak.current(streak.current)}
        caption={
          <>
            {text.best(streak.best)}
            {streak.freezesAvailable > 0 ? (
              <span className="ml-1 inline-flex items-center gap-0.5">
                <Snowflake aria-hidden className="size-3" />
                <span aria-hidden>{streak.freezesAvailable}</span>
                <span className="sr-only">{t.widgets.streak.freezes(streak.freezesAvailable)}</span>
              </span>
            ) : null}
          </>
        }
      />
    ),
    daily_goal: (
      <StatCell
        icon={<Target />}
        label={text.goal}
        value={`${done}/${goal.value}`}
        srLabel={t.widgets.goal.progress(done, goal.value, metric)}
        caption={done >= goal.value ? t.widgets.goal.met : metric}
      >
        <ProgressBar
          className="h-1.5"
          tone="light"
          onDark
          value={done}
          max={goal.value}
          label={t.widgets.goal.progress(done, goal.value, metric)}
        />
      </StatCell>
    ),
    level_xp: (
      <StatCell
        icon={<Trophy />}
        label={text.level}
        value={t.widgets.level.level(level.level)}
        caption={level.title}
      >
        <ProgressBar
          className="h-1.5"
          tone="gold"
          onDark
          value={level.xpIntoLevel}
          max={level.xpForNext}
          label={t.widgets.level.progress(level.xpIntoLevel, level.xpForNext)}
        />
      </StatCell>
    ),
  };
  return (
    <StatPanel label={text.label} className={className}>
      {parts.map((part) => (
        <div key={part} className="min-w-0">
          {cells[part]}
        </div>
      ))}
    </StatPanel>
  );
}
