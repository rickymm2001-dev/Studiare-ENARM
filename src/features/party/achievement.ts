// Tarjeta de logro para compartir (9.6, D-028). Solo usa datos del propio alumno, nunca de los
// compañeros simulados, y el alias va solo si el alumno lo pide. Lo que se comparte es nivel, racha y
// XP de la semana. Exactitud, sesgos y conducta no entran. Sin React ni DOM, para poder probarlo.
import { BRAND } from '@/config/brand';
import { t } from '@/i18n/es-MX';
import type { Snapshot } from '../home/snapshot';

export interface AchievementCard {
  brand: string;
  /** null si el alumno no quiere que su alias vaya en la tarjeta */
  alias: string | null;
  level: number;
  levelTitle: string;
  streak: number;
  weeklyXp: number;
  /** Con datos de demostración la tarjeta lo dice, para que nadie la tome por real (4.6) */
  simulated: boolean;
}

export function buildAchievement(input: {
  snapshot: Pick<Snapshot, 'level' | 'streak' | 'weeklyXp'>;
  alias: string | null;
  simulated: boolean;
}): AchievementCard {
  const { snapshot } = input;
  return {
    brand: BRAND.name,
    alias: input.alias,
    level: snapshot.level.level,
    levelTitle: snapshot.level.title,
    streak: snapshot.streak.current,
    weeklyXp: snapshot.weeklyXp,
    simulated: input.simulated,
  };
}

/** El texto que acompaña a la imagen al compartirla */
export function achievementText(card: AchievementCard): string {
  const text = t.party.share;
  const line = text.shareText(card.level, card.levelTitle, card.streak, card.weeklyXp);
  return [card.alias ? `${card.alias}. ${line}` : line, card.simulated ? text.simulatedBanner : '']
    .filter(Boolean)
    .join(' ');
}
