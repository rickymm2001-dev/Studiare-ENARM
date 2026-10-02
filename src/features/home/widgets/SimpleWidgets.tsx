// Widgets de racha, nivel y XP, para hoy, cuenta regresiva y meta diaria (9.1, 9.4, 9.5).
import { BookOpenCheck, Flame, Snowflake, Target, Trophy } from 'lucide-react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { ProgressBar } from '@/ui/components/progress-bar';
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
    <div className="flex items-center gap-3">
      <span className="text-primary [&_svg]:size-8" aria-hidden>
        {icon}
      </span>
      <div className="flex flex-col">
        <span className="text-2xl font-bold">{value}</span>
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
        <Snowflake aria-hidden className="size-4" />
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
        value={t.widgets.goal.progress(Math.min(done, goal.value), goal.value, metric)}
        caption={done >= goal.value ? t.widgets.goal.met : undefined}
      />
      <ProgressBar
        value={Math.min(done, goal.value)}
        max={goal.value}
        label={t.widgets.goal.progress(done, goal.value, metric)}
      />
    </div>
  );
}
