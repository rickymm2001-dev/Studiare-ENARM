/**
 * Exposiciones y elecciones de cada opción (B14, 3.5 del plan de B14, respuesta 92).
 *
 * Qué hace. Cuenta, por versión y por opción, cuántas veces se mostró y cuántas se eligió en el primer
 * intento de cada alumno con permiso, y dice qué variantes ya tienen suficientes exposiciones para
 * entrar al examen. De aquí sale la cola de distractores que casi nadie elige, que la base marca para
 * el médico asignado con upsert_distractor_stats de B11.
 * Entradas. Los primeros intentos válidos con su pantalla de opciones, el banco y los umbrales.
 * Salidas. Una fila por opción con exposiciones, y por variante si ya está lista.
 * Método
 *   - Exposición. La primera vez que el alumno vio la pregunta, cada opción mostrada cuenta una
 *     exposición por su id estable. Elección es la opción de su primer intento
 *   - El análisis de si un distractor es no funcional (menos de 5% con 100 exposiciones o más) lo
 *     hace la base con los umbrales del admin. Aquí solo se cuenta
 *   - Variante lista. Una pregunta con variant_of entra al examen cuando cada distractor de su set
 *     canónico llega a 200 exposiciones (variantExposuresForExam, E 7.8). Solo cuentan alumnos con
 *     permiso, porque solo ellos llegan a esta noche
 * Umbrales. 200 exposiciones por distractor canónico (J).
 */
import type { Thresholds } from '@/config/thresholds';
import type { BankItemRow, FirstAttempt, OptionResult } from './types';

export function tallyExposures(input: {
  attempts: readonly FirstAttempt[];
  bank: ReadonlyMap<string, BankItemRow>;
  thresholds: Pick<Thresholds, 'sampling'>;
}): { options: OptionResult[]; variantReady: ReadonlyMap<string, boolean> } {
  const tallies = new Map<string, Map<string, { exposures: number; choices: number }>>();
  for (const attempt of input.attempts) {
    if (attempt.exposed === null) continue;
    let byOption = tallies.get(attempt.versionId);
    if (!byOption) {
      byOption = new Map();
      tallies.set(attempt.versionId, byOption);
    }
    for (const id of new Set(attempt.exposed)) {
      const tally = byOption.get(id) ?? { exposures: 0, choices: 0 };
      tally.exposures += 1;
      if (id === attempt.optionId) tally.choices += 1;
      byOption.set(id, tally);
    }
  }

  const options: OptionResult[] = [];
  for (const versionId of [...tallies.keys()].sort()) {
    const byOption = tallies.get(versionId) as NonNullable<ReturnType<typeof tallies.get>>;
    for (const optionId of [...byOption.keys()].sort()) {
      const tally = byOption.get(optionId) as NonNullable<ReturnType<typeof byOption.get>>;
      options.push({ versionId, optionId, ...tally });
    }
  }

  const variantReady = new Map<string, boolean>();
  for (const item of input.bank.values()) {
    if (item.variantOf === null) continue;
    const correct = new Set(item.options.filter((option) => option.correct).map((o) => o.id));
    const known = new Set(item.options.map((option) => option.id));
    const distractors = item.canonical.filter((id) => known.has(id) && !correct.has(id));
    const byOption = tallies.get(item.versionId);
    variantReady.set(
      item.versionId,
      distractors.length > 0 &&
        distractors.every(
          (id) =>
            (byOption?.get(id)?.exposures ?? 0) >=
            input.thresholds.sampling.variantExposuresForExam,
        ),
    );
  }
  return { options, variantReady };
}
