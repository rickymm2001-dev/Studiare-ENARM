// Cuántas preguntas le quedan hoy al alumno según su plan (9.8). La práctica y los duelos de Party
// consultan lo mismo, así el límite del plan Gratis se aplica igual en los dos. Es una bandera de
// acceso. Con el banco de la nube (B11, 5.5) el servidor cuenta además las preguntas nuevas que bajó en
// el día y lo que le queda es el menor de los dos. Con la nube, el plan es el de my_plan, que la app ya
// copió a la suscripción local (cloudPlan.ts). Sin React ni Dexie.
import { PLANS, planOf, type PlanKey } from '@/config/billing';
import type { QuotaInfo } from '@/data/bank/contracts';
import { combinedLeft } from '@/data/bank/quota';
import type { AppEvent } from '@/data/schemas/events';
import type { Subscription } from '@/data/schemas/people';
import { studyDayOf } from '@/engines/studyDay';

export interface DailyQuestions {
  plan: PlanKey;
  /** Preguntas por día del plan. null es sin límite */
  limit: number | null;
  answeredToday: number;
  /** Preguntas de un examen abierto que todavía no están en la bitácora y cuentan para hoy */
  reserved: number;
  /** Las que le quedan hoy. null es sin límite */
  left: number | null;
  /** El tope lo puso el servidor, porque le queda menos de lo que dice la app */
  limitedByServer: boolean;
}

export function dailyQuestions(input: {
  events: readonly AppEvent[];
  subscription: Pick<Subscription, 'plan' | 'status'> | null | undefined;
  timeZone: string;
  now: Date;
  /**
   * Preguntas de un examen abierto que se registran hasta que termina. Cuentan para hoy desde que
   * empieza, si no el alumno gastaría el límite en práctica y luego terminaría el examen de más
   */
  reserved?: number;
  /** La última cuota del banco de la nube. Sin ella, o de otro día, solo cuenta la app */
  serverQuota?: QuotaInfo | null;
}): DailyQuestions {
  const plan = planOf(input.subscription);
  const limit = PLANS[plan].access.dailyQuestions;
  const today = studyDayOf(input.now, input.timeZone);
  // Cada quien cuenta el día con la zona horaria de cuando respondió
  const answeredToday = input.events.filter(
    (event) =>
      event.type === 'question_answered' && studyDayOf(new Date(event.at), event.tz) === today,
  ).length;
  const reserved = Math.max(0, input.reserved ?? 0);
  const appLeft = limit === null ? null : Math.max(0, limit - answeredToday - reserved);
  const left = combinedLeft(appLeft, input.serverQuota, input.now);
  return {
    plan,
    limit,
    answeredToday,
    reserved,
    left,
    limitedByServer: left !== appLeft,
  };
}
