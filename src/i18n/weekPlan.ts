// Textos de la semana de Progreso (comentario 13 del plan del cambio, B3). La pantalla del
// planificador se quitó y su semana con lo planeado contra lo hecho pasó a Progreso. Los textos
// que siguen igual se toman de t.planner y aquí van solo los nuevos. Se integra en t desde
// es-MX.ts como weekPlan.
import { plural } from './features';

export const weekPlanText = {
  hint: 'Lo que tu plan pone en cada uno de los próximos 7 días con tus mazos y tu tiempo, contra lo que ya hiciste. Lo que estudias hoy se descuenta de lo que te falta.',
  loading: 'Cargando tu semana',
  daysLabel: 'Días de la semana',
  planned: 'Planeado',
  toDo: 'Por hacer',
  done: 'Hecho',
  doneMinutes: (n: number) => `${n.toLocaleString('es-MX')} min`,
  doneCards: (n: number) => plural(n, 'tarjeta', 'tarjetas'),
  doneQuestions: (n: number) => plural(n, 'pregunta', 'preguntas'),
  nothingDone: 'Todavía nada',
  timeCovered: 'Ya cubriste tu tiempo de hoy',
};
