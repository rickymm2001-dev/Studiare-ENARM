/**
 * Casos completos para la práctica de inglés (B13, 2.2 del plan de B13).
 *
 * Qué hace. Elige casos de lectura completos, con todas sus preguntas y en orden. Una pregunta suelta
 * cuenta como un caso de una. A diferencia de pickQuestions, que elige preguntas y después junta las que
 * salieron de un mismo caso, aquí se elige por caso y nunca queda un texto a medias, porque en inglés
 * partir el caso dejaría preguntas sin su texto.
 * Entradas. Las preguntas elegibles con su caso y su orden en el caso, una semilla, cuántos casos se piden
 * y, si hace falta, un tope de preguntas en total, como las que le quedan hoy al plan Gratis.
 * Salidas. Las preguntas elegidas, caso por caso y en orden, cuántos casos salieron y cuántos había.
 * Método. Las preguntas se juntan en unidades por caso, las unidades se ordenan por su llave y se barajan
 * con la semilla, así el resultado no depende del orden en que lleguen las preguntas. Se toman las
 * primeras que pide el alumno. Con un tope de preguntas, la unidad que no cabe se salta y se sigue con la
 * siguiente, para llenar el tope con casos completos. Si se piden más casos de los que hay, toma todos y
 * lo dice con units y available.
 * Umbrales. Ninguno.
 */
import { createRng } from './random';

/** Lo mínimo de una pregunta para juntarla con las de su caso */
export interface CaseMember {
  id: string;
  caseId: string | null;
  caseOrder: number | null;
}

/**
 * Junta las preguntas en unidades. Una unidad es un caso seriado con sus preguntas en orden de caso, o una
 * pregunta suelta. Las unidades salen ordenadas por su llave, para que no importe el orden de entrada
 */
export function groupCaseUnits<T extends CaseMember>(questions: readonly T[]): T[][] {
  const units = new Map<string, T[]>();
  for (const question of questions) {
    // Un caso y una pregunta suelta nunca comparten llave, aunque sus ids se parezcan
    const key = question.caseId === null ? `question:${question.id}` : `case:${question.caseId}`;
    units.set(key, [...(units.get(key) ?? []), question]);
  }
  return [...units.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, unit]) =>
      unit.toSorted(
        (a, b) =>
          (a.caseOrder ?? 0) - (b.caseOrder ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      ),
    );
}

export interface PickedCases<T> {
  /** Las preguntas elegidas, caso por caso y en el orden de cada caso */
  picked: T[];
  /** Casos que salieron. Menos que los pedidos si no había suficientes o no cupieron */
  units: number;
  /** Casos que había para elegir, sin contar el tope de preguntas */
  available: number;
}

/**
 * Elige hasta cases casos completos con la semilla. Con maxItems, el total de preguntas no pasa de ese
 * tope, y un caso que no cabe se salta. Con la misma semilla y las mismas preguntas sale siempre lo mismo
 */
export function pickCaseUnits<T extends CaseMember>(
  questions: readonly T[],
  seed: string,
  cases: number,
  options: { maxItems?: number } = {},
): PickedCases<T> {
  const wanted = Number.isFinite(cases) ? Math.max(0, Math.floor(cases)) : 0;
  const units = createRng(seed).shuffle(groupCaseUnits(questions));
  const chosen: T[][] = [];
  let items = 0;
  for (const unit of units) {
    if (chosen.length >= wanted) break;
    if (options.maxItems !== undefined && items + unit.length > options.maxItems) continue;
    chosen.push(unit);
    items += unit.length;
  }
  return { picked: chosen.flat(), units: chosen.length, available: units.length };
}
