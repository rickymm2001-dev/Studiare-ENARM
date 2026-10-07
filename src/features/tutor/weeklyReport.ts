// Informe semanal del tutor con plantilla fija (8.3). Combina lo que ya calcularon Conócete y
// Progreso en tres prioridades, un hábito y un reto, sin texto libre y sin IA. Las secciones que
// siguen calibrando no aparecen. La IA de la Fase D llenará este mismo molde. Sin React ni Dexie.
import { screenPath } from '@/app/screens';
import { INSIGHT_MINIMUMS, type Insight, type InsightReport } from '@/engines/insights';
import { t } from '@/i18n/es-MX';
import {
  describeInsight,
  practiceLink,
  weeklyFocusItems,
  type FocusItem,
  type WeakTopic,
} from '../progress/focusItems';

export interface ReportLine {
  title: string;
  text: string;
  to: string;
  review: boolean;
}

export type WeeklyReport =
  | { ready: false; have: number; need: number }
  | {
      ready: true;
      priorities: FocusItem[];
      habit: ReportLine | null;
      challenge: ReportLine | null;
    };

const urgency = (insight: Insight) =>
  insight.state.kind === 'ready' && insight.state.level === 'focus' ? 0 : 1;

export function weeklyReport(
  report: InsightReport,
  weakTopics: readonly WeakTopic[],
): WeeklyReport {
  const have = report.totals.answers;
  const need = INSIGHT_MINIMUMS.answers;
  if (have < need) return { ready: false, have, need };

  // El hábito es la lectura de cómo estudia que más pide atención
  const study = report.insights
    .filter(
      (insight) =>
        insight.area === 'study' &&
        insight.state.kind === 'ready' &&
        insight.state.level !== 'strength',
    )
    .sort((a, b) => urgency(a) - urgency(b) || b.weight - a.weight)[0];
  const habit: ReportLine | null = study
    ? {
        title: describeInsight(study).title,
        text: describeInsight(study).action,
        ...practiceLink(study.id),
      }
    : null;

  // El reto es practicar el tema más débil o, si no hay, la técnica de negaciones cuando es un foco
  const weakest = weakTopics[0];
  const negation = report.focus.find((insight) => insight.id === 'negation');
  const challenge: ReportLine | null = weakest
    ? {
        title: t.tutor.report.challengeTopic(weakest.name),
        text: t.tutor.report.challengeTopicText,
        to: `${screenPath('simulatorSetup')}?topic=${encodeURIComponent(weakest.key)}`,
        review: false,
      }
    : negation
      ? {
          title: t.tutor.report.challengeNegation,
          text: t.tutor.report.challengeNegationText,
          ...practiceLink('negation'),
        }
      : null;

  return { ready: true, priorities: weeklyFocusItems(report, weakTopics), habit, challenge };
}
