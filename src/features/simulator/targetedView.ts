// Qué dice la opción de dirigir las opciones a las trampas del alumno (D-080, B14 4.3). Sale del modelo del
// alumno: mientras no hay errores con trampa etiquetada suficientes dice cuántos lleva y cuántos pide, y
// después ofrece las trampas a las que es propenso, de la que más atrapa a la que menos. Sin React.
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { StudentModel } from '@/data/model/contracts';
import type { InsightReport } from '@/engines/insights';
import { biasByKey, biasCalibration, biasProfileRows } from '../progress/focusItems';

export type TargetedView =
  | { kind: 'calibrating'; have: number; need: number }
  | { kind: 'none' }
  | { kind: 'ready'; tags: string[]; names: string[] };

const nameOf = (tag: string) => biasByKey.get(tag)?.name ?? tag;

/**
 * La opción según el modelo. Todas las trampas comparten el avance, que son los errores con trampa
 * etiquetada, así que basta con leer la primera que calibra. Sin trampas vistas todavía lleva cero
 */
export function targetedFromModel(model: StudentModel): TargetedView {
  const states = Object.values(model.bias.byTag);
  const waiting = states.find((state) => state.state === 'calibrating');
  if (waiting?.state === 'calibrating') {
    return { kind: 'calibrating', have: waiting.have, need: waiting.need };
  }
  if (states.length === 0) {
    return { kind: 'calibrating', have: 0, need: DEFAULT_THRESHOLDS.bias.minTaggedErrors };
  }
  const tags = model.bias.prone;
  return tags.length === 0 ? { kind: 'none' } : { kind: 'ready', tags, names: tags.map(nameOf) };
}

/** La misma opción desde el informe de Conócete, para quien todavía no pasa el modelo */
export function targetedFromReport(report: InsightReport): TargetedView {
  const calibration = biasCalibration(report);
  if (calibration) return { kind: 'calibrating', ...calibration };
  const rows = biasProfileRows(report);
  return rows.length === 0
    ? { kind: 'none' }
    : { kind: 'ready', tags: rows.map((row) => row.tag), names: rows.map((row) => row.name) };
}
