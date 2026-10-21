/**
 * Dificultad de las preguntas de la calibración (B14, 3.4 del plan de B14, respuesta 88 y PC 5.5).
 *
 * Qué hace. Con los primeros intentos válidos calcula por versión aprobada su dificultad de Rasch con
 * error estándar, la enlaza a la escala de la noche anterior, reproduce Elo y dice en qué estado de
 * calibración queda.
 * Entradas. Los primeros intentos (firstAttempts.ts), el banco con la dificultad del médico y la
 * calibración que leen hoy los alumnos, los umbrales de alumnos del admin y los de error estándar de
 * model_settings.
 * Salidas. Una fila por versión con al menos un alumno y los conteos del enlace de escala.
 * Método
 *   - Rasch por máxima verosimilitud conjunta con estimateRasch, persona = seudónimo, ítem = versión
 *   - Enlace de escala. Rasch centra las dificultades en 0 en cada corrida, así que la escala se movería
 *     cada noche al cambiar el banco. Con 20 o más preguntas al menos provisionales tanto en la
 *     corrida anterior como en esta, se desplaza todo para que su media coincida con la anterior
 *     (media a media). Sin esas 20, se desplaza para que la media de las estimadas coincida con la media
 *     de la dificultad del médico en logits. El desplazamiento queda en los conteos
 *   - Diseño desconectado. Si los alumnos y las preguntas forman grupos sin nada en común, Rasch no puede
 *     decir dónde queda un grupo respecto de otro y las dificultades de grupos distintos no se comparan.
 *     Cada grupo se enlaza por su cuenta. Con 20 o más anclas propias, a la noche anterior. Sin ellas
 *     solo se enlaza con la escala del médico el único grupo de 20 o más preguntas (o el único grupo que
 *     hay). Las demás quedan en la estimada por el médico hasta que alguien las conecte. Y si Rasch no
 *     convergió, ninguna dificultad se publica
 *   - Estados de PC 5.5 con calibrationStatusWithError. Calibrada con 100 alumnos o más y error
 *     estándar de 0.3 o menos, provisional con 30 o más y 0.5 o menos, si no la estimada por el médico.
 *     Una pregunta que todos aciertan o todos fallan no tiene estimación finita. Queda en la estimada
 *     por el médico y con extreme en true cuando tiene alumnos para el estado provisional
 *   - Elo se reproduce desde cero en orden del tiempo con updateElo, con la dificultad del médico como
 *     inicio y K de DEFAULT_ELO. Se publica para diagnóstico y como dato de las preguntas extremas
 * Umbrales. 30 y 100 alumnos (V, Linacre), error estándar de 0.5 y 0.3 (V, PC 5.5) y 20 anclas (J).
 */
import type { ModelSettings } from '@/config/modelSettings';
import type { Thresholds } from '@/config/thresholds';
import type { CalibrationState } from '@/data/model/contracts';
import {
  calibrationStatusWithError,
  physicianToLogit,
  updateElo,
  type EloEntity,
} from '@/engines/difficulty';
import { estimateRasch, type RaschOptions } from '@/engines/rasch';
import { chronological } from './firstAttempts';
import type { BankItemRow, FirstAttempt, ItemResult } from './types';

/** Preguntas ancla que hacen falta para enlazar con la noche anterior (J) */
export const MIN_ANCHORS = 20;

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const mean = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/** La dificultad del médico en logits, aunque el dato venga raro. Fuera de 1 a 5 queda en 3 */
const physicianLogit = (level: number) =>
  physicianToLogit(Number.isInteger(level) && level >= 1 && level <= 5 ? level : 3);

const atLeastProvisional = (state: CalibrationState | undefined) =>
  state === 'provisional' || state === 'calibrated';

export interface ItemCalibrationCounts {
  /** Cuánto se movió la escala para enlazarla, en logits */
  scaleShift: number;
  /** Anclas usadas. 0 si el enlace fue con la escala del médico */
  anchors: number;
  raschConverged: number;
  raschIterations: number;
  /** Versiones que Rasch dejó fuera por puntaje extremo o por falta de datos conectados */
  raschExcluded: number;
  /** Grupos conectados de preguntas estimadas. 1 es un diseño conectado */
  raschComponents: number;
  /** Versiones estimadas que quedaron en la estimada por el médico por estar en un grupo sin enlace */
  raschUnlinked: number;
}

export function calibrateItems(input: {
  attempts: readonly FirstAttempt[];
  bank: ReadonlyMap<string, BankItemRow>;
  thresholds: Pick<Thresholds, 'difficulty'>;
  settings: Pick<ModelSettings, 'thresholds'>;
  /** Solo para las pruebas. La noche usa los valores de fábrica de Rasch */
  rasch?: Pick<RaschOptions, 'maxIterations'>;
}): { items: ItemResult[]; counts: ItemCalibrationCounts } {
  const { attempts, bank } = input;
  const precision = {
    provisionalMaxSe: input.settings.thresholds.provisionalMaxSe,
    calibratedMaxSe: input.settings.thresholds.calibratedMaxSe,
  };

  // Alumnos distintos y aciertos por versión
  const tallies = new Map<string, { students: Set<string>; correct: number; total: number }>();
  for (const attempt of attempts) {
    const tally = tallies.get(attempt.versionId) ?? {
      students: new Set<string>(),
      correct: 0,
      total: 0,
    };
    tally.students.add(attempt.person);
    tally.total += 1;
    if (attempt.correct) tally.correct += 1;
    tallies.set(attempt.versionId, tally);
  }

  const rasch = estimateRasch(
    attempts.map((attempt) => ({
      person: attempt.person,
      item: attempt.versionId,
      correct: attempt.correct,
    })),
    input.rasch,
  );

  // Elo, desde cero y en orden del tiempo
  const students = new Map<string, EloEntity>();
  const eloItems = new Map<string, EloEntity>();
  for (const attempt of [...attempts].sort(chronological)) {
    const item = bank.get(attempt.versionId);
    const result = updateElo({
      student: students.get(attempt.person) ?? { rating: 0, responses: 0 },
      item: eloItems.get(attempt.versionId) ?? {
        rating: physicianLogit(item?.physician ?? 3),
        responses: 0,
      },
      correct: attempt.correct,
    });
    students.set(attempt.person, result.student);
    eloItems.set(attempt.versionId, result.item);
  }

  // Estado de cada versión con la dificultad todavía sin enlazar. El estado no depende del enlace
  interface Draft {
    versionId: string;
    raw: { difficulty: number; se: number; component: number } | null;
    result: Omit<ItemResult, 'difficulty' | 'se'>;
  }
  const drafts: Draft[] = [...tallies.keys()].sort().map((versionId) => {
    const tally = tallies.get(versionId) as NonNullable<ReturnType<typeof tallies.get>>;
    const item = bank.get(versionId) as BankItemRow;
    const estimate = rasch.items[versionId];
    // Una estimación que no convergió no se publica
    const finite =
      rasch.converged &&
      estimate !== undefined &&
      Number.isFinite(estimate.difficulty) &&
      Number.isFinite(estimate.standardError);
    const raw = finite
      ? {
          difficulty: estimate.difficulty,
          se: estimate.standardError,
          component: estimate.component,
        }
      : null;
    // El estado se decide con el error estándar ya redondeado, el mismo que se publica
    const status = calibrationStatusWithError(
      { students: tally.students.size, standardError: raw === null ? null : round3(raw.se) },
      input.thresholds.difficulty,
      precision,
    );
    const degenerate = tally.correct === 0 || tally.correct === tally.total;
    const elo = eloItems.get(versionId);
    return {
      versionId,
      raw,
      result: {
        versionId,
        questionId: item.questionId,
        students: tally.students.size,
        elo: elo ? round3(elo.rating) : null,
        eloResponses: elo?.responses ?? 0,
        state: status.state,
        extreme:
          degenerate && tally.students.size >= input.thresholds.difficulty.provisionalResponses,
        variantReady: item.variantOf === null ? null : false,
      },
    };
  });

  // Enlace de escala, un grupo conectado a la vez
  const estimated = drafts.filter((draft) => draft.raw !== null);
  const groups = new Map<number, Draft[]>();
  for (const draft of estimated) {
    const component = (draft.raw as NonNullable<Draft['raw']>).component;
    groups.set(component, [...(groups.get(component) ?? []), draft]);
  }
  // El grupo que puede enlazarse con la escala del médico sin anclas es el único que hay o el único que
  // tiene 20 preguntas o más. Dos grupos grandes sin anclas no se pueden poner uno respecto del otro
  const big = [...groups].filter(([, group]) => group.length >= MIN_ANCHORS);
  const physicianGroup =
    groups.size === 1 ? [...groups.keys()][0] : big.length === 1 ? big[0]?.[0] : undefined;

  const shifts = new Map<number, number>();
  let anchorCount = 0;
  let reportedShift: number | null = null;
  for (const [component, group] of [...groups].sort(([a], [b]) => a - b)) {
    const anchors = group.filter((draft) => {
      const previous = bank.get(draft.versionId)?.previous;
      return (
        atLeastProvisional(draft.result.state) &&
        previous !== null &&
        previous !== undefined &&
        atLeastProvisional(previous.state) &&
        previous.difficulty !== null &&
        Number.isFinite(previous.difficulty)
      );
    });
    let shift: number;
    if (anchors.length >= MIN_ANCHORS) {
      anchorCount += anchors.length;
      shift =
        mean(anchors.map((draft) => bank.get(draft.versionId)?.previous?.difficulty ?? 0)) -
        mean(anchors.map((draft) => draft.raw?.difficulty ?? 0));
    } else if (component === physicianGroup) {
      shift =
        mean(group.map((draft) => physicianLogit(bank.get(draft.versionId)?.physician ?? 3))) -
        mean(group.map((draft) => draft.raw?.difficulty ?? 0));
    } else {
      continue;
    }
    shifts.set(component, shift);
    // En los conteos queda el desplazamiento del grupo más grande que se pudo enlazar
    reportedShift ??= shift;
  }

  // Un grupo sin enlace no publica dificultad. Vuelve a ser la estimada por el médico, con su error
  // estándar sin estimar, como cualquier pregunta que Rasch no pudo estimar
  let unlinked = 0;
  for (const draft of estimated) {
    const raw = draft.raw as NonNullable<Draft['raw']>;
    if (shifts.has(raw.component)) continue;
    unlinked += 1;
    draft.raw = null;
    draft.result.state = calibrationStatusWithError(
      { students: draft.result.students, standardError: null },
      input.thresholds.difficulty,
      precision,
    ).state;
  }

  const items = drafts.map((draft): ItemResult => ({
    ...draft.result,
    difficulty:
      draft.raw === null
        ? null
        : round3(draft.raw.difficulty + (shifts.get(draft.raw.component) as number)),
    se: draft.raw === null ? null : round3(draft.raw.se),
  }));
  return {
    items,
    counts: {
      scaleShift: round3(reportedShift ?? 0),
      anchors: anchorCount,
      raschConverged: rasch.converged ? 1 : 0,
      raschIterations: rasch.iterations,
      raschExcluded: tallies.size - estimated.length,
      raschComponents: groups.size,
      raschUnlinked: unlinked,
    },
  };
}
