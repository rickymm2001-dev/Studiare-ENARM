// Arriba a la derecha, siempre a la vista. Racha, nivel con su barra de XP y nombre, y la foto de
// perfil que lleva a Configuración, donde vive el Perfil (D-062, B3 del plan del cambio). En la barra
// de computadora el nivel va en una línea, con su título junto al número y la barra más larga, como
// en el diseño de Ricardo (D-117). Racha, nivel y XP van en el acento cálido de la paleta, sin
// dorado ni brillo (D-128, reemplaza a 4.7 del plan del cambio en esto). La racha lleva su número y
// el ícono además del color, y el nivel su texto. El texto chico mide 12 px (H19 de la revisión de
// B2) y el relleno de la barra es accent, que pasa 3 a 1 sobre muted. En modo enfoque (respuesta 82,
// B7) solo queda la foto, sin racha, nivel, XP ni la escalera de niveles.
import { Flame, Star } from 'lucide-react';
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

export function HeaderStats() {
  const session = useSession();
  const focus = useFocusMode();
  if (session.status !== 'ready') return null;
  if (focus) return <ProfileLink user={session.user} />;
  return <Stats user={session.user} settings={session.settings} />;
}

/** La foto de perfil, que lleva a Configuración. Es lo único que queda en modo enfoque */
function ProfileLink({ user }: { user: User }) {
  const account = useAccount(user.id);
  return (
    <Link to={screenPath('settings')} aria-label={t.headerStats.profile} className="rounded-full">
      <Avatar name={user.alias} avatar={account?.avatar} />
    </Link>
  );
}

function Stats({ user, settings }: { user: User; settings: UserSettings }) {
  const events = useUserEvents(user.id);
  if (events === undefined) return null;
  const { streak, level, totalXp } = buildSnapshot({ events, user, settings, now: new Date() });
  const percent = level.xpForNext > 0 ? Math.round((level.xpIntoLevel / level.xpForNext) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span
        className="flex items-center gap-1 rounded-md bg-streak-soft px-2.5 py-1 text-sm font-bold text-streak-ink"
        aria-label={t.headerStats.streak(streak.current)}
        title={t.headerStats.streak(streak.current)}
      >
        <Flame aria-hidden className="size-4 text-streak" />
        {streak.current}
      </span>
      <LevelLadderDialog totalXp={totalXp}>
        <button
          type="button"
          className="flex w-24 min-w-0 flex-col gap-1 rounded-md text-left sm:w-48 lg:w-auto lg:flex-row lg:items-center lg:gap-3"
          aria-label={`${t.headerStats.openLevels}. ${t.headerStats.level(
            level.level,
            level.title,
            level.xpIntoLevel,
            level.xpForNext,
          )}`}
          title={t.headerStats.level(level.level, level.title, level.xpIntoLevel, level.xpForNext)}
        >
          <span
            aria-hidden
            className="hidden items-center gap-1.5 text-sm font-semibold whitespace-nowrap text-fg lg:flex"
          >
            <Star aria-hidden className="size-4 text-accent" />
            {t.headerStats.titled(level.level, level.title)}
          </span>
          <span className="flex items-baseline justify-between gap-1 text-xs leading-none font-bold lg:hidden">
            <span className="truncate text-fg-muted">{level.title}</span>
            <span className="text-fg-muted">{t.headerStats.short(level.level)}</span>
          </span>
          <span className="flex min-w-0 flex-col gap-1 lg:w-40 xl:w-56">
            <span aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${percent}%` }}
              />
            </span>
            <span
              aria-hidden
              className="hidden truncate text-xs leading-none text-fg-muted sm:block"
            >
              {t.headerStats.left(level.xpForNext - level.xpIntoLevel, level.level + 1)}
            </span>
          </span>
        </button>
      </LevelLadderDialog>
      <ProfileLink user={user} />
    </div>
  );
}
