// El modelo del alumno listo para pintar (B14, 4.2 del plan). Esqueleto del Paso 0: devuelve undefined,
// como un modelo que todavía carga, para que B (el modo adaptativo y TargetedSamplingField en Simular)
// y C puedan trabajar contra la firma desde el principio. Mientras sea undefined, el adaptativo dice
// calibrando. C lo llena con buildStudentModel (src/engines/studentModel.ts), diferido y memorizado por
// la bitácora, como useAnalysis hoy
import type { StudentModel } from '@/data/model/contracts';
import type { ReadySession } from '../shared/RequireSession';

export function useStudentModel(_session: ReadySession): StudentModel | undefined {
  return undefined;
}
