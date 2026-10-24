// Arriba a la derecha de la barra pizarra, siempre a la vista (D-150). La racha en una píldora con su
// flama, el nivel con su XP en otra píldora que abre la escalera de niveles, y el chip del alumno con
// su foto, su alias y la flecha, que lleva a Configuración, donde vive el Perfil (D-062, B3 del plan
// del cambio). La racha lleva su número y el ícono además del color, y el nivel su texto. En modo
// enfoque (respuesta 82, B7) solo queda el chip del alumno, sin racha, nivel, XP ni la escalera.
import { ChevronDown, Flame, Star } from 'lucide-react';
import { Link } from 'react-router';
import type { User, UserSettings } from '@/data/schemas/people';
import { buildSnapshot } from '@/features/home/snapshot';
import { useAccount } from '@/features/shared/useAccount';
import { useUserEvents } from '@/features/shared/useUserEvents';
import { t } from '@/i18n/core';
import { Avatar } from '@/ui/components/avatar';
import { useFocusMode } from '../focusMode';
import { screenPath } from '../screens';
import { LevelLadderDialog } from './LevelLadderDialog';
import { useSession } from '../session';

/** Píldora clara sobre la pizarra */
const pill =
  'flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-white/12 px-3 text-sm font-semibold whitespace-nowrap text-slate-fg';

export function HeaderStats() {
  const session = useSession();
  const focus = useFocusMode();
  if (session.status !== 'ready') return null;
  if (focus) return <ProfileChip user={session.user} />;
  return <Stats user={session.user} settings={session.settings} />;
}

/** El chip del alumno, que lleva a Configuración. Es lo único que queda en modo enfoque */
function ProfileChip({ user }: { user: User }) {
  const account = useAccount(user.id);
  return (
    <Link
      to={screenPath('settings')}
      aria-label={t.headerStats.profile}
      className="flex min-h-10 shrink-0 items-center gap-2 rounded-full bg-white/12 py-1 pr-2.5 pl-1 text-slate-fg hover:bg-white/20"
    >
      <Avatar name={user.alias} avatar={account?.avatar} className="size-8" />
      <span aria-hidden className="hidden max-w-28 truncate text-sm font-bold sm:block">
        {user.alias}
      </span>
      <ChevronDown aria-hidden className="size-4 shrink-0" />
    </Link>
  );
}

function Stats({ user, settings }: { user: User; settings: UserSettings }) {
  const events = useUserEvents(user.id);
  if (events === undefined) return null;
  const { streak, level, totalXp } = buildSnapshot({ events, user, settings, now: new Date() });
  return (
    <div className="flex items-center gap-2">
      <span
        className={pill}
        aria-label={t.headerStats.streak(streak.current)}
        title={t.headerStats.streak(streak.current)}
      >
        <Flame aria-hidden className="size-4 text-slate-accent" />
        {streak.current}
      </span>
      <LevelLadderDialog totalXp={totalXp}>
        <button
          type="button"
          className={`${pill} hidden hover:bg-white/20 sm:flex`}
          aria-label={`${t.headerStats.openLevels}. ${t.headerStats.level(
            level.level,
            level.title,
            level.xpIntoLevel,
            level.xpForNext,
          )}`}
          title={t.headerStats.level(level.level, level.title, level.xpIntoLevel, level.xpForNext)}
        >
          <Star aria-hidden className="size-4 text-slate-accent" />
          <span aria-hidden>{t.headerStats.chip(level.level, totalXp)}</span>
        </button>
      </LevelLadderDialog>
      <ProfileChip user={user} />
    </div>
  );
}
