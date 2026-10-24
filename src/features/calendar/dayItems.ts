// Lo que cada día del Calendario muestra (D-150). Funciones puras que juntan la proyección de repasos,
// las tarjetas hechas, las sesiones terminadas, el plan por semanas, el examen y los retos de Party
// en una lista de piezas con su texto corto para la píldora, su texto completo para el lector de
// pantalla y su título para el detalle del día. Nada se inventa. Cada pieza sale de un dato real.
import type { DayLoad } from '@/engines/fsrs';
import type { SessionDone, StudyWeek } from '@/engines/studyCalendar';
import { t } from '@/i18n/es-MX';

const text = t.calendar;

export type DayItemKind =
  'done' | 'reviews' | 'newCards' | 'session' | 'planSimulator' | 'exam' | 'party';

export interface DayItem {
  kind: DayItemKind;
  /** Para la píldora de la rejilla */
  short: string;
  /** Para el nombre accesible del día */
  long: string;
  /** Para el título del detalle y el plan de hoy */
  title: string;
  /** La segunda línea del plan de hoy */
  hint: string | null;
}

export interface DayContext {
  today: string;
  /** La carga proyectada por día, de hoy en adelante */
  forecast: ReadonlyMap<string, DayLoad>;
  /** Las tarjetas hechas por día */
  activity: Readonly<Record<string, { cards: number }>>;
  /** Las sesiones terminadas por día */
  sessions: ReadonlyMap<string, readonly SessionDone[]>;
  weeks: readonly StudyWeek[];
  examDate: string;
  /** Los retos de Party por el día en que terminan */
  challenges: ReadonlyMap<string, readonly { title: string }[]>;
}

/** Las piezas de un día, en el orden en que se pintan. Hecho primero, después lo programado */
export function itemsForDay(day: string, context: DayContext): DayItem[] {
  const items: DayItem[] = [];
  const cards = context.activity[day]?.cards ?? 0;
  if (day <= context.today && cards > 0) {
    items.push({
      kind: 'done',
      short: text.done(cards),
      long: text.doneLong(cards),
      title: text.doneLong(cards),
      hint: null,
    });
  }
  const planned = context.forecast.get(day);
  if (day >= context.today && planned) {
    if (planned.reviews > 0) {
      items.push({
        kind: 'reviews',
        short: text.pills.reviews(planned.reviews),
        long: text.forecastLong(planned.reviews),
        title: text.pills.reviews(planned.reviews),
        hint: text.todayPlan.reviewsHint,
      });
    }
    if (planned.newCards > 0) {
      items.push({
        kind: 'newCards',
        short: text.pills.newCards(planned.newCards),
        long: text.pills.newCards(planned.newCards),
        title: text.pills.newCards(planned.newCards),
        hint: text.todayPlan.newCardsHint,
      });
    }
  }
  for (const session of context.sessions.get(day) ?? []) {
    // Las sesiones de repaso ya se cuentan en las tarjetas hechas
    if (session.kind === 'review' || session.items <= 0) continue;
    items.push({
      kind: 'session',
      short: text.pills.session(session.kind, session.items),
      long: text.pills.sessionLong(session.kind, session.items),
      title: text.pills.sessionLong(session.kind, session.items),
      hint: text.todayPlan.sessionHint(Math.round(session.durationMs / 60_000)),
    });
  }
  const week = context.weeks.find((item) => day >= item.start && day <= item.end);
  if (week?.simulatorSunday === day) {
    items.push({
      kind: 'planSimulator',
      short: text.pills.planSimulator,
      long: text.simulatorLong,
      title: text.simulatorLong,
      hint: text.todayPlan.planHint,
    });
  }
  if (context.examDate === day) {
    items.push({
      kind: 'exam',
      short: text.examShort,
      long: text.examLong,
      title: text.examLong,
      hint: null,
    });
  }
  for (const challenge of context.challenges.get(day) ?? []) {
    items.push({
      kind: 'party',
      short: text.pills.party,
      long: text.pills.partyLong(challenge.title),
      title: challenge.title,
      hint: text.todayPlan.partyHint,
    });
  }
  return items;
}

/** A dónde lleva Empezar ahora. Con repasos pendientes a Repasar, si no al simulador. null fuera de hoy */
export function startTarget(
  day: string,
  today: string,
  items: readonly DayItem[],
): 'review' | 'simulatorSetup' | null {
  if (day !== today) return null;
  return items.some((item) => item.kind === 'reviews' || item.kind === 'newCards')
    ? 'review'
    : 'simulatorSetup';
}
