// Título de cada misión con su objetivo, aparte del componente para usarlo en la lista y en las
// pruebas (Fase P bloque 6, 4.12 del plan del cambio).
import type { Mission } from '@/engines/rewards';
import { t } from '@/i18n/es-MX';

export function missionTitle(mission: Mission): string {
  const titles = t.missions.titles;
  switch (mission.key) {
    case 'dailyCards':
      return titles.dailyCards(mission.target);
    case 'dailyQuestions':
      return titles.dailyQuestions(mission.target);
    case 'dailyMinutes':
      return titles.dailyMinutes(mission.target);
    case 'weeklyDays':
      return titles.weeklyDays(mission.target);
    case 'weeklyXp':
      return titles.weeklyXp(mission.target);
    case 'weeklyAccuracy':
      return titles.weeklyAccuracy(mission.target);
  }
}
