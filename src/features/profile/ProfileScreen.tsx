// Perfil (pantalla 15, D-065). Quién eres en Studiare. Foto, nivel, racha, cuenta y suscripción.
// Los ajustes viven en Configuración, que se abre desde Accesos en el teléfono y desde el riel en
// computadora. Sin racha ni nivel en el encabezado porque la tarjeta ya los muestra (D-078).
import { Flame, Star } from 'lucide-react';
import { Link } from 'react-router';
import { LevelLadderDialog } from '@/app/layout/LevelLadderDialog';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { ADMIN_LINKS, NAV_BY_ROLE, type NavItem } from '@/app/navigation';
import { usePreferences } from '@/app/preferences';
import { t } from '@/i18n/es-MX';
import { Avatar } from '@/ui/components/avatar';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import { ProgressBar } from '@/ui/components/progress-bar';
import { LoadingState } from '@/ui/states/states';
import { buildSnapshot } from '../home/snapshot';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useUserEvents } from '../shared/useUserEvents';
import { useAccount } from '../shared/useAccount';
import { AccountDataCard } from './AccountDataCard';
import { AccountSection } from './AccountSettings';

export function ProfileScreen() {
  return (
    <RequireSession screen="profile">{(session) => <Profile session={session} />}</RequireSession>
  );
}

function Profile({ session }: { session: ReadySession }) {
  const { user, settings } = session;
  const events = useUserEvents(user.id);
  const account = useAccount(user.id);
  const header = (
    <ScreenHeader
      title={t.screens.profile.title}
      description={t.screens.profile.description}
      stats={false}
    />
  );
  if (events === undefined || account === undefined) {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }
  const { level, streak, totalXp } = buildSnapshot({ events, user, settings, now: new Date() });
  return (
    <>
      {header}
      <Card className="overflow-hidden p-0 sm:p-0">
        <div className="bg-hero h-20" />
        <div className="-mt-10 flex flex-col gap-3 px-5 pb-5">
          <Avatar
            name={user.alias}
            seed={user.id}
            avatar={account?.avatar}
            className="size-20 text-2xl ring-4 ring-surface"
          />
          <div>
            <p className="font-display text-2xl font-extrabold">{user.alias}</p>
            <p className="font-semibold text-warning">
              {t.profileCard.levelLine(level.level, level.title)}
            </p>
          </div>
          <LevelLadderDialog totalXp={totalXp}>
            <button type="button" className="flex flex-col gap-1 rounded-md text-left">
              <ProgressBar
                tone="gold"
                value={level.xpIntoLevel}
                max={level.xpForNext}
                label={t.levelLadder.toNextLevel(
                  (level.xpForNext - level.xpIntoLevel).toLocaleString('es-MX'),
                  level.level + 1,
                )}
              />
              <span className="text-sm text-fg-muted underline underline-offset-4">
                {t.profileCard.seeLevels}
              </span>
            </button>
          </LevelLadderDialog>
          <div className="flex flex-wrap gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-streak-soft px-3 py-1.5 font-bold text-streak-ink">
              <Flame aria-hidden className="size-4" />
              {t.profileCard.streak(streak.current, streak.best)}
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 font-bold text-warning">
              <Star aria-hidden className="size-4" />
              {t.profileCard.xp(totalXp)}
            </span>
          </div>
        </div>
      </Card>
      <PhoneShortcuts />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* El alumno de demostración no tiene correo y no se le pide (D-076) */}
        {session.isDemo && !account ? null : (
          <AccountDataCard key={account ? 'cuenta' : 'nueva'} session={session} account={account} />
        )}
        <AccountSection session={session} />
      </div>
    </>
  );
}

/** En el teléfono no caben Mazos, Party, Configuración ni Administración en la barra (D-076) */
function PhoneShortcuts() {
  const role = usePreferences((state) => state.role);
  const railOnly = NAV_BY_ROLE[role].filter((item) => item.railOnly && !item.groupStart);
  const admin = role === 'admin' || role === 'owner' ? ADMIN_LINKS : [];
  const groups: [string, readonly NavItem[]][] = [
    [t.profileCard.shortcuts, railOnly.filter((item) => !admin.includes(item))],
    [t.navItems.admin, admin],
  ];
  return (
    <div className="flex flex-col gap-3 lg:hidden">
      {groups
        .filter(([, items]) => items.length > 0)
        .map(([title, items]) => (
          <Card key={title} className="p-3">
            <p className="eyebrow mb-2 text-fg-muted">{title}</p>
            <div className="grid grid-cols-2 gap-2">
              {items.map((item) => (
                <Button key={item.path} asChild variant="secondary" className="justify-start">
                  <Link to={item.path}>
                    <item.icon aria-hidden />
                    {item.label}
                  </Link>
                </Button>
              ))}
            </div>
          </Card>
        ))}
    </div>
  );
}
