// Generador de tarjetas desde un texto del alumno (D-085, fila 10, opción B). Quita los datos
// personales, parte el texto en secciones, pide las tarjetas a un generador y deja pasar solo las que
// aprueba el validador, que revisa cada una contra el texto de donde dice que sale. Lo que no pasa
// no llega al alumno. El generador es el proxy de IA, real o simulado, o uno simulado y
// determinista del propio cliente cuando no hay proxy, como en la demo publicada (D-017). Si el
// proxy falla, se usa el simulado y se dice. Todo lo que sale es borrador.
import { newId } from '@/data/ids';
import { buildDuplicateIndex, findDuplicates, type DuplicateNote } from '@/engines/duplicates';
import {
  checkCard,
  simulateCards,
  splitSections,
  type CardIssue,
  type ProposedCard,
  type ProposedControversy,
  type SourceSection,
} from '@/engines/cardGen';
import { scrubPersonalData, type PiiCounts } from '@/engines/piiFilter';
import type { AiStatus } from './client';
import { callEngine, type CallMeta } from './engines';

export const FLASHCARDS_PROMPT_VERSION = 'flashcards.provisional.v1';
export const SIMULATED_MODEL = 'plantilla-simulada-v1';
/** Secciones que se procesan en una generación. Más de eso cuesta de más y se avisa */
export const SECTIONS_PER_GENERATION = 12;

export type GeneratorMode = 'real' | 'mock' | 'template';

export interface CardGenerator {
  readonly mode: GeneratorMode;
  /** El modelo que respondió. Con el proxy se sabe después de la primera llamada */
  readonly model: string;
  generate(section: SourceSection): Promise<ProposedCard[]>;
  /** Entrega y vacía lo que costaron las llamadas que se hicieron desde la última vez */
  drainMetas?(): CallMeta[];
}

/** Sin proxy ni clave. Siempre da las mismas tarjetas para el mismo texto */
export const simulatedGenerator: CardGenerator = {
  mode: 'template',
  model: SIMULATED_MODEL,
  generate: (section) => Promise.resolve(simulateCards(section)),
};

export interface ProxyGeneratorOptions {
  /** El estado de la IA. Solo real y mock hablan con el proxy */
  status: Extract<AiStatus, { kind: 'real' | 'mock' }>;
  /** El ID seudónimo del alumno, para sus límites diarios */
  studentRef: string;
  names?: readonly string[];
  fetchImpl?: typeof fetch;
}

/**
 * Pide las tarjetas de cada sección al proxy de IA. Lo que devuelve ya pasó el esquema y las guardas
 * en el proxy y otra vez en el cliente. Si algo falla, lanza y quien llama sigue con el simulado
 */
export function createProxyGenerator(options: ProxyGeneratorOptions): CardGenerator {
  let metas: CallMeta[] = [];
  let model = 'proxy';
  return {
    mode: options.status.kind,
    get model() {
      return model;
    },
    async generate(section) {
      const result = await callEngine(
        'flashcards',
        { title: section.title, text: section.text },
        {
          status: options.status,
          studentRef: options.studentRef,
          ...(options.names ? { names: options.names } : {}),
          ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        },
      );
      // Una llamada que falló también costó y queda en la bitácora
      if (result.meta) metas.push(result.meta);
      if (!result.ok) throw new Error(`La IA no atendió la sección: ${result.reason}`);
      model = result.meta.model;
      return result.output.cards.map((card) => ({
        kind: card.kind,
        front: card.front,
        back: card.back,
        quote: card.quote,
        controversy: card.controversy ?? null,
      }));
    },
    drainMetas() {
      const taken = metas;
      metas = [];
      return taken;
    },
  };
}

/**
 * Qué generador usar según el estado de la IA. Con el proxy, real o simulado, las tarjetas pasan por
 * sus límites y su bitácora de costo. Sin proxy o sin conexión salen del generador simulado del
 * propio cliente, que es el mismo y no necesita red
 */
export function generatorFor(
  status: AiStatus,
  options: Omit<ProxyGeneratorOptions, 'status'>,
): CardGenerator {
  return status.kind === 'real' || status.kind === 'mock'
    ? createProxyGenerator({ ...options, status })
    : simulatedGenerator;
}

export interface FlashcardProposal {
  id: string;
  kind: 'basic' | 'cloze';
  front: string;
  back: string;
  quote: string;
  sectionIndex: number;
  sectionTitle: string | null;
  controversy: ProposedControversy | null;
  /** Ya hay una tarjeta igual o muy parecida en las del alumno */
  duplicate: boolean;
}

export interface GenerationResult {
  proposals: FlashcardProposal[];
  /** Propuestas que no pasaron la revisión y nunca se muestran */
  rejected: number;
  rejectedBy: Partial<Record<CardIssue, number>>;
  sections: number;
  /** El texto tenía más secciones de las que se procesan */
  sectionsCut: boolean;
  /** Cuántas cosas personales se ocultaron antes de procesar el texto */
  scrubbed: PiiCounts;
  scrubbedTotal: number;
  mode: GeneratorMode;
  model: string;
  /** El proxy falló y se usó el generador simulado */
  fellBack: boolean;
  promptVersion: string;
  durationMs: number;
  /** El texto que se procesó, ya sin datos personales */
  processedText: string;
  /** Lo que costó cada llamada al proxy. Vacío con el generador simulado del cliente */
  metas: CallMeta[];
}

export interface GenerateOptions {
  text: string;
  /** Nombres que no deben llegar al generador, como el alias y el nombre del alumno */
  names?: readonly string[];
  existing?: Iterable<DuplicateNote>;
  generator: CardGenerator;
  /** Se usa si el generador principal falla */
  fallback?: CardGenerator;
  maxSections?: number;
  now?: () => number;
}

export async function generateFlashcards(options: GenerateOptions): Promise<GenerationResult> {
  const now = options.now ?? (() => Date.now());
  const started = now();
  const scrub = scrubPersonalData(options.text, options.names ?? []);
  const all = splitSections(scrub.text);
  const limit = options.maxSections ?? SECTIONS_PER_GENERATION;
  const sections = all.slice(0, limit);
  const index = buildDuplicateIndex(options.existing ?? []);

  let generator = options.generator;
  let fellBack = false;
  const metas: CallMeta[] = [];
  const collect = () => {
    metas.push(...(generator.drainMetas?.() ?? []));
  };
  const proposals: FlashcardProposal[] = [];
  const rejectedBy: Partial<Record<CardIssue, number>> = {};
  let rejected = 0;

  for (const section of sections) {
    let cards: ProposedCard[];
    try {
      cards = await generator.generate(section);
      collect();
    } catch {
      collect();
      // Si el proxy falla se sigue con el simulado, una sola vez, y se dice
      const fallback = options.fallback ?? simulatedGenerator;
      if (generator === fallback) throw new Error('El generador de tarjetas falló');
      generator = fallback;
      fellBack = true;
      cards = await generator.generate(section);
    }
    for (const card of cards) {
      const issues = checkCard(card, section.text);
      if (issues.length > 0) {
        rejected += 1;
        for (const issue of issues) rejectedBy[issue] = (rejectedBy[issue] ?? 0) + 1;
        continue;
      }
      const duplicate =
        findDuplicates(
          card.kind === 'cloze'
            ? { kind: 'cloze', text: card.front }
            : { kind: 'basic', front: card.front },
          index,
        ).totalExact > 0;
      proposals.push({
        id: newId(),
        kind: card.kind,
        front: card.front.trim(),
        back: card.back.trim(),
        quote: card.quote.trim(),
        sectionIndex: section.index,
        sectionTitle: section.title,
        controversy: card.controversy
          ? {
              reason: card.controversy.reason.trim(),
              sources: card.controversy.sources.map((entry) => ({
                key: entry.key,
                locator: entry.locator ?? null,
              })),
            }
          : null,
        duplicate,
      });
    }
  }

  return {
    proposals,
    rejected,
    rejectedBy,
    sections: sections.length,
    sectionsCut: all.length > sections.length,
    scrubbed: scrub.counts,
    scrubbedTotal: scrub.total,
    mode: generator.mode,
    model: generator.model,
    fellBack,
    promptVersion:
      metas.find((meta) => meta.mode === generator.mode)?.promptVersion ??
      FLASHCARDS_PROMPT_VERSION,
    durationMs: Math.max(0, now() - started),
    processedText: scrub.text,
    metas,
  };
}
