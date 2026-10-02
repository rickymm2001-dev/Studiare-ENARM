// Perfil (pantalla 15, D-065). Quién eres en Studiare. Foto, nivel, racha, cuenta y suscripción.
// Los ajustes viven en Configuración.
import { Flame, Settings, Star } from 'lucide-react';
import { Link } from 'react-router';
import { LevelLadderDialog } from '@/app/layout/LevelLadderDialog';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
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
      actions={
        <Button asChild variant="secondary" size="sm">
          <Link to={screenPath('settings')}>
            <Settings aria-hidden />
            {t.screens.settings.title}
          </Link>
        </Button>
      }
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
            <p className="font-semibold text-accent">
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
            <span className="flex items-center gap-1.5 rounded-full bg-streak-soft px-3 py-1.5 font-bold text-streak">
              <Flame aria-hidden className="size-4" />
              {t.profileCard.streak(streak.current, streak.best)}
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 font-bold text-accent">
              <Star aria-hidden className="size-4" />
              {t.profileCard.xp(totalXp)}
            </span>
          </div>
        </div>
      </Card>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <AccountDataCard key={account ? 'cuenta' : 'nueva'} session={session} account={account} />
        <AccountSection session={session} />
      </div>
    </>
  );
}
