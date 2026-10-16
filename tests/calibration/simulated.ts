// Entrada de la calibración nocturna armada con los alumnos simulados (src/demo/generator), para probar los
// motores de src/engines/calibration sin base de datos. Convierte la cohorte simulada en lo que exportan
// las funciones calibration_* (seudónimos, respuestas, opciones mostradas, actividad, motivos y pares de
// etiquetas) y conserva la verdad del generador para comparar. El autotest de scripts/calibration hace lo
// mismo contra una base de verdad. Todo es simulado y nunca se mezcla con datos reales.
import { FACTORY_MODEL_SETTINGS } from '@/config/modelSettings';
import { FACTORY_THRESHOLDS } from '@/config/thresholds';
import { biasTaxonomy, topicTaxonomy } from '@/demo/content';
import { buildDemoBank, type DemoBank } from '@/demo/content/bank';
import { generateCohort, type Cohort } from '@/demo/generator/cohort';
import { DEFAULT_MIX, type CohortMix } from '@/demo/generator/model';
import { SIM_TIME_ZONE } from '@/demo/generator/simulate';
import { ERROR_MOTIVES } from '@/engines/errorCauses';
import { createRng } from '@/engines/random';
import { addDays, daysBetween, studyDayOf } from '@/engines/studyDay';
import type {
  ActivityRow,
  AnswerRow,
  BankItemRow,
  CalibrationInput,
  ExposureRow,
  LabelPairRow,
  MotiveRow,
  PersonRow,
} from '@/engines/calibration/types';

export interface SimulatedOptions {
  seed: string;
  size: number;
  days: number;
  /** Último día de estudio de los alumnos. El corte es el día siguiente */
  endDay?: string;
  mix?: CohortMix;
  /** Cuántos alumnos buscan cada especialidad, empezando por el primero. El resto no eligió */
  specialties?: Readonly<Record<string, number>>;
  /** Parte de los errores del último tercio de sesiones largas que marca Fatiga */
  fatigueMotiveShare?: { fatigued: number; others: number };
}

export interface Simulated {
  input: CalibrationInput;
  cohort: Cohort;
  bank: DemoBank;
  /** Dificultad verdadera por id de versión, en logits */
  trueDifficulty: ReadonlyMap<string, number>;
  /** Seudónimos de los alumnos con fatiga sembrada */
  fatigued: ReadonlySet<string>;
}

const LONG_SESSION_MINUTES = 30;

export function simulatedInput(options: SimulatedOptions): Simulated {
  const bank = buildDemoBank();
  const endDay = options.endDay ?? '2026-10-01';
  const asOfDay = addDays(endDay, 1);
  const cohort = generateCohort(bank, topicTaxonomy, {
    seed: options.seed,
    size: options.size,
    days: options.days,
    endDay,
    simulateCards: false,
    mix: options.mix ?? DEFAULT_MIX,
  });
  const share = options.fatigueMotiveShare ?? { fatigued: 0.3, others: 0.05 };
  const rng = createRng(`${options.seed}|calibracion`);

  const bankRows: BankItemRow[] = bank.questions.map((entry) => ({
    versionId: entry.question.id,
    questionId: entry.question.questionId,
    branch: entry.question.branch,
    topic: entry.question.topic,
    subtopic: entry.question.subtopic,
    language: 'es',
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

  const specialtyOf = (index: number): string | null => {
    let offset = 0;
    for (const [specialty, count] of Object.entries(options.specialties ?? {})) {
      if (index < offset + count) return specialty;
      offset += count;
    }
    return null;
  };
  const people: PersonRow[] = cohort.students.map((_, index) => ({
    person: `p${String(index).padStart(4, '0')}`,
    specialty: specialtyOf(index),
  }));

  interface Pending {
    at: number;
    person: string;
    answer: Omit<AnswerRow, 'seq'>;
    exposure: Omit<ExposureRow, 'seq'>;
  }
  const pending: Pending[] = [];
  const fatigued = new Set<string>();
  const motives: MotiveRow[] = [];
  const activity: ActivityRow[] = [];

  cohort.students.forEach((student, index) => {
    const person = (people[index] as PersonRow).person;
    if (student.truth.fatigue !== null) fatigued.add(person);
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
          const chance = student.truth.fatigue === null ? share.others : share.fatigued;
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

    // Repasos de tarjetas por día de estudio. Un número alrededor de 40
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

  // Pares de etiquetas del autor y el revisor, con acuerdo de alrededor de 75%
  const tags = biasTaxonomy.biases.filter((bias) => bias.taggable).map((bias) => bias.key);
  const labelPairs: LabelPairRow[] = Array.from({ length: 60 }, (_, index) => {
    const authorTag = rng.pick(tags);
    return {
      optionId: `opt-${index}`,
      authorTag,
      reviewerTag: rng.chance(0.75) ? authorTag : rng.pick(tags),
    };
  });

  const trueDifficulty = new Map<string, number>();
  for (const entry of bank.questions) {
    const truth = cohort.difficulties[entry.key];
    if (truth !== undefined) trueDifficulty.set(entry.question.id, truth);
  }
  return {
    input: {
      asOfDay,
      settings: FACTORY_MODEL_SETTINGS,
      thresholds: FACTORY_THRESHOLDS,
      bank: bankRows,
      people,
      answers,
      exposures,
      activity,
      motives,
      labelPairs,
    },
    cohort,
    bank,
    trueDifficulty,
    fatigued,
  };
}
