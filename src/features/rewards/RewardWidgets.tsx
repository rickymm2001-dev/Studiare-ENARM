// Widgets de Inicio para misiones, liga e insignias (Fase P bloque 6).
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import type { ReadySession } from '../shared/RequireSession';
import { tierName } from './labels';
import { LeagueSummary, MissionList } from './parts';
import { useRewards } from './useRewards';

const text = t.rewards;

function GoToRewards() {
  return (
    <Button asChild size="sm" variant="secondary" className="self-start">
      <Link to={screenPath('rewards')}>{text.widgetGo}</Link>
    </Button>
  );
}

export function MissionsWidget({ session }: { session: ReadySession }) {
  const rewards = useRewards(session);
  if (!rewards) return null;
  return (
    <div className="flex flex-col gap-3">
      <MissionList missions={rewards.missions.daily} label={text.missionsToday} />
      <GoToRewards />
    </div>
  );
}

export function LeagueWidget({ session }: { session: ReadySession }) {
  const rewards = useRewards(session);
  if (!rewards) return null;
  return (
    <div className="flex flex-col gap-3">
      <LeagueSummary league={rewards.league} />
      <GoToRewards />
    </div>
  );
}

export function BadgesWidget({ session }: { session: ReadySession }) {
  const rewards = useRewards(session);
  if (!rewards) return null;
  const recent = rewards.recentBadges.slice(0, 3);
  return (
    <div className="flex flex-col gap-3">
      {recent.length === 0 ? (
        <p className="text-sm text-fg-muted">{text.noRecent}</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {recent.map((badge) => (
            <li key={`${badge.family}-${badge.tier}`}>
              <span className="font-medium">
                {text.tierOf(text.families[badge.family].name, tierName(badge.tier))}
              </span>
              <span className="text-fg-muted"> · {text.earnedOn(badge.earnedOn)}</span>
            </li>
          ))}
        </ul>
      )}
      {rewards.recentBadges.length > 3 ? (
        <p className="text-xs text-fg-muted">{text.widgetMore(rewards.recentBadges.length - 3)}</p>
      ) : null}
      <GoToRewards />
    </div>
  );
}
