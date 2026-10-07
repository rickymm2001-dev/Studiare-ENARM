// Lo que muestran los focos de la semana, sin pintar nada. Lo usan Progreso y el informe semanal del
// tutor, así dicen lo mismo. Cada foco sale del informe de Conócete, ya ordenado por peso, o de la
// subespecialidad más débil, y lleva al lugar donde se practica.
import { screenPath } from '@/app/screens';
import { biasTaxonomy, biasTips, topicTaxonomy } from '@/demo/content';
import type { Insight, InsightReport } from '@/engines/insights';
import { t } from '@/i18n/es-MX';

const text = t.insights;
export const biasByKey = new Map(biasTaxonomy.biases.map((bias) => [bias.key, bias]));
export const tipByKey = new Map(biasTips.tips.map((tip) => [tip.biasKey, tip.tip]));

/**
 * Título, frase y acción de un hallazgo listo. draft es true cuando la acción es un consejo por
 * sesgo, que es un texto base pendiente de revisión médica y tiene que decirlo (8.5)
 */
export function describeInsight(insight: Insight): {
  title: string;
  body: string;
  action: string;
  draft: boolean;
} {
  const state = insight.state;
  const values = state.kind === 'ready' ? state.values : {};
  const refs = state.kind === 'ready' ? state.refs : {};
  const level = state.kind === 'ready' ? state.level : 'watch';
  if (insight.id.startsWith('bias:')) {
    const tag = insight.id.slice(5);
    const bias = biasByKey.get(tag);
    return {
      title: bias?.name ?? tag,
      body: `${text.biasText(values.attraction ?? 0, values.baseline ?? 0)} ${bias?.distractorDefinition ?? ''}`,
      action: tipByKey.get(tag) ?? text.biasFallbackAction,
      draft: true,
    };
  }
  const copy = text.copy[insight.id];
  if (!copy) return { title: insight.id, body: '', action: '', draft: false };
  return {
    title: copy.title,
    body: copy.text(values, refs, level),
    action: copy.action(values, refs, level),
    draft: false,
  };
}

/** Dónde se practica cada foco. Los hábitos de repaso van a Repasar y lo demás al simulador */
export function practiceLink(insightId: string): { to: string; review: boolean } {
  if (insightId === 'negation')
    return { to: `${screenPath('simulatorSetup')}?structure=negative`, review: false };
  if (['retention', 'leeches', 'consistency', 'session_length'].includes(insightId))
    return { to: screenPath('review'), review: true };
  return { to: screenPath('simulatorSetup'), review: false };
}

export interface WeakTopic {
  key: string;
  name: string;
  /** Clave de la rama troncal, para filtrar */
  branch: string;
  branchName: string;
  mastery: number;
}

export interface FocusItem {
  key: string;
  /** Técnica o tema, con la rama si es un tema */
  kind: string;
  title: string;
  /** Qué hacer */
  action: string;
  /** La acción es un consejo base pendiente de revisión médica */
  draft: boolean;
  /** Dónde practicarlo */
  to: string;
  /** El atajo lleva a Repasar y no al simulador */
  review: boolean;
}

/**
 * Hasta 3 focos, mezclando técnica (los focos del informe, ya ordenados por peso) y la
 * subespecialidad más débil cuando hay una con dominio bajo
 */
export function weeklyFocusItems(
  report: InsightReport,
  weakTopics: readonly WeakTopic[],
): FocusItem[] {
  const technique = report.focus.slice(0, weakTopics.length > 0 ? 2 : 3);
  const topics = weakTopics.slice(0, 3 - technique.length);
  return [
    ...technique.map((insight: Insight): FocusItem => {
      const { title, action, draft } = describeInsight(insight);
      return {
        key: insight.id,
        kind: t.progress.focusKinds.technique,
        title,
        action,
        draft,
        ...practiceLink(insight.id),
      };
    }),
    ...topics.map((topic): FocusItem => ({
      key: topic.key,
      kind: `${t.progress.focusKinds.topic} · ${topic.branchName}`,
      title: topic.name,
      action: t.progress.weakTopic(Math.round(topic.mastery * 100)),
      draft: false,
      to: `${screenPath('simulatorSetup')}?topic=${encodeURIComponent(topic.key)}`,
      review: false,
    })),
  ];
}

export interface BiasProfileRow {
  tag: string;
  name: string;
  /** Qué parte de las veces que aparece al fallar lo elige, de 0 a 1 */
  share: number;
  /** Ya es un patrón y no solo parte de su perfil */
  pattern: boolean;
}

/** Los tipos de distractor que más le atraen al alumno, hasta tres. Vacío mientras calibra */
export function biasProfileRows(report: InsightReport): BiasProfileRow[] {
  const profile = report.insights.find((insight) => insight.id === 'bias_profile');
  if (profile?.state.kind !== 'ready') return [];
  const { values, refs } = profile.state;
  const patterns = new Set(
    report.insights.flatMap((insight) =>
      insight.id.startsWith('bias:') && insight.state.kind === 'ready' ? [insight.id.slice(5)] : [],
    ),
  );
  return [0, 1, 2].flatMap((index) => {
    const tag = refs[`tag${index}`];
    return tag
      ? [
          {
            tag,
            name: biasByKey.get(tag)?.name ?? tag,
            share: values[`share${index}`] ?? 0,
            pattern: patterns.has(tag),
          },
        ]
      : [];
  });
}

/** Las trampas a las que dirigir las opciones, de la que más atrapa a la que menos. Vacío mientras calibra */
export function targetBiasTags(report: InsightReport): string[] {
  return biasProfileRows(report).map((row) => row.tag);
}

/** Cuántos errores con trampa etiquetada lleva y cuántos pide el perfil. null si ya no calibra */
export function biasCalibration(report: InsightReport): { have: number; need: number } | null {
  const state = report.insights.find((insight) => insight.id === 'biases')?.state;
  return state?.kind === 'calibrating' ? { have: state.have, need: state.need } : null;
}

/** Dominio por debajo del cual una subespecialidad cuenta como débil */
export const WEAK_TOPIC_BELOW = 0.6;

/**
 * Subespecialidades con dominio bajo, de la más débil a la menos. Solo entran las que ya tienen
 * respuestas suficientes, las que calibran no cuentan
 */
export function weakTopicsFrom(
  byTopic: ReadonlyMap<string, { state: { kind: string; mastery?: number } }>,
): WeakTopic[] {
  return topicTaxonomy.branches
    .flatMap((branch) =>
      branch.topics.flatMap((topic) => {
        const state = byTopic.get(topic.key)?.state;
        return state?.kind === 'ready' &&
          state.mastery !== undefined &&
          state.mastery < WEAK_TOPIC_BELOW
          ? [
              {
                key: topic.key,
                name: topic.name,
                branch: branch.key,
                branchName: branch.name,
                mastery: state.mastery,
              },
            ]
          : [];
      }),
    )
    .sort((a, b) => a.mastery - b.mastery);
}
