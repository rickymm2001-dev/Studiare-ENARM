// Resumen de la semana para compartir (respuesta 83 del plan del cambio, B7). Antes era la tarjeta de
// logro de 9.6 con nivel, racha y XP. Ahora junta lo que el alumno estudió en la semana en curso,
// desde el lunes a las 4 a. m. Días de estudio, repasos, preguntas y racha. Solo usa datos del propio
// alumno y nunca su exactitud, sus sesgos, su conducta ni un puntaje estimado. El alias va solo si el
// alumno lo pide y en modo enfoque la racha no va. Sin React ni DOM, para poder probarlo.
import { BRAND } from '@/config/brand';
import { STUDY_DAY_MIN } from '@/config/rewards';
import { addDays, weekStartOf } from '@/engines/studyDay';
import { t } from '@/i18n/es-MX';
import type { DaySummary, Snapshot } from '../home/snapshot';

/** Lo que el resumen lee de la instantánea del alumno */
export type WeekShareSource = Pick<Snapshot, 'today' | 'activity' | 'streak'>;

export interface WeekShareCard {
  brand: string;
  /** null si el alumno no quiere que su alias vaya en la imagen */
  alias: string | null;
  /** Lunes de la semana en curso, AAAA-MM-DD */
  weekStart: string;
  /** Días de la semana con estudio, de 0 a 7, con la regla de STUDY_DAY_MIN */
  studyDays: number;
  /** Tarjetas repasadas en la semana */
  reviews: number;
  /** Preguntas contestadas en la semana */
  questions: number;
  /** Días de racha. null en modo enfoque, que oculta la racha en toda la app */
  streak: number | null;
  /** Con datos de demostración la imagen lo dice, para que nadie la tome por real (4.6) */
  simulated: boolean;
}

/**
 * Un día cuenta como de estudio con al menos una tarjeta, una pregunta o 5 minutos de enfoque. Las
 * misiones de la semana, que tenían esta regla, se quitaron en B3 y el resumen la conserva
 */
function isStudyDay(day: DaySummary): boolean {
  return (
    day.cards >= STUDY_DAY_MIN.cards ||
    day.questions >= STUDY_DAY_MIN.questions ||
    day.focusMinutes >= STUDY_DAY_MIN.minutes
  );
}

export function buildWeekShare(input: {
  snapshot: WeekShareSource;
  alias: string | null;
  simulated: boolean;
  /** false en modo enfoque */
  includeStreak: boolean;
}): WeekShareCard {
  const { snapshot } = input;
  const weekStart = weekStartOf(snapshot.today);
  let studyDays = 0;
  let reviews = 0;
  let questions = 0;
  for (let day = weekStart; day <= snapshot.today; day = addDays(day, 1)) {
    const entry = snapshot.activity[day];
    if (!entry) continue;
    reviews += entry.cards;
    questions += entry.questions;
    if (isStudyDay(entry)) studyDays += 1;
  }
  return {
    brand: BRAND.name,
    alias: input.alias,
    weekStart,
    studyDays,
    reviews,
    questions,
    streak: input.includeStreak ? snapshot.streak.current : null,
    simulated: input.simulated,
  };
}

/** La semana con su lunes, como Semana del 12 de octubre */
export function weekShareLabel(card: Pick<WeekShareCard, 'weekStart'>): string {
  const monday = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${card.weekStart}T12:00:00Z`));
  return t.b7.weekShare.week(monday);
}

/** Las cifras de la imagen en orden, cada una con su etiqueta y su valor ya escritos */
export function weekShareFigures(card: WeekShareCard): { label: string; value: string }[] {
  const text = t.b7.weekShare;
  const figures: { label: string; value: string }[] = [
    { label: text.studyDays, value: text.studyDaysValue(card.studyDays) },
    { label: text.reviews, value: card.reviews.toLocaleString('es-MX') },
    { label: text.questions, value: card.questions.toLocaleString('es-MX') },
  ];
  if (card.streak !== null) {
    figures.push({ label: text.streak, value: text.streakValue(card.streak) });
  }
  return figures;
}

/** El texto que acompaña a la imagen al compartirla */
export function weekShareText(card: WeekShareCard): string {
  const text = t.b7.weekShare;
  const line = text.shareText(card);
  return [card.alias ? `${card.alias}. ${line}` : line, card.simulated ? text.simulatedBanner : '']
    .filter(Boolean)
    .join(' ');
}
