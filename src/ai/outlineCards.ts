// Tarjetas con IA desde un apunte (B6 del plan del cambio, respuesta 74, D-085). Toma las líneas del
// apunte que todavía no son tarjeta, las manda al mismo generador de Tarjetas con IA, con su filtro
// de datos personales y su validador, y después ancla cada propuesta a la línea de donde sale su cita.
// Una propuesta cuya cita no está tal cual en una línea del apunte se descarta y se cuenta, así el
// alumno solo ve tarjetas que se apoyan en lo que él escribió. Todo llega como borrador.
import type { OutlineNode } from '@/engines/outline';
import { anchorQuote, outlineSource, type OutlineSource } from '@/engines/outlineSource';
import {
  generateFlashcards,
  type FlashcardProposal,
  type GenerateOptions,
  type GenerationResult,
} from './flashcards';

/** Caracteres de texto sin marcas que necesita un apunte para proponer tarjetas */
export const OUTLINE_AI_MIN_CHARS = 80;

export interface OutlineProposal extends FlashcardProposal {
  /** La línea del apunte de donde sale la cita */
  nodeId: string;
}

export interface OutlineGeneration {
  /** El resultado del generador, con las propuestas ya ancladas y las que no se pudieron anclar */
  result: GenerationResult;
  proposals: OutlineProposal[];
  source: OutlineSource;
}

/** Propone tarjetas para el apunte y deja solo las ancladas a una de sus líneas */
export async function generateOutlineCards(
  options: Omit<GenerateOptions, 'text'> & { nodes: readonly OutlineNode[] },
): Promise<OutlineGeneration> {
  const { nodes, ...rest } = options;
  const source = outlineSource(nodes);
  const result = await generateFlashcards({ ...rest, text: source.text });
  const proposals = result.proposals.flatMap((proposal): OutlineProposal[] => {
    const anchored = anchorQuote(source, proposal.quote);
    return anchored ? [{ ...proposal, quote: anchored.quote, nodeId: anchored.nodeId }] : [];
  });
  const unanchored = result.proposals.length - proposals.length;
  return {
    result:
      unanchored === 0
        ? result
        : {
            ...result,
            proposals,
            rejected: result.rejected + unanchored,
            rejectedBy: {
              ...result.rejectedBy,
              quote_not_in_source: (result.rejectedBy.quote_not_in_source ?? 0) + unanchored,
            },
          },
    proposals,
    source,
  };
}
