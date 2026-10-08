// Logros (pantalla 31, Fase P bloque 6). Las misiones del día y de la semana, la liga y las
// insignias, todo calculado de la bitácora del alumno. No da XP extra ni predice el puntaje del ENARM.
import { Award, ListChecks, Trophy } from 'lucide-react';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { t } from '@/i18n/es-MX';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { StatCell, StatPanel } from '@/ui/components/stat-panel';
import { LoadingState } from '@/ui/states/states';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { BadgeCard, LeagueSummary, MissionList } from './parts';
import { useRewards } from './useRewards';

const text = t.rewards;

export function RewardsScreen() {
  return <RequireSession screen="rewards">{(ready) => <Rewards session={ready} />}</RequireSession>;
}

function Rewards({ session }: { session: ReadySession }) {
  const rewards = useRewards(session);
  return (
    <>
      <ScreenHeader title={t.screens.rewards.title} description={t.screens.rewards.description} />
      {rewards === undefined ? (
        <LoadingState />
      ) : (
        <>
          <StatPanel label={text.statLeague}>
            <StatCell
              icon={<Trophy />}
              label={text.statLeague}
              value={text.leagues[rewards.league.current]}
            />
            <StatCell
              icon={<ListChecks />}
              label={text.statMissions}
              value={text.progress(
                rewards.missions.daily.filter((mission) => mission.done).length,
                rewards.missions.daily.length,
              )}
            />
            <StatCell
              icon={<Award />}
              label={text.statBadges}
              value={rewards.badges.reduce((sum, badge) => sum + badge.level, 0)}
            />
          </StatPanel>

          <div className="grid gap-3 md:grid-cols-2">
            <Card aria-label={text.missionsToday}>
              <CardHeader>
                <CardTitle>{text.missionsToday}</CardTitle>
              </CardHeader>
              <MissionList missions={rewards.missions.daily} label={text.missionsToday} />
            </Card>
            <Card aria-label={text.missionsWeek}>
              <CardHeader>
                <CardTitle>{text.missionsWeek}</CardTitle>
              </CardHeader>
              <MissionList missions={rewards.missions.weekly} label={text.missionsWeek} />
            </Card>
          </div>

          <Card aria-label={text.leagueTitle}>
            <CardHeader>
              <CardTitle>{text.leagueTitle}</CardTitle>
              <CardDescription>{text.leagueNote}</CardDescription>
            </CardHeader>
            <LeagueSummary league={rewards.league} />
            <p className="mt-2 text-sm text-fg-muted">
              {text.leagueBest(text.leagues[rewards.league.best])}
            </p>
          </Card>

          <Card aria-label={text.badgesTitle}>
            <CardHeader>
              <CardTitle>{text.badgesTitle}</CardTitle>
              <CardDescription>
                {rewards.recentBadges.length === 0 ? text.noRecent : text.note}
              </CardDescription>
            </CardHeader>
            <ul aria-label={text.badgesTitle} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rewards.badges.map((badge) => (
                <BadgeCard key={badge.family} badge={badge} />
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
