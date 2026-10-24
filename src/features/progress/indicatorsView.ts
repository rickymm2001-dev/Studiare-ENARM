// Los seis indicadores clave de Progreso (D-150), listos para pintar y sin React. Cada uno sale
// del informe de Conócete o de las respuestas que ya calculó el modelo del alumno, así dice lo mismo
// que las filas de abajo. Mientras un motor calibra, el indicador lo dice con cuánto falta, y nunca
// hay una cifra inventada. La posición en la barra de rango va de 0 a 100 y la explica cada caso.
import type { FatigueValidationState } from '@/data/model/contracts';
import { NOMINAL_CONFIDENCE } from '@/engines/behavior';
import { ENARM_SECONDS_PER_ITEM, INSIGHT_MINIMUMS, type InsightReport } from '@/engines/insights';
import { t } from '@/i18n/es-MX';
import type { RangeZone } from '@/ui/charts/range-bar';
import type { IndicatorTone } from '@/ui/components/indicator-card';

const text = t.progress.indicators;

/** El dominio que cuenta como meta, el verde de los puntos de dominio (masteryChip.ts) */
export const MASTERY_GOAL = 75;
/** Debajo de esto el dominio va en rojo, como en los puntos */
const MASTERY_LOW = 60;

export type IndicatorKey = 'retention' | 'accuracy' | 'pace' | 'confidence' | 'fatigue' | 'changes';

export const INDICATOR_KEYS: readonly IndicatorKey[] = [
  'retention',
  'accuracy',
  'pace',
  'confidence',
  'fatigue',
  'changes',
];

type Zones = readonly [RangeZone, RangeZone, RangeZone];

export type IndicatorRow =
  | {
      key: IndicatorKey;
      kind: 'ready';
      value: string;
      unit: string;
      state: string;
      tone: IndicatorTone;
      note: string;
      zones: Zones;
      /** Dónde va el marcador, de 0 a 100 */
      position: number;
    }
  | { key: IndicatorKey; kind: 'calibrating'; note: string; have: number; need: number };

const clamp = (value: number) => Math.min(Math.max(value, 0), 100);
const pct = (value: number) => Math.round(value * 100);

/** Lo bueno a la derecha, para lo que sube cuando mejora */
const UPWARD: Zones = ['bad', 'mid', 'good'];
/** Lo bueno a la izquierda, para lo que baja cuando mejora */
const DOWNWARD: Zones = ['good', 'mid', 'bad'];

export function indicatorRows(input: {
  report: InsightReport;
  /** Cuántas respuestas y cuántas correctas tiene el alumno en total */
  answers: { total: number; correct: number };
  /** La retención que pide el alumno a FSRS, de 0 a 1 */
  desiredRetention: number;
  /** El estado global del detector de fatiga, que viene del modelo del alumno */
  fatigueValidation?: FatigueValidationState;
}): IndicatorRow[] {
  const { report, answers, desiredRetention, fatigueValidation = 'validated' } = input;
  const insight = (id: string) => report.insights.find((item) => item.id === id);
  const rows: IndicatorRow[] = [];

  // Retención de tarjetas maduras contra la deseada
  const retention = insight('retention');
  const desiredPercent = pct(desiredRetention);
  if (retention?.state.kind === 'ready') {
    const value = pct(retention.state.values.retention ?? 0);
    const level = retention.state.level;
    rows.push({
      key: 'retention',
      kind: 'ready',
      value: String(value),
      unit: text.units.percent,
      state:
        level === 'strength'
          ? text.states.optimal
          : level === 'watch'
            ? text.states.near
            : text.states.below,
      tone: level === 'strength' ? 'good' : 'near',
      note: text.notes.retention(desiredPercent),
      zones: UPWARD,
      position: value,
    });
  } else {
    rows.push(calibratingRow('retention', retention?.state, INSIGHT_MINIMUMS.reviews, 'reviews'));
  }

  // Aciertos de todas las respuestas contra la meta de dominio
  if (answers.total >= INSIGHT_MINIMUMS.answers) {
    const value = Math.round((answers.correct / answers.total) * 100);
    rows.push({
      key: 'accuracy',
      kind: 'ready',
      value: String(value),
      unit: text.units.percent,
      state:
        value >= MASTERY_GOAL
          ? text.states.optimalM
          : value >= MASTERY_LOW
            ? text.states.near
            : text.states.below,
      tone: value >= MASTERY_GOAL ? 'good' : 'near',
      note: text.notes.accuracy(MASTERY_GOAL),
      zones: UPWARD,
      position: value,
    });
  } else {
    rows.push({
      key: 'accuracy',
      kind: 'calibrating',
      have: answers.total,
      need: INSIGHT_MINIMUMS.answers,
      note: t.insights.calibrating(answers.total, INSIGHT_MINIMUMS.answers, 'answers'),
    });
  }

  // Tiempo por pregunta contra los 77 segundos del ENARM. El marcador llega al tope al doble del ritmo
  const pace = insight('pace');
  if (pace?.state.kind === 'ready') {
    const seconds = Math.round(pace.state.values.seconds ?? 0);
    const target = pace.state.values.target ?? ENARM_SECONDS_PER_ITEM;
    const level = pace.state.level;
    rows.push({
      key: 'pace',
      kind: 'ready',
      value: String(seconds),
      unit: text.units.seconds,
      state:
        level === 'strength'
          ? text.states.optimalM
          : level === 'watch'
            ? text.states.slow
            : text.states.verySlow,
      tone: level === 'strength' ? 'good' : 'near',
      note: text.notes.pace(target),
      zones: DOWNWARD,
      position: clamp((seconds / (target * 2)) * 100),
    });
  } else {
    rows.push(calibratingRow('pace', pace?.state, INSIGHT_MINIMUMS.answers, 'answers'));
  }

  // Confianza. Cuánto aciertas cuando dices Seguro, contra lo que esa palabra promete
  const confidence = insight('confidence');
  if (confidence?.state.kind === 'ready') {
    const sure = pct(confidence.state.values.sure ?? 0);
    const label = confidence.state.refs.label;
    rows.push({
      key: 'confidence',
      kind: 'ready',
      value: String(sure),
      unit: text.units.percent,
      state:
        label === 'overconfident'
          ? text.states.overconfident
          : label === 'underconfident'
            ? text.states.underconfident
            : text.states.calibrated,
      tone: label === 'overconfident' ? 'near' : label === 'underconfident' ? 'info' : 'good',
      note: text.notes.confidence(pct(NOMINAL_CONFIDENCE.sure)),
      zones: UPWARD,
      position: sure,
    });
  } else {
    rows.push(calibratingRow('confidence', confidence?.state, INSIGHT_MINIMUMS.answers, 'answers'));
  }

  // Fatiga. La caída de la exactitud ajustada del último tercio en las sesiones largas, en puntos. El
  // marcador parte del centro sin caída y llega al tope con 20 puntos de caída
  const fatigue = insight('fatigue');
  if (fatigue?.state.kind === 'ready') {
    const drop = Math.round(-(fatigue.state.values.drop ?? 0) * 100);
    const sessions = fatigue.state.values.sessions ?? 0;
    const fatigued = fatigue.state.level === 'focus';
    rows.push({
      key: 'fatigue',
      kind: 'ready',
      value: String(Math.max(drop, 0)),
      unit: text.units.points,
      state: fatigued ? text.states.likely : text.states.noSignal,
      tone: fatigued ? 'near' : 'good',
      note: text.notes.fatigue(sessions),
      zones: DOWNWARD,
      position: clamp(50 + drop * 2.5),
    });
  } else {
    const row = calibratingRow('fatigue', fatigue?.state, 3, 'sessions');
    // Mientras el detector se valida con los datos de todos, el motivo no es cuánto lleva el alumno (B14, 3.6)
    rows.push(
      fatigueValidation === 'validated' ? row : { ...row, note: text.notes.fatigueUnvalidated },
    );
  }

  // Cambios de respuesta. Qué parte de los cambios pasó de una correcta a una incorrecta
  const changes = insight('changes');
  if (changes?.state.kind === 'ready') {
    const total = changes.state.values.total ?? 0;
    const worse = changes.state.values.toIncorrect ?? 0;
    const value = total > 0 ? Math.round((worse / total) * 100) : 0;
    const level = changes.state.level;
    rows.push({
      key: 'changes',
      kind: 'ready',
      value: String(value),
      unit: text.units.percent,
      state:
        level === 'strength'
          ? text.states.optimalM
          : level === 'watch'
            ? text.states.watch
            : text.states.harmful,
      tone: level === 'strength' ? 'good' : 'near',
      note: text.notes.changes(worse, total),
      zones: DOWNWARD,
      position: value,
    });
  } else {
    rows.push(calibratingRow('changes', changes?.state, INSIGHT_MINIMUMS.changes, 'changes'));
  }

  return rows;
}

function calibratingRow(
  key: IndicatorKey,
  state: InsightReport['insights'][number]['state'] | undefined,
  fallbackNeed: number,
  fallbackUnit: 'answers' | 'reviews' | 'sessions' | 'changes',
): IndicatorRow {
  const have = state?.kind === 'calibrating' ? state.have : 0;
  const need = state?.kind === 'calibrating' ? state.need : fallbackNeed;
  const unit = state?.kind === 'calibrating' ? state.unit : fallbackUnit;
  return {
    key,
    kind: 'calibrating',
    have: Math.min(have, need),
    need,
    note: t.insights.calibrating(Math.min(have, need), need, unit),
  };
}
