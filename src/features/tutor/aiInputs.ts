// Arma lo que se le manda a cada motor de IA del tutor a partir de lo que la app ya calculó (8.2,
// 8.3, 8.5). Solo viaja texto del banco y de las tarjetas del alumno, ya sin su nombre, y cifras que
// la app calculó. Nada de texto libre del alumno. Si no hay con qué armar la entrada, no se llama.
import type { BiasTipInput, HypothesisInput, WeeklyReportInput } from '@/engines/aiContracts';
import { TOPIC_NAMES } from '../shared/topics';
import type { Hypothesis } from './tutorModel';
import type { BiasTip } from './tutorView';
import type { WeeklyReport } from './weeklyReport';

const clip = (text: string, max: number) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
};

/** Texto del banco o de una tarjeta, o undefined si ya no está */
export interface ItemTexts {
  textOf: (kind: 'question' | 'card', itemId: string) => string | undefined;
}

export const MIN_HYPOTHESIS_EVIDENCE = 2;
const MAX_EVIDENCE = 12;

export function hypothesisInputFrom(
  hypothesis: Hypothesis,
  texts: ItemTexts,
): HypothesisInput | null {
  const evidence = hypothesis.items.flatMap((item) => {
    const text = texts.textOf(item.kind, item.itemId);
    return text ? [{ ref: item.eventId, kind: item.kind, text: clip(text, 800) }] : [];
  });
  if (evidence.length < MIN_HYPOTHESIS_EVIDENCE) return null;
  return {
    rule: hypothesis.rule as HypothesisInput['rule'],
    area: clip(TOPIC_NAMES.get(hypothesis.area) ?? hypothesis.area, 80),
    recentFindings: hypothesis.recentFindings,
    evidence: evidence.slice(0, MAX_EVIDENCE),
    causesReported: hypothesis.causesReported,
    causeMismatches: hypothesis.causeMismatches,
    allowedActions: [...hypothesis.actions],
  };
}

/** Los refs del informe tal como se mandan, para ligar cada prioridad con su texto de la IA */
export const reportRefOf = (key: string) =>
  key.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 64) || 'prioridad';

export function weeklyReportInputFrom(
  report: WeeklyReport,
  answersThisWeek: number,
): WeeklyReportInput | null {
  if (!report.ready || report.priorities.length === 0) return null;
  return {
    answers: Math.min(answersThisWeek, 100_000),
    priorities: report.priorities.slice(0, 3).map((item) => ({
      ref: reportRefOf(item.key),
      title: clip(item.title, 120),
      detail: clip(item.action, 300),
    })),
    habit: report.habit
      ? {
          ref: 'habito',
          title: clip(report.habit.title, 120),
          detail: clip(report.habit.text, 300),
        }
      : null,
    challenge: report.challenge
      ? {
          ref: 'reto',
          title: clip(report.challenge.title, 120),
          detail: clip(report.challenge.text, 300),
        }
      : null,
  };
}

export function biasTipInputFrom(tip: BiasTip, texts: ItemTexts): BiasTipInput | null {
  if (tip.tip.trim() === '') return null;
  const examples = tip.examples.flatMap((questionId) => {
    const text = texts.textOf('question', questionId);
    return text ? [{ ref: questionId, text: clip(text, 600) }] : [];
  });
  if (examples.length < 2) return null;
  return {
    biasKey: clip(tip.tag, 60),
    biasLabel: clip(tip.name, 80),
    baseTip: clip(tip.tip, 500),
    examples: examples.slice(0, 3),
  };
}
