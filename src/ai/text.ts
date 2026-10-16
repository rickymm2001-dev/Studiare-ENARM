// Los textos de la IA que dependen de su estado (B12, 3.5). Sin React, para que las pantallas y las
// pruebas los usen igual.
import { t } from '@/i18n/es-MX';
import type { AiStatus } from './client';
import type { EngineAccess } from './gate';

/** La explicación del modo. Una función que responde sin IA se explica distinto a una que no responde */
export const aiDetailText = (status: AiStatus): string =>
  status.kind === 'unavailable' && status.reachable
    ? t.ai.detailReachable
    : t.ai.detail[status.kind];

/**
 * Por qué un motor de IA no se ofrece ahora, o null si se puede usar. Con la compuerta cerrada el
 * botón no aparece para los alumnos y se ve este aviso. gatedText cambia según la función
 */
export function accessNotice(
  access: EngineAccess,
  gatedText: string = t.ai.access.gated,
): string | null {
  switch (access) {
    case 'open':
      return null;
    case 'gated':
      return gatedText;
    case 'staff_only':
      return t.ai.access.staffOnly;
    case 'unavailable':
      return t.ai.access.unavailable;
    case 'offline':
      return t.ai.access.offline;
    case 'checking':
      return t.ai.access.checking;
  }
}
