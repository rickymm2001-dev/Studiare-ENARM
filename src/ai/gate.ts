// La compuerta 1 vista desde la app (B12, 5.5 y 3.5). Dice si un alumno ve un motor de IA, si no
// porque la compuerta sigue cerrada o porque no hay IA, y se lo dice a la pantalla para que esconda
// el botón y muestre el aviso que toca. La compuerta solo aplica a alumnos. Médicos, admins y dueño
// siguen usando todo para auditar y para su cola. La hace cumplir el servidor, esto solo evita ofrecer
// lo que el servidor va a negar. Sin React.
import type { AiEngine } from '@/engines/aiContracts';
import type { Role } from '@/data/schemas/common';
import type { AiStatus } from './client';

export type EngineAccess =
  /** Se puede usar */
  | 'open'
  /** Cerrado para alumnos hasta que dos médicos terminen de revisarlo */
  | 'gated'
  /** Solo médicos y administradores, como las preguntas reestructuradas */
  | 'staff_only'
  /** No hay IA. En producción la app usa su plantilla sin decir IA */
  | 'unavailable'
  /** Todavía no se sabe */
  | 'checking'
  | 'offline';

export const isStaffRole = (role: Role) => role !== 'student';

/** Cómo está un motor para quien lo pide, según lo que dijo el proxy */
export function engineAccess(status: AiStatus, engine: AiEngine, role: Role): EngineAccess {
  if (engine === 'restructure' && !isStaffRole(role)) return 'staff_only';
  switch (status.kind) {
    case 'checking':
    case 'offline':
    case 'unavailable':
      return status.kind;
    case 'no-proxy':
      // Respuestas fijas del cliente, en desarrollo y en la demo. No hay compuerta que cuidar
      return 'open';
    case 'real':
    case 'mock':
      if (isStaffRole(role) || status.engines === undefined) return 'open';
      return status.engines[engine] === 'open' ? 'open' : 'gated';
  }
}

/** El alumno, el médico o el admin pueden pedirle este motor a la IA ahora */
export const engineOpenFor = (status: AiStatus, engine: AiEngine, role: Role): boolean =>
  engineAccess(status, engine, role) === 'open';

/**
 * Cómo está una función que usa varios motores, como el Tutor. Está abierta si alguno lo está. Si
 * ninguno, dice por qué, con el motivo de más peso primero
 */
export function featureAccess(
  status: AiStatus,
  engines: readonly AiEngine[],
  role: Role,
): EngineAccess {
  const all = engines.map((engine) => engineAccess(status, engine, role));
  for (const reason of [
    'open',
    'checking',
    'offline',
    'unavailable',
    'gated',
    'staff_only',
  ] as const) {
    if (all.includes(reason)) return reason;
  }
  return 'unavailable';
}
