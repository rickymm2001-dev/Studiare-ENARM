import { WEEKDAY_KEYS } from '@/engines/easyDays';
import type { UserSettings } from '@/data/schemas/people';
import { fromOption, toOption } from './intervalOptions';

export const STUDY_KEYS = [
  'cardConfidenceStep',
  'negationHighlightPractice',
  'negationHighlightExam',
  'errorsToReview',
] as const;

export const draftOf = (settings: UserSettings) => ({
  retention: String(Math.round(settings.desiredRetention * 100)),
  maxInterval: toOption(settings.maxIntervalDays),
  spacing: settings.spacing,
  cardTimer: settings.cardTimer,
  easyDays: settings.easyDays,
  metric: settings.dailyGoal.metric,
  goal: String(settings.dailyGoal.value),
  cardConfidenceStep: settings.cardConfidenceStep,
  negationHighlightPractice: settings.negationHighlightPractice,
  negationHighlightExam: settings.negationHighlightExam,
  errorsToReview: settings.errorsToReview,
  optionsShown: settings.optionsShown,
  practiceFeedback: settings.practiceFeedback,
  pomodoro: settings.pomodoro,
  emailReminders: settings.emailReminders,
});

export type ReviewSettingsDraft = ReturnType<typeof draftOf>;

const clamp = (value: string, min: number, max: number) =>
  Math.min(max, Math.max(min, Number(value) || min));

export const patchOf = (draft: ReviewSettingsDraft) => ({
  desiredRetention: clamp(draft.retention, 80, 97) / 100,
  maxIntervalDays: fromOption(draft.maxInterval),
  spacing: draft.spacing,
  cardTimer: draft.cardTimer,
  easyDays: draft.easyDays,
  dailyGoal: { metric: draft.metric, value: clamp(draft.goal, 1, 1000) },
  cardConfidenceStep: draft.cardConfidenceStep,
  negationHighlightPractice: draft.negationHighlightPractice,
  negationHighlightExam: draft.negationHighlightExam,
  errorsToReview: draft.errorsToReview,
  optionsShown: draft.optionsShown,
  practiceFeedback: draft.practiceFeedback,
  pomodoro: draft.pomodoro,
  emailReminders: draft.emailReminders,
});

export function differs(patch: ReturnType<typeof patchOf>, settings: UserSettings): boolean {
  return (
    patch.desiredRetention !== settings.desiredRetention ||
    patch.maxIntervalDays !== settings.maxIntervalDays ||
    (['hard', 'good', 'easy'] as const).some(
      (rating) => patch.spacing[rating] !== settings.spacing[rating],
    ) ||
    patch.cardTimer.enabled !== settings.cardTimer.enabled ||
    patch.cardTimer.seconds !== settings.cardTimer.seconds ||
    patch.cardTimer.autoReveal !== settings.cardTimer.autoReveal ||
    WEEKDAY_KEYS.some((day) => patch.easyDays[day] !== settings.easyDays[day]) ||
    patch.dailyGoal.metric !== settings.dailyGoal.metric ||
    patch.dailyGoal.value !== settings.dailyGoal.value ||
    STUDY_KEYS.some((key) => patch[key] !== settings[key]) ||
    patch.optionsShown !== settings.optionsShown ||
    patch.practiceFeedback !== settings.practiceFeedback ||
    patch.pomodoro.focusMinutes !== settings.pomodoro.focusMinutes ||
    patch.pomodoro.shortBreakMinutes !== settings.pomodoro.shortBreakMinutes ||
    patch.pomodoro.longBreakMinutes !== settings.pomodoro.longBreakMinutes ||
    patch.pomodoro.cyclesBeforeLong !== settings.pomodoro.cyclesBeforeLong ||
    patch.pomodoro.sound !== settings.pomodoro.sound ||
    patch.pomodoro.notifications !== settings.pomodoro.notifications ||
    patch.emailReminders.enabled !== settings.emailReminders.enabled ||
    patch.emailReminders.time !== settings.emailReminders.time
  );
}
