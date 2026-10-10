// Aviso al ganar un nivel de insignia (Fase I). Cuando el alumno cruza el umbral aparece una franja
// con una celebración corta, y se recuerda en el dispositivo qué niveles ya vio para no repetirla. La
// primera vez en un dispositivo solo se anotan los que ya tenía, sin avisar de golpe todo lo ganado.
// No interrumpe un examen en curso y en la demostración no aparece, porque el alumno es simulado.
import { Award, X } from 'lucide-react';
import { useEffect, useEffectEvent, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { badgeTierKey, earnedBadgeKeys, unseenBadgeTiers } from '@/engines/rewards';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { celebrate } from '@/ui/celebrate';
import { tierName } from '@/features/rewards/labels';
import { loadSeenBadges, saveSeenBadges } from '@/features/rewards/badgesSeen';
import { useRewards } from '@/features/rewards/useRewards';
import type { ReadySession } from '@/features/shared/RequireSession';
import { screenPath } from '../screens';
import { useSession } from '../session';

/** Cuánto dura el aviso si el alumno no lo cierra */
const TOAST_MS = 9000;

export function BadgeToast() {
  const session = useSession();
  if (session.status !== 'ready' || session.isDemo) return null;
  // Con la llave de la cuenta, otro alumno en el mismo dispositivo empieza con lo suyo
  return <Toast key={session.user.id} session={session} />;
}

function Toast({ session }: { session: ReadySession }) {
  const rewards = useRewards(session);
  const { pathname } = useLocation();
  const userId = session.user.id;
  const inExam = pathname === screenPath('exam');
  const badges = rewards?.badges;

  // Lo que el alumno ya vio. undefined mientras no hay insignias calculadas. La primera vez en el
  // dispositivo se parte de lo que ya tiene ganado, para no avisar de golpe todo lo anterior
  const [seen, setSeen] = useState<ReadonlySet<string> | undefined>(undefined);
  if (badges && seen === undefined) {
    setSeen(loadSeenBadges(userId) ?? new Set(earnedBadgeKeys(badges)));
  }
  useEffect(() => {
    if (seen) saveSeenBadges(userId, seen);
  }, [seen, userId]);

  const fresh = badges && seen ? unseenBadgeTiers(badges, seen) : [];
  const visible = fresh.length > 0 && !inExam;
  const freshKeys = fresh.map((badge) => badgeTierKey(badge.family, badge.tier));
  const freshId = freshKeys.join(',');

  const acknowledge = () => {
    setSeen((current) => new Set([...(current ?? []), ...freshKeys]));
  };
  const acknowledgeLater = useEffectEvent(acknowledge);

  // La celebración y el cierre automático son efectos fuera de React, el sonido y el temporizador
  useEffect(() => {
    if (!visible) return;
    celebrate('badge');
    const timer = window.setTimeout(() => {
      acknowledgeLater();
    }, TOAST_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [visible, freshId]);

  if (!visible) return null;
  const names = fresh.map((badge) =>
    t.rewards.tierOf(t.rewards.families[badge.family].name, tierName(badge.tier)),
  );

  return (
    <div
      role="status"
      className="fixed inset-x-4 top-[calc(env(safe-area-inset-top)+4.5rem)] z-40 mx-auto flex max-w-reading items-center gap-3 rounded-lg border border-line bg-surface p-3 shadow-raised lg:top-24 lg:right-6 lg:left-auto lg:mx-0 lg:w-auto lg:max-w-md"
    >
      <Award aria-hidden className="size-6 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-fg">{t.rewards.toast.title(names.length)}</p>
        <p className="text-fg-muted">{names.join('. ')}</p>
      </div>
      <Button asChild size="sm" variant="secondary" onClick={acknowledge}>
        <Link to={screenPath('rewards')}>{t.rewards.toast.see}</Link>
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label={t.rewards.toast.dismiss}
        onClick={acknowledge}
      >
        <X aria-hidden />
      </Button>
    </div>
  );
}
