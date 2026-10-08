// Generador de tarjetas desde un texto del alumno (D-085, fila 10, opción B). Quita los datos
// personales, parte el texto en secciones, pide las tarjetas a un generador y deja pasar solo las que
// aprueba el validador, que revisa cada una contra el texto de donde dice que sale. Lo que no pasa
// no llega al alumno. El generador es el proxy de IA, o uno simulado y determinista cuando no hay
// proxy ni clave, como en la demo publicada (D-017). Si el proxy falla, se usa el simulado y se
// dice. Todo lo que sale es borrador.
import { z } from 'zod';
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

export const FLASHCARDS_PROMPT_VERSION = 'flashcards.provisional.v1';
export const SIMULATED_MODEL = 'plantilla-simulada-v1';
/** Secciones que se procesan en una generación. Más de eso cuesta de más y se avisa */
export const SECTIONS_PER_GENERATION = 12;
export const FLASHCARDS_URL = '/api/ai/flashcards';
const TIMEOUT_MS = 30_000;

/** Lo que el proxy devuelve por sección. Las fuentes de una controversia se revisan después */
export const ProposedCardsResponseSchema = z.strictObject({
  cards: z
    .array(
      z.strictObject({
        kind: z.enum(['basic', 'cloze']),
        front: z.string().min(1).max(3000),
        back: z.string().max(3000),
        quote: z.string().min(1).max(2000),
        controversy: z
          .strictObject({
            reason: z.string().max(1000),
            sources: z
              .array(
                z.strictObject({
                  key: z.string().max(40),
                  locator: z.string().max(120).nullable().optional(),
                }),
              )
              .max(5),
          })
          .nullable()
          .optional(),
      }),
    )
    .max(10),
});

export type GeneratorMode = 'real' | 'mock' | 'template';

export interface CardGenerator {
  readonly mode: GeneratorMode;
  readonly model: string;
  generate(section: SourceSection): Promise<ProposedCard[]>;
}

/** Sin proxy ni clave. Siempre da las mismas tarjetas para el mismo texto */
export const simulatedGenerator: CardGenerator = {
  mode: 'template',
  model: SIMULATED_MODEL,
  generate: (section) => Promise.resolve(simulateCards(section)),
};

/** El proxy de IA con clave. Solo se usa en modo real, que es cuando el proxy tiene un modelo */
export function createProxyGenerator(fetchImpl: typeof fetch = fetch): CardGenerator {
  return {
    mode: 'real',
    model: 'proxy',
    async generate(section) {
      const response = await fetchImpl(FLASHCARDS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          title: section.title,
          text: section.text,
          promptVersion: FLASHCARDS_PROMPT_VERSION,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`El proxy respondió ${response.status}`);
      const parsed = ProposedCardsResponseSchema.parse(await response.json());
      return parsed.cards;
    },
  };
}

/**
 * Qué generador usar según el estado de la IA. Solo con clave se llama al proxy. En modo simulado
 * del proxy, sin proxy o sin conexión, las tarjetas salen del generador simulado del propio cliente,
 * que es el mismo y no necesita red
 */
export function generatorFor(status: AiStatus, fetchImpl?: typeof fetch): CardGenerator {
  return status.kind === 'real' ? createProxyGenerator(fetchImpl) : simulatedGenerator;
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
  const proposals: FlashcardProposal[] = [];
  const rejectedBy: Partial<Record<CardIssue, number>> = {};
  let rejected = 0;

  for (const section of sections) {
    let cards: ProposedCard[];
    try {
      cards = await generator.generate(section);
    } catch {
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
    promptVersion: FLASHCARDS_PROMPT_VERSION,
    durationMs: Math.max(0, now() - started),
    processedText: scrub.text,
  };
}
