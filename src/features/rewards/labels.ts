// Textos de las misiones y de los niveles de insignia (Fase P bloque 6). Aparte de los componentes
// para poder usarlos en la pantalla, en los widgets y en las pruebas.
import type { BadgeStatus, Mission } from '@/engines/rewards';
import { t } from '@/i18n/es-MX';

const text = t.rewards;

export function missionTitle(mission: Mission): string {
  switch (mission.key) {
    case 'dailyCards':
      return text.missions.dailyCards(mission.target);
    case 'dailyQuestions':
      return text.missions.dailyQuestions(mission.target);
    case 'dailyMinutes':
      return text.missions.dailyMinutes(mission.target);
    case 'weeklyDays':
      return text.missions.weeklyDays(mission.target);
    case 'weeklyXp':
      return text.missions.weeklyXp(mission.target);
    case 'weeklyAccuracy':
      return text.missions.weeklyAccuracy(mission.target);
  }
}

export function tierName(tier: number): string {
  return text.tiers[tier - 1] ?? String(tier);
}

export function badgeGoal(badge: BadgeStatus, threshold: number): string {
  return text.families[badge.family].goal(threshold);
}
