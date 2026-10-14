// Carga de repaso por mes para Inicio (D-116). Cuenta, mes por mes, los repasos que estaban
// programados y los que el alumno sí hizo.
//
// Entradas. La bitácora del alumno en orden de tiempo, su zona horaria, el día de estudio de hoy y
// cuántos meses mostrar antes y después del actual. Opcionalmente las tarjetas que hoy cuentan, las
// de los mazos que sigue, para no programar a futuro una tarjeta que ya no va a ver.
// Salidas. Un punto por mes con los programados y los realizados (null en meses que no han llegado),
// y el promedio de repasos por día en lo que va del mes.
// Método. Cada repaso (card_reviewed) y cada cambio de fecha (cards_rescheduled) deja una cita para
// esa tarjeta en su nueva fecha de vencimiento. La cita cuenta como programada en el mes de esa fecha
// si llegó su día antes de que la tarjeta se volviera a programar. Si el alumno la repasó antes de
// tiempo o la cambió de fecha, la cita vieja ya no cuenta y cuenta la nueva. Reiniciar una tarjeta
// (cards_reset) la deja sin cita. La última cita de cada tarjeta cuenta aunque todavía no llegue,
// siempre que la tarjeta siga activa y no esté suspendida.
// Realizados son los card_reviewed de cada mes. Los meses usan el día de estudio, que corta a las
// 4 a. m. en la zona del alumno, igual que el resto de la app.
import type { AppEvent } from '@/data/schemas/events';
import { daysBetween, studyDayOf } from './studyDay';
import { suspendedCardIds } from './suspension';

export interface MonthlyLoadPoint {
  /** Mes en formato AAAA-MM */
  month: string;
  scheduled: number;
  /** null en los meses que todavía no llegan */
  done: number | null;
}

export interface MonthlyLoad {
  points: MonthlyLoadPoint[];
  /** Repasos hechos por día en lo que va del mes actual, redondeado */
  averagePerDayThisMonth: number;
  /** Si hay algo que mostrar. Sin ninguna tarjeta repasada la gráfica no dice nada */
  hasData: boolean;
}

/** El mes AAAA-MM que queda a amount meses del dado */
export function addMonths(month: string, amount: number): string {
  const [year, value] = month.split('-').map(Number) as [number, number];
  const index = year * 12 + (value - 1) + amount;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
}

export function monthlyReviewLoad(input: {
  events: readonly AppEvent[];
  timeZone: string;
  /** Día de estudio de hoy, AAAA-MM-DD */
  today: string;
  monthsBack: number;
  monthsAhead: number;
  activeCardIds?: ReadonlySet<string>;
}): MonthlyLoad {
  const { events, timeZone, today, monthsBack, monthsAhead, activeCardIds } = input;
  const current = today.slice(0, 7);
  const months = Array.from({ length: monthsBack + monthsAhead + 1 }, (_, index) =>
    addMonths(current, index - monthsBack),
  );
  const scheduled = new Map<string, number>(months.map((month) => [month, 0]));
  const done = new Map<string, number>(months.map((month) => [month, 0]));
  const monthOf = (iso: string) => studyDayOf(new Date(iso), timeZone).slice(0, 7);
  const count = (map: Map<string, number>, month: string) => {
    if (map.has(month)) map.set(month, (map.get(month) ?? 0) + 1);
  };

  // La cita vigente de cada tarjeta. Al llegar una cita nueva se decide si la anterior contó
  const appointments = new Map<string, string>();
  const reschedule = (cardId: string, due: string, at: string) => {
    const previous = appointments.get(cardId);
    if (previous !== undefined && Date.parse(previous) <= Date.parse(at)) {
      count(scheduled, monthOf(previous));
    }
    appointments.set(cardId, due);
  };

  let reviewed = 0;
  for (const event of events) {
    if (event.type === 'card_reviewed') {
      reviewed += 1;
      count(done, studyDayOf(new Date(event.at), event.tz).slice(0, 7));
      reschedule(event.payload.cardId, event.payload.stateAfter.due, event.at);
    } else if (event.type === 'cards_rescheduled') {
      for (const moved of event.payload.cards) {
        // Solo se mueve lo que ya tenía fecha, igual que en el resto de la app
        if (appointments.has(moved.cardId)) reschedule(moved.cardId, moved.to, event.at);
      }
    } else if (event.type === 'cards_reset') {
      // Una tarjeta reiniciada vuelve a ser nueva y se queda sin cita. La cita de antes cuenta si ya
      // había llegado su día, como cuando se cambia de fecha
      for (const cardId of event.payload.cardIds) {
        const previous = appointments.get(cardId);
        if (previous !== undefined && Date.parse(previous) <= Date.parse(event.at)) {
          count(scheduled, monthOf(previous));
        }
        appointments.delete(cardId);
      }
    }
  }

  // La última cita de cada tarjeta cuenta en su mes, si la tarjeta sigue en el repaso
  const suspended = suspendedCardIds(events);
  for (const [cardId, due] of appointments) {
    if (suspended.has(cardId) || (activeCardIds && !activeCardIds.has(cardId))) continue;
    count(scheduled, monthOf(due));
  }

  const elapsedDays = daysBetween(`${current}-01`, today) + 1;
  return {
    points: months.map((month) => ({
      month,
      scheduled: scheduled.get(month) ?? 0,
      done: month > current ? null : (done.get(month) ?? 0),
    })),
    averagePerDayThisMonth: Math.round((done.get(current) ?? 0) / Math.max(1, elapsedDays)),
    hasData: reviewed > 0,
  };
}
