// Casos de evaluación armados con un banco de preguntas (B12, 4.2 del plan). 10 por motor, elegidos
// con una semilla fija para que cada corrida use los mismos. Sirve para el banco de demostración, que
// ya está en el repositorio, y para el banco real exportado, que vive en private/ (bankFile.ts) y
// nunca entra al repositorio. Los textos son los del banco tal cual, imperfecciones incluidas
// (D-080), y las referencias son las claves de las preguntas, nunca datos de alumnos.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  HYPOTHESIS_RULES,
  RESTRUCTURE_TRANSFORMS,
  type BiasTipInput,
  type BiasVocabulary,
  type HypothesisInput,
  type RestructureInput,
  type WeeklyReportInput,
} from '../../src/engines/aiContracts.ts';
import { RULE_ACTIONS, type CaseSet, type GoldenCase } from './cases.ts';

export interface BankOption {
  label: string;
  text: string;
  isKey: boolean;
  /** La trampa que etiquetó el médico en un distractor, o null */
  bias: string | null;
}

export interface BankQuestion {
  /** La clave de la pregunta, que viaja como referencia */
  key: string;
  /** El tema, para agrupar las hipótesis */
  topic: string;
  /** El nombre del subtema o del tema que ve el alumno */
  area: string;
  /** Viñeta y pregunta */
  stem: string;
  options: BankOption[];
  explanation: string;
}

export interface BankBias {
  key: string;
  label: string;
  /** El texto base del consejo, aprobado o editado por un médico en el banco real */
  baseTip: string;
}

export interface BankSource {
  set: Extract<CaseSet, 'demo' | 'bank'>;
  questions: BankQuestion[];
  biases: BankBias[];
}

export const CASES_PER_ENGINE = 10;
export const BANK_SEED = 20261015;

// ---------------------------------------------------------------------------------------------
// Banco de demostración

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DEMO_DIR = join(ROOT, 'src/demo/content');

const DemoOptionSchema = z.object({
  key: z.string(),
  text: z.string(),
  correct: z.boolean(),
  bias: z.string().nullable().optional(),
});
const DemoQuestionSchema = z.object({
  key: z.string(),
  caseKey: z.string().nullable(),
  topic: z.string(),
  subtopic: z.string(),
  vignette: z.string(),
  prompt: z.string(),
  options: z.array(DemoOptionSchema),
  canonical: z.array(z.string()).optional(),
  explanation: z.string(),
});
const DemoBatchSchema = z.object({
  cases: z.array(z.object({ key: z.string(), vignette: z.string() })),
  questions: z.array(DemoQuestionSchema),
});
const TaxonomySchema = z.object({
  branches: z.array(
    z.object({
      topics: z.array(
        z.object({
          key: z.string(),
          name: z.string(),
          subtopics: z.array(z.object({ key: z.string(), name: z.string() })),
        }),
      ),
    }),
  ),
});
const BiasTaxonomySchema = z.object({
  biases: z.array(z.object({ key: z.string(), name: z.string() })),
});
const BiasTipsSchema = z.object({
  tips: z.array(z.object({ biasKey: z.string(), tip: z.string() })),
});

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));

/** El banco de demostración del repositorio, sin importar nada de la app */
export function loadDemoBank(dir = DEMO_DIR): BankSource {
  const taxonomy = TaxonomySchema.parse(readJson(join(dir, 'topic-taxonomy.json')));
  const names = new Map<string, string>();
  for (const branch of taxonomy.branches) {
    for (const topic of branch.topics) {
      names.set(topic.key, topic.name);
      for (const subtopic of topic.subtopics)
        names.set(`${topic.key}/${subtopic.key}`, subtopic.name);
    }
  }
  const batchDir = join(dir, 'questions');
  const questions: BankQuestion[] = readdirSync(batchDir)
    .filter((name) => /^batch-\d+\.json$/.test(name))
    .sort()
    .flatMap((name) => {
      const batch = DemoBatchSchema.parse(readJson(join(batchDir, name)));
      const vignettes = new Map(batch.cases.map((entry) => [entry.key, entry.vignette]));
      return batch.questions.map((item): BankQuestion => {
        const canonical = item.canonical ?? item.options.slice(0, 5).map((option) => option.key);
        const chosen = item.options.filter((option) => canonical.includes(option.key));
        const caseText = item.caseKey ? (vignettes.get(item.caseKey) ?? '') : '';
        return {
          key: item.key,
          topic: item.topic,
          area: names.get(`${item.topic}/${item.subtopic}`) ?? names.get(item.topic) ?? item.topic,
          stem: [caseText, item.vignette, item.prompt]
            .filter((part) => part.trim() !== '')
            .join(' '),
          options: chosen.map((option, index) => ({
            label: String.fromCharCode(65 + index),
            text: option.text,
            isKey: option.correct,
            bias: option.correct ? null : (option.bias ?? null),
          })),
          explanation: item.explanation,
        };
      });
    });
  const labels = new Map(
    BiasTaxonomySchema.parse(readJson(join(dir, 'bias-taxonomy.json'))).biases.map((bias) => [
      bias.key,
      bias.name,
    ]),
  );
  const biases = BiasTipsSchema.parse(readJson(join(dir, 'bias-tips.json'))).tips.flatMap(
    (tip): BankBias[] => {
      const label = labels.get(tip.biasKey);
      return label ? [{ key: tip.biasKey, label, baseTip: tip.tip }] : [];
    },
  );
  return { set: 'demo', questions, biases };
}

// ---------------------------------------------------------------------------------------------
// Azar con semilla

/** mulberry32. Con la misma semilla da siempre la misma secuencia */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap] as T, copy[index] as T];
  }
  return copy;
}

/** Corta un texto a un máximo sin partir palabras */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trim();
}

const refOf = (question: BankQuestion) => `q-${question.key}`.slice(0, 64);

// ---------------------------------------------------------------------------------------------
// Casos por motor

export interface BankCaseOptions {
  seed?: number;
  perEngine?: number;
  /** Temas que entran primero, como psiquiatría, para probar que las guardas no rechazan el banco */
  preferTopics?: readonly string[];
}

/** Los temas con al menos min preguntas, en orden con semilla y con los preferidos primero */
function topicsWith(
  source: BankSource,
  min: number,
  random: () => number,
  prefer: readonly string[],
): BankQuestion[][] {
  const byTopic = new Map<string, BankQuestion[]>();
  for (const question of source.questions) {
    byTopic.set(question.topic, [...(byTopic.get(question.topic) ?? []), question]);
  }
  const groups = shuffled(
    [...byTopic.values()].filter((group) => group.length >= min),
    random,
  );
  const first = groups.filter((group) => prefer.includes(group[0]?.topic ?? ''));
  return [...first, ...groups.filter((group) => !first.includes(group))];
}

function forgettingCases(
  source: BankSource,
  random: () => number,
  options: Required<BankCaseOptions>,
): GoldenCase<'forgetting'>[] {
  const groups = topicsWith(source, 3, random, options.preferTopics);
  return Array.from({ length: options.perEngine }, (_, index): GoldenCase<'forgetting'> => {
    const group = groups[index % Math.max(1, groups.length)] ?? source.questions;
    const rule = HYPOTHESIS_RULES[index % HYPOTHESIS_RULES.length] ?? 'persistent_lapse';
    // El último va con una sola prueba, porque sin evidencia suficiente lo correcto es no opinar
    const lone = index === options.perEngine - 1;
    const evidence = shuffled(group, random).slice(0, lone ? 1 : 2 + (index % 3));
    const input: HypothesisInput = {
      rule,
      area: clip(evidence[0]?.area ?? 'Tema', 80),
      recentFindings: 4 + index,
      evidence: evidence.map((question) => ({
        ref: refOf(question),
        kind: 'question' as const,
        text: clip(question.stem, 800),
      })),
      causesReported: index % 4,
      causeMismatches: index % 2,
      allowedActions: [...RULE_ACTIONS[rule]],
    };
    return {
      id: `${source.set}-forgetting-${index + 1}`,
      engine: 'forgetting',
      description: `${source.set === 'demo' ? 'Banco de demostración' : 'Banco real'}, ${rule} con ${evidence.length} preguntas`,
      input,
      expect: lone ? 'no_answer' : 'answer',
      set: source.set,
    };
  });
}

const PRIORITY_DETAILS = [
  'Es el tema donde más fallas esta semana.',
  'Repasa las explicaciones de las preguntas que fallaste.',
  'Practica este tema en el simulador a ritmo de examen.',
] as const;

function weeklyReportCases(
  source: BankSource,
  random: () => number,
  options: Required<BankCaseOptions>,
): GoldenCase<'weekly_report'>[] {
  const areas = [...new Set(shuffled(source.questions, random).map((question) => question.area))];
  return Array.from({ length: options.perEngine }, (_, index): GoldenCase<'weekly_report'> => {
    const count = 1 + (index % 3);
    const picked = areas.slice(index, index + count + 1);
    const priorities = picked.slice(0, count).map((area, position) => ({
      ref: `prioridad-${position + 1}`,
      title: clip(area, 120),
      detail: PRIORITY_DETAILS[position % PRIORITY_DETAILS.length] ?? PRIORITY_DETAILS[0],
    }));
    const challengeArea = picked[count] ?? picked[0] ?? 'este tema';
    const input: WeeklyReportInput = {
      answers: [35, 120, 260, 18, 410][index % 5] ?? 50,
      priorities,
      habit:
        index % 2 === 0
          ? {
              ref: 'habito',
              title: 'Repaso diario',
              detail: 'Haz tus repasos pendientes antes de responder preguntas nuevas.',
            }
          : null,
      challenge:
        index % 3 === 0
          ? null
          : {
              ref: 'reto',
              title: clip(challengeArea, 120),
              detail: clip(`Resuelve diez preguntas de ${challengeArea.toLowerCase()}.`, 300),
            },
    };
    return {
      id: `${source.set}-weekly_report-${index + 1}`,
      engine: 'weekly_report',
      description: `${count} prioridades con temas del banco`,
      input,
      expect: 'answer',
      set: source.set,
    };
  });
}

function flashcardsCases(
  source: BankSource,
  random: () => number,
  options: Required<BankCaseOptions>,
): GoldenCase<'flashcards'>[] {
  const questions = shuffled(source.questions, random);
  return Array.from({ length: options.perEngine }, (_, index): GoldenCase<'flashcards'> => {
    const question = questions[index % questions.length] as BankQuestion;
    // Cada cuarto caso junta dos explicaciones del mismo tema, como una sección de un PDF
    const partner =
      index % 4 === 3
        ? questions.find((other) => other.topic === question.topic && other.key !== question.key)
        : undefined;
    const text = clip(
      partner ? `${question.explanation} ${partner.explanation}` : question.explanation,
      2_000,
    );
    return {
      id: `${source.set}-flashcards-${index + 1}`,
      engine: 'flashcards',
      description: `Explicación del banco sobre ${question.area}${partner ? ', dos preguntas' : ''}`,
      input: { title: clip(question.area, 200), text },
      expect: 'answer',
      set: source.set,
    };
  });
}

const VOCABULARIES: readonly (BiasVocabulary | undefined)[] = ['trampa', undefined, 'sesgo'];

/** Una pregunta donde el alumno cayó en la trampa, con la opción que eligió */
function exampleText(question: BankQuestion, option: BankOption): string {
  const choice = ` Opción elegida: ${option.text}`;
  return clip(`${clip(question.stem, 600 - choice.length - 1)}${choice}`, 600);
}

function biasTipCases(
  source: BankSource,
  random: () => number,
  options: Required<BankCaseOptions>,
): GoldenCase<'bias_tips'>[] {
  const withExamples = shuffled(source.biases, random)
    .map((bias) => ({
      bias,
      examples: shuffled(source.questions, random).flatMap((question) =>
        question.options
          .filter((option) => option.bias === bias.key)
          .map((option) => ({ question, option })),
      ),
    }))
    .filter((entry) => entry.examples.length >= 2);
  return Array.from({ length: options.perEngine }, (_, index): GoldenCase<'bias_tips'> => {
    const entry = withExamples[index % Math.max(1, withExamples.length)];
    if (!entry) throw new Error('El banco no tiene trampas con al menos dos ejemplos');
    const unique = entry.examples.filter(
      (example, position, all) =>
        all.findIndex((other) => other.question.key === example.question.key) === position,
    );
    // Cada vuelta por la lista de trampas usa otros ejemplos y otro vocabulario, para no repetir
    const round = Math.floor(index / Math.max(1, withExamples.length));
    const count = 2 + ((index + round) % 2);
    const start = (round * count) % unique.length;
    const picked = [...unique.slice(start), ...unique.slice(0, start)].slice(0, count);
    const vocabulary = VOCABULARIES[(index + round) % VOCABULARIES.length];
    const input: BiasTipInput = {
      biasKey: clip(entry.bias.key, 60),
      biasLabel: clip(entry.bias.label, 80),
      baseTip: clip(entry.bias.baseTip, 500),
      examples: picked.map(({ question, option }) => ({
        ref: refOf(question),
        text: exampleText(question, option),
      })),
      ...(vocabulary ? { vocabulary } : {}),
    };
    return {
      id: `${source.set}-bias_tips-${index + 1}`,
      engine: 'bias_tips',
      description: `${entry.bias.label} con ${picked.length} preguntas, vocabulario ${vocabulary ?? 'por omisión'}`,
      input,
      expect: 'answer',
      set: source.set,
    };
  });
}

function restructureCases(
  source: BankSource,
  random: () => number,
  options: Required<BankCaseOptions>,
): GoldenCase<'restructure'>[] {
  const eligible = source.questions.filter(
    (question) =>
      question.options.filter((option) => option.isKey).length === 1 &&
      question.options.length >= 3,
  );
  const preferred = eligible.filter((question) => options.preferTopics.includes(question.topic));
  const rest = shuffled(
    eligible.filter((question) => !preferred.includes(question)),
    random,
  );
  const ordered = [...preferred.slice(0, 2), ...rest];
  return Array.from({ length: options.perEngine }, (_, index): GoldenCase<'restructure'> => {
    const question = ordered[index % ordered.length] as BankQuestion;
    const transform = RESTRUCTURE_TRANSFORMS[index % RESTRUCTURE_TRANSFORMS.length] ?? 'to_except';
    const input: RestructureInput = {
      questionRef: refOf(question),
      transform,
      stem: clip(question.stem, 1_500),
      options: question.options.slice(0, 10).map((option) => ({
        label: option.label,
        text: clip(option.text, 400),
        isKey: option.isKey,
      })),
      explanation: clip(question.explanation, 2_000),
    };
    return {
      id: `${source.set}-restructure-${index + 1}`,
      engine: 'restructure',
      description: `${question.area}, ${transform}`,
      input,
      expect: 'answer',
      set: source.set,
    };
  });
}

/** Los casos de un banco, 10 por motor con la semilla fija */
export function bankCases(source: BankSource, options: BankCaseOptions = {}): GoldenCase[] {
  const settings: Required<BankCaseOptions> = {
    seed: options.seed ?? BANK_SEED,
    perEngine: options.perEngine ?? CASES_PER_ENGINE,
    preferTopics: options.preferTopics ?? [],
  };
  // Cada motor con su propia secuencia, para que cambiar uno no mueva a los demás
  const random = (salt: number) => seededRandom(settings.seed + salt);
  return [
    ...forgettingCases(source, random(1), settings),
    ...weeklyReportCases(source, random(2), settings),
    ...flashcardsCases(source, random(3), settings),
    ...biasTipCases(source, random(4), settings),
    ...restructureCases(source, random(5), settings),
  ];
}

/** Los 50 casos del banco de demostración, con psiquiatría entre los primeros */
export function demoBankCases(): GoldenCase[] {
  return bankCases(loadDemoBank(), { preferTopics: ['psychiatry'] });
}
