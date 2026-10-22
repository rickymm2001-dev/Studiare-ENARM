// Borrador del formulario de Ajustes del repaso (B3 del plan del cambio, comentario 4). Vino de
// StudyForm en Configuración sin cambiar cómo se guarda, así que los valores guardados se conservan.
// Funciones puras para poder probarlas solas.
import { WEEKDAY_KEYS } from '@/engines/easyDays';
import type { UserSettings } from '@/data/schemas/people';
import { fromOption, toOption } from '../intervalOptions';

/** Casillas de Al estudiar, en el orden en que se muestran */
export const STUDY_KEYS = [
  'cardConfidenceStep',
  'negationHighlightPractice',
  'negationHighlightExam',
  'errorsToReview',
] as const;

/** Porcentajes que se ofrecen para cada botón, 100 es lo que calcula FSRS */
export const SPACING_OPTIONS = [50, 75, 100, 125, 150, 200];

/** Lo que se ve en los campos. Los números van como texto mientras el alumno los escribe */
export const draftOf = (settings: UserSettings) => ({
  retention: String(Math.round(settings.desiredRetention * 100)),
  maxInterval: toOption(settings.maxIntervalDays),
  spacing: settings.spacing,
  newCards: String(settings.newCardsPerDay),
  unlimitedNewCards: settings.unlimitedNewCards,
  cardTimer: settings.cardTimer,
  easyDays: settings.easyDays,
  reviews: String(settings.reviewsPerDay),
  questions: String(settings.questionsPerDay),
  metric: settings.dailyGoal.metric,
  goal: String(settings.dailyGoal.value),
  cardConfidenceStep: settings.cardConfidenceStep,
  negationHighlightPractice: settings.negationHighlightPractice,
  negationHighlightExam: settings.negationHighlightExam,
  errorsToReview: settings.errorsToReview,
  optionsShown: settings.optionsShown,
  practiceFeedback: settings.practiceFeedback,
});
export type StudyDraft = ReturnType<typeof draftOf>;

const clamp = (value: string, min: number, max: number) =>
  Math.min(max, Math.max(min, Number(value) || min));

/** Lo que se guarda a partir del borrador, ya con los límites de cada campo */
export const patchOf = (draft: StudyDraft) => ({
  desiredRetention: clamp(draft.retention, 80, 97) / 100,
  maxIntervalDays: fromOption(draft.maxInterval),
  spacing: draft.spacing,
  newCardsPerDay: clamp(draft.newCards, 0, 500),
  unlimitedNewCards: draft.unlimitedNewCards,
  cardTimer: draft.cardTimer,
  easyDays: draft.easyDays,
  reviewsPerDay: clamp(draft.reviews, 0, 5000),
  questionsPerDay: clamp(draft.questions, 0, 1000),
  dailyGoal: { metric: draft.metric, value: clamp(draft.goal, 1, 1000) },
  cardConfidenceStep: draft.cardConfidenceStep,
  negationHighlightPractice: draft.negationHighlightPractice,
  negationHighlightExam: draft.negationHighlightExam,
  errorsToReview: draft.errorsToReview,
  optionsShown: draft.optionsShown,
  practiceFeedback: draft.practiceFeedback,
});
export type StudyPatch = ReturnType<typeof patchOf>;

/** Hay cambios si algún valor que se guardaría es distinto del guardado */
export function differs(patch: StudyPatch, settings: UserSettings): boolean {
  return (
    patch.desiredRetention !== settings.desiredRetention ||
    patch.maxIntervalDays !== settings.maxIntervalDays ||
    (['hard', 'good', 'easy'] as const).some(
      (rating) => patch.spacing[rating] !== settings.spacing[rating],
    ) ||
    patch.newCardsPerDay !== settings.newCardsPerDay ||
    patch.unlimitedNewCards !== settings.unlimitedNewCards ||
    patch.cardTimer.enabled !== settings.cardTimer.enabled ||
    patch.cardTimer.seconds !== settings.cardTimer.seconds ||
    patch.cardTimer.autoReveal !== settings.cardTimer.autoReveal ||
    WEEKDAY_KEYS.some((day) => patch.easyDays[day] !== settings.easyDays[day]) ||
    patch.reviewsPerDay !== settings.reviewsPerDay ||
    patch.questionsPerDay !== settings.questionsPerDay ||
    patch.dailyGoal.metric !== settings.dailyGoal.metric ||
    patch.dailyGoal.value !== settings.dailyGoal.value ||
    STUDY_KEYS.some((key) => patch[key] !== settings[key]) ||
    patch.optionsShown !== settings.optionsShown ||
    patch.practiceFeedback !== settings.practiceFeedback
  );
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Junta un cambio que llegó de fuera con lo que el alumno está escribiendo. En el mismo panel, la
 * sugerencia de nuevas y el perfil guía guardan al momento. Cada campo que el alumno no ha tocado
 * toma el valor nuevo y los que sí tocó se quedan como él los dejó, para no pisar su borrador ni
 * dejar un borrador viejo que al guardar deshaga la sugerencia
 */
export function mergeDraft(base: StudyDraft, draft: StudyDraft, incoming: StudyDraft): StudyDraft {
  const merged = { ...draft };
  for (const key of Object.keys(incoming) as (keyof StudyDraft)[]) {
    if (same(draft[key], base[key])) Object.assign(merged, { [key]: incoming[key] });
  }
  return merged;
}

/** Si dos borradores dicen lo mismo, campo por campo */
export const sameDraft = (a: StudyDraft, b: StudyDraft): boolean => same(a, b);
