/**
 * Motivos de error que reportó el alumno, leídos para la calibración (B14, 3.6 y 3.7 del plan de B14).
 *
 * Qué hace. Convierte el valor guardado de un cause_reported en uno de los siete motivos de Ricardo.
 * Las ocho causas que se guardaban antes de B5 se leen con la tabla de equivalencias de errorCauses.ts.
 * Lo que no es ni un motivo ni una causa de antes, o una causa que no dice cuál de los siete fue, se
 * lee como sin motivo y no cuenta.
 * Entradas. El valor guardado, un texto.
 * Salidas. El motivo o null.
 */
import { LEGACY_CAUSE_EQUIVALENCE, isErrorMotive, type ErrorMotive } from '@/engines/errorCauses';

export function motiveOfStored(value: string): ErrorMotive | null {
  if (isErrorMotive(value)) return value;
  if (Object.hasOwn(LEGACY_CAUSE_EQUIVALENCE, value)) {
    return LEGACY_CAUSE_EQUIVALENCE[value as keyof typeof LEGACY_CAUSE_EQUIVALENCE];
  }
  return null;
}
