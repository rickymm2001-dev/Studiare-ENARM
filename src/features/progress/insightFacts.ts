// Los hechos del motor de autoconocimiento viven ahora entre los motores (src/engines/insightFacts.ts),
// porque el modelo del alumno los arma desde ahí (B14, 4.2 del plan de B14). Este archivo solo los
// sigue exportando para quien ya los importaba desde Progreso.
export { buildInsightInput, EXPECTED_BY_DIFFICULTY, type BankLookup } from '@/engines/insightFacts';
