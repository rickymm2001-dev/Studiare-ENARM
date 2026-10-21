// La cohorte de alumnos simulados convertida en lo que exportan las funciones calibration_* de la base
// (B14, 4.7 del plan de B14). La demostración no tiene nube ni calibración nocturna, así que con esta
// entrada corre los mismos motores de la noche (src/engines/calibration/run.ts) sobre los alumnos
// simulados y de ahí salen su comparación y su línea base de población, con la etiqueta de datos
// simulados. Seudónimos p0000, p0001... en lugar de ids de cuenta, como en la noche. Todo es simulado y
// nunca se mezcla con datos reales. Funciones puras con semilla, sin reloj.
import { FACTORY_MODEL_SETTINGS } from '@/config/modelSettings';
import { FACTORY_THRESHOLDS } from '@/config/thresholds';
import type {
  ActivityRow,
  AnswerRow,
  BankItemRow,
  CalibrationInput,
  ExposureRow,
  MotiveRow,
  PersonRow,
} from '@/engines/calibration/types';
import { ERROR_MOTIVES } from '@/engines/errorCauses';
import { createRng } from '@/engines/random';
import { addDays, daysBetween, studyDayOf } from '@/engines/studyDay';
import type { DemoBank } from '../content/bank';
import type { Cohort } from './cohort';
import { SIM_TIME_ZONE } from './simulate';

/** Sesión larga: más de 30 minutos y al menos 6 respuestas, como el detector de fatiga */
const LONG_SESSION_MINUTES = 30;

/** Parte de los errores del último tercio de sesiones largas que marca Fatiga, según la verdad del alumno */
const FATIGUE_MOTIVE_SHARE = { fatigued: 0.3, others: 0.05 } as const;

/** Las versiones del banco de la demostración como las exporta calibration_bank, sin texto */
export function bankRowsFrom(bank: DemoBank): BankItemRow[] {
  return bank.questions.map((entry) => ({
    versionId: entry.question.id,
    questionId: entry.question.questionId,
    branch: entry.question.branch,
    topic: entry.question.topic,
    subtopic: entry.question.subtopic,
    language: entry.question.language ?? 'es',
    physician: entry.question.physicianDifficulty,
    variantOf: null,
    words: entry.stemWords,
    current: true,
    canonical: entry.question.canonicalOptionIds,
    options: entry.options.map((option) => ({
      id: option.id,
      correct: option.isCorrect,
      tag: option.isCorrect ? null : option.biasTag,
      words: entry.optionWords[option.id] ?? 1,
    })),
    previous: null,
  }));
}

export interface CohortInputOptions {
  /** Último día de estudio de los alumnos. El corte es el día siguiente */
  endDay: string;
  /** La semilla de los motivos y de los repasos de cada día, para que la misma cohorte dé lo mismo */
  seed: string;
  /** La especialidad objetivo del alumno en su lugar de la cohorte. null si no eligió */
  specialtyOf?: (index: number) => string | null;
}

export function calibrationInputFromCohort(
  cohort: Cohort,
  bank: DemoBank,
  options: CohortInputOptions,
): CalibrationInput {
  const asOfDay = addDays(options.endDay, 1);
  const rng = createRng(`${options.seed}|demo-calibracion`);
  const people: PersonRow[] = cohort.students.map((_, index) => ({
    person: `p${String(index).padStart(4, '0')}`,
    specialty: options.specialtyOf?.(index) ?? null,
  }));

  interface Pending {
    at: number;
    person: string;
    answer: Omit<AnswerRow, 'seq'>;
    exposure: Omit<ExposureRow, 'seq'>;
  }
  const pending: Pending[] = [];
  const motives: MotiveRow[] = [];
  const activity: ActivityRow[] = [];

  cohort.students.forEach((student, index) => {
    const person = (people[index] as PersonRow).person;
    const bySession = new Map<string, typeof student.history.responses>();
    for (const response of student.history.responses) {
      const list = bySession.get(response.session) ?? [];
      list.push(response);
      bySession.set(response.session, list);
      const day = studyDayOf(new Date(response.at), SIM_TIME_ZONE);
      pending.push({
        at: Date.parse(response.at),
        person,
        answer: {
          person,
          session: `${person}|${response.session}`,
          versionId: response.versionId,
          optionId: response.chosenOptionId,
          correct: response.correct,
          sessionKind: 'practice',
          daysBefore: Math.max(0, daysBetween(day, asOfDay)),
          minute: Math.round(response.minuteInSession),
          ms: response.msToAnswer,
          confidence: response.confidence,
          changes: response.previousOptionIds.length,
        },
        exposure: {
          person,
          versionId: response.versionId,
          options: [...response.shown]
            .sort((a, b) => a.position - b.position)
            .map((option) => option.optionId),
        },
      });
    }

    // Motivos de error. Los del último tercio de sesiones largas marcan Fatiga según la verdad
    for (const list of bySession.values()) {
      const ordered = [...list].sort((a, b) => a.order - b.order);
      const minutes = Math.max(...ordered.map((response) => response.minuteInSession));
      const long = minutes > LONG_SESSION_MINUTES && ordered.length >= 6;
      const third = Math.floor(ordered.length / 3);
      ordered.forEach((response, position) => {
        if (response.correct) return;
        const lastThird = long && position >= ordered.length - third;
        const day = studyDayOf(new Date(response.at), SIM_TIME_ZONE);
        const daysBefore = Math.max(0, daysBetween(day, asOfDay));
        if (lastThird) {
          const chance =
            student.truth.fatigue === null
              ? FATIGUE_MOTIVE_SHARE.others
              : FATIGUE_MOTIVE_SHARE.fatigued;
          motives.push({
            person,
            daysBefore,
            branch: response.branch,
            motive: rng.chance(chance) ? 'fatigue' : 'knowledge',
            lastThird: true,
          });
        } else if (rng.chance(0.2)) {
          motives.push({
            person,
            daysBefore,
            branch: response.branch,
            motive: rng.pick(ERROR_MOTIVES.filter((motive) => motive !== 'fatigue')),
            lastThird: false,
          });
        }
      });
    }

    // Repasos de tarjetas por día de estudio: la cohorte no guarda los suyos, así que van números
    // alrededor de los que hace un alumno constante
    for (const day of student.history.activeDays) {
      const daysBefore = daysBetween(day, asOfDay);
      if (daysBefore < 1) continue;
      const answers = student.history.responses.filter(
        (response) => studyDayOf(new Date(response.at), SIM_TIME_ZONE) === day,
      ).length;
      activity.push({ person, daysBefore, reviews: 15 + rng.int(0, 50), answers });
    }
  });

  pending.sort((a, b) => a.at - b.at || a.person.localeCompare(b.person));
  const answers: AnswerRow[] = [];
  const exposures: ExposureRow[] = [];
  pending.forEach((item, index) => {
    exposures.push({ ...item.exposure, seq: 2 * index + 1 });
    answers.push({ ...item.answer, seq: 2 * index + 2 });
  });

  return {
    asOfDay,
    settings: FACTORY_MODEL_SETTINGS,
    thresholds: FACTORY_THRESHOLDS,
    bank: bankRowsFrom(bank),
    people,
    answers,
    exposures,
    activity,
    motives,
    // La demostración no etiqueta con dos médicos. El acuerdo no entra a lo que enseña
    labelPairs: [],
  };
}
