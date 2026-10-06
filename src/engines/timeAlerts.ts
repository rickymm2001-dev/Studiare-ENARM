/**
 * Alertas de tiempo del examen (D-080).
 *
 * Qué hace. Decide qué aviso toca según el tiempo restante y el ritmo del alumno, para entrenar la
 * presión y la gestión del tiempo del examen real. No genera texto. La interfaz convierte cada
 * aviso en una frase y decide cómo mostrarlo.
 * Entradas. Tiempo total y transcurrido, preguntas totales y contestadas, y los avisos que ya
 * salieron.
 * Salidas. El aviso que hay que mostrar ahora, con su gravedad y sus cifras, y los que se dan por
 * consumidos.
 * Método
 *   - Por tiempo restante. Mitad, cuarto, 10, 5 y 1 minuto, solo los que caben dentro del examen,
 *     y el fin del tiempo
 *   - Por ritmo. En cada 20% del tiempo transcurrido, si va por debajo de lo esperado más una
 *     tolerancia, avisa cuántas debería llevar y el ritmo que le conviene para el resto
 *   - Cada aviso sale una sola vez. Si se cruzaron varios de golpe, por ejemplo porque la pestaña
 *     estuvo dormida, se muestra el más urgente y los demás se consumen en silencio
 * Umbrales. Mitad, cuarto, 10, 5 y 1 minutos, ritmo cada 20% y tolerancia de 5% de las preguntas
 * con mínimo de 2 (J).
 */

export type TimeAlertKind = 'halfway' | 'quarter_left' | 'minutes_left' | 'behind_pace' | 'time_up';
export type TimeAlertSeverity = 'info' | 'warning' | 'critical';

export interface TimeAlert {
  /** Estable y único por examen. Sirve para no repetir el aviso */
  id: string;
  kind: TimeAlertKind;
  severity: TimeAlertSeverity;
  remainingMs: number;
  /** Solo en minutes_left. 10, 5 o 1 */
  minutesLeft?: number;
  /** Solo en behind_pace. Cuántas preguntas debería llevar de más */
  behindBy?: number;
  /** Solo en behind_pace. Segundos por pregunta que le convienen para terminar a tiempo */
  suggestedSecondsPerQuestion?: number;
  /** Solo en behind_pace. Preguntas que le faltan por contestar */
  unanswered?: number;
}

export interface TimeAlertInput {
  totalMs: number;
  elapsedMs: number;
  totalQuestions: number;
  answeredQuestions: number;
  /** IDs de los avisos que ya salieron o se consumieron */
  fired: ReadonlySet<string>;
}

export interface TimeAlertResult {
  /** El aviso que hay que mostrar ahora, o null */
  show: TimeAlert | null;
  /** IDs que hay que agregar al conjunto de avisados, incluido el que se muestra */
  consumed: string[];
}

const MINUTE = 60_000;
/** Cada cuánto del tiempo total se revisa el ritmo */
const PACE_CHECKPOINTS = [0.2, 0.4, 0.6, 0.8];
const PACE_TOLERANCE_SHARE = 0.05;
const PACE_TOLERANCE_MIN = 2;

interface Candidate {
  id: string;
  /** Orden cronológico dentro del examen. Los más tardíos son más urgentes */
  order: number;
  /** null cuando el momento llegó pero no hay nada que avisar, como un ritmo al día */
  alert: TimeAlert | null;
}

/** Umbrales por tiempo restante, de más a menos. atMs es cuánto debe quedar para que salgan */
function remainingThresholds(totalMs: number) {
  return [
    { id: 'half', kind: 'halfway', severity: 'info', atMs: totalMs * 0.5 },
    { id: 'quarter', kind: 'quarter_left', severity: 'warning', atMs: totalMs * 0.25 },
    { id: 'min-10', kind: 'minutes_left', severity: 'warning', atMs: 10 * MINUTE, minutes: 10 },
    { id: 'min-5', kind: 'minutes_left', severity: 'warning', atMs: 5 * MINUTE, minutes: 5 },
    { id: 'min-1', kind: 'minutes_left', severity: 'critical', atMs: MINUTE, minutes: 1 },
  ] as const satisfies readonly {
    id: string;
    kind: TimeAlertKind;
    severity: TimeAlertSeverity;
    atMs: number;
    minutes?: number;
  }[];
}

export function nextTimeAlerts(input: TimeAlertInput): TimeAlertResult {
  const { totalMs, totalQuestions, fired } = input;
  if (totalMs <= 0) return { show: null, consumed: [] };
  const elapsedMs = Math.min(Math.max(input.elapsedMs, 0), totalMs);
  const remainingMs = totalMs - elapsedMs;
  const candidates: Candidate[] = [];

  for (const entry of remainingThresholds(totalMs)) {
    // Un umbral que no cabe en el examen no sale, para que nunca aparezca al empezar
    if (entry.atMs >= totalMs || fired.has(entry.id) || remainingMs > entry.atMs) continue;
    candidates.push({
      id: entry.id,
      order: totalMs - entry.atMs,
      alert: {
        id: entry.id,
        kind: entry.kind,
        severity: entry.severity,
        remainingMs,
        ...('minutes' in entry ? { minutesLeft: entry.minutes } : {}),
      },
    });
  }

  // Por ritmo, en cada checkpoint ya cruzado
  const tolerance = Math.max(PACE_TOLERANCE_MIN, Math.ceil(totalQuestions * PACE_TOLERANCE_SHARE));
  for (const checkpoint of PACE_CHECKPOINTS) {
    const id = `pace-${Math.round(checkpoint * 100)}`;
    const order = totalMs * checkpoint;
    if (fired.has(id) || elapsedMs < order) continue;
    const behindBy = Math.floor(totalQuestions * checkpoint) - input.answeredQuestions;
    const unanswered = Math.max(totalQuestions - input.answeredQuestions, 0);
    candidates.push({
      id,
      order,
      // Aunque no vaya atrasado el checkpoint se consume, para no revisarlo otra vez
      alert:
        behindBy <= tolerance
          ? null
          : {
              id,
              kind: 'behind_pace',
              severity: 'warning',
              remainingMs,
              behindBy,
              unanswered,
              suggestedSecondsPerQuestion:
                unanswered === 0 ? 0 : Math.max(1, Math.floor(remainingMs / 1000 / unanswered)),
            },
    });
  }

  if (remainingMs === 0 && !fired.has('time-up')) {
    candidates.push({
      id: 'time-up',
      order: totalMs + 1,
      alert: { id: 'time-up', kind: 'time_up', severity: 'critical', remainingMs: 0 },
    });
  }

  // Se muestra el más urgente que sí es un aviso. Todos se consumen
  const visible = candidates
    .filter((candidate) => candidate.alert !== null)
    .sort((a, b) => a.order - b.order);
  return {
    show: visible.at(-1)?.alert ?? null,
    consumed: candidates.map((candidate) => candidate.id),
  };
}
