// Textos de las misiones (D-119 B3, misiones conservadas).
import type { Mission } from '@/engines/rewards';
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
