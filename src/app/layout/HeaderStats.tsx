// Arriba a la derecha, siempre a la vista. Racha, nivel con su barra de XP y nombre, y la foto de
// perfil que lleva a Perfil (D-062).
import { Flame } from 'lucide-react';
import { Link } from 'react-router';
import type { User, UserSettings } from '@/data/schemas/people';
import { buildSnapshot } from '@/features/home/snapshot';
import { useUserEvents } from '@/features/shared/useUserEvents';
import { t } from '@/i18n/es-MX';
import { Avatar } from '@/ui/components/avatar';
import { screenPath } from '../screens';
import { LevelLadderDialog } from './LevelLadderDialog';
import { useSession } from '../session';

export function HeaderStats() {
  const session = useSession();
  if (session.status !== 'ready') return null;
  return <Stats user={session.user} settings={session.settings} />;
}

function Stats({ user, settings }: { user: User; settings: UserSettings }) {
  const events = useUserEvents(user.id);
  if (events === undefined) return null;
  const { streak, level, totalXp } = buildSnapshot({ events, user, settings, now: new Date() });
  const percent = level.xpForNext > 0 ? Math.round((level.xpIntoLevel / level.xpForNext) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span
        className="flex items-center gap-1 rounded-full bg-streak-soft px-2.5 py-1 text-sm font-bold text-streak"
        aria-label={t.headerStats.streak(streak.current)}
        title={t.headerStats.streak(streak.current)}
      >
        <Flame aria-hidden className="size-4" />
        {streak.current}
      </span>
      <LevelLadderDialog totalXp={totalXp}>
        <button
          type="button"
          className="flex w-28 min-w-0 flex-col gap-1 rounded-md text-left sm:w-48"
          aria-label={`${t.headerStats.openLevels}. ${t.headerStats.level(
            level.level,
            level.title,
            level.xpIntoLevel,
            level.xpForNext,
          )}`}
          title={t.headerStats.level(level.level, level.title, level.xpIntoLevel, level.xpForNext)}
        >
          <span className="flex items-baseline justify-between gap-1 text-xs leading-none font-bold">
            <span className="truncate text-accent">{level.title}</span>
            <span className="text-fg-muted">{t.headerStats.short(level.level)}</span>
          </span>
          <span aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-gold" style={{ width: `${percent}%` }} />
          </span>
          <span aria-hidden className="truncate text-[0.65rem] leading-none text-fg-muted">
            {t.headerStats.left(level.xpForNext - level.xpIntoLevel, level.level + 1)}
          </span>
        </button>
      </LevelLadderDialog>
      <Link to={screenPath('profile')} aria-label={t.headerStats.profile} className="rounded-full">
        <Avatar name={user.alias} seed={user.id} />
      </Link>
    </div>
  );
}
