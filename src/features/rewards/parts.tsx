// Piezas de Logros que se reutilizan en la pantalla y en los widgets de Inicio (Fase P bloque 6).
import { Award, CheckCircle2, Circle } from 'lucide-react';
import { BADGE_FAMILIES, LEAGUES } from '@/config/rewards';
import type { BadgeStatus, LeagueStatus, Mission } from '@/engines/rewards';
import { t } from '@/i18n/es-MX';
import { missionTitle, tierName } from './labels';
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
          tone={mission.done ? 'gold' : 'primary'}
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

export function LeagueSummary({ league }: { league: LeagueStatus }) {
  const name = text.leagues[league.current];
  const index = LEAGUES.findIndex((entry) => entry.key === league.current);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-lg font-bold">{name}</p>
      <p className="text-sm">{text.leagueNow(name, league.weeklyXp)}</p>
      {league.next ? (
        <>
          <ProgressBar
            value={league.weeklyXp - (LEAGUES[index]?.fromXp ?? 0)}
            max={league.next.missingXp + league.weeklyXp - (LEAGUES[index]?.fromXp ?? 0)}
            label={text.leagueNext(league.next.missingXp, text.leagues[league.next.key])}
            tone="gold"
          />
          <p className="text-sm text-fg-muted">
            {text.leagueNext(league.next.missingXp, text.leagues[league.next.key])}
          </p>
        </>
      ) : (
        <p className="text-sm text-fg-muted">{text.leagueTop}</p>
      )}
      {league.movement && league.previous ? (
        <p className="text-sm">
          {text.leagueMovement[league.movement](text.leagues[league.previous])}
        </p>
      ) : null}
    </div>
  );
}

export function BadgeCard({ badge }: { badge: BadgeStatus }) {
  const family = text.families[badge.family];
  const total = BADGE_FAMILIES[badge.family].tiers.length;
  const top = badge.tiers.filter((tier) => tier.earned).at(-1);
  const next = badge.next;
  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-line p-3',
        badge.level === 0 && 'border-dashed',
      )}
    >
      <div className="flex items-center gap-2">
        <Award
          aria-hidden
          className={cn('size-6 shrink-0', badge.level > 0 ? 'text-gold' : 'text-fg-muted')}
        />
        <div className="flex min-w-0 flex-col">
          <span className="font-semibold">{family.name}</span>
          <span className="text-xs text-fg-muted">
            {top ? text.tierOf(family.name, tierName(top.tier)) : text.locked}
            {` · ${badge.level}/${total}`}
          </span>
        </div>
      </div>
      {next ? (
        <>
          <ProgressBar
            value={badge.current}
            max={next.threshold}
            label={`${family.goal(next.threshold)}. ${text.nextTier(badge.current, next.threshold)}`}
          />
          <p className="text-xs text-fg-muted">
            {family.goal(next.threshold)}. {text.nextTier(badge.current, next.threshold)}
          </p>
        </>
      ) : (
        <p className="text-xs text-fg-muted">{text.allTiers}</p>
      )}
      {top?.earnedOn ? (
        <p className="text-xs text-fg-muted">{text.earnedOn(top.earnedOn)}</p>
      ) : null}
    </li>
  );
}
