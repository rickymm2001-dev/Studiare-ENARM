// Tarjetas con IA desde un apunte (B6 del plan del cambio, D-085). El alumno decide cada propuesta
// por separado. Aceptar la guarda en el mazo del apunte con la etiqueta de su tema, siempre en
// borrador, con la frase literal de su apunte y el título del apunte como fuente. La nota no queda
// unida a una línea, porque la sincronización del apunte la retiraría, y así se distingue de lo que
// él escribió. Descartar no guarda nada, solo la cuenta en el artefacto de la generación.
import type { FlashcardProposal } from '../../ai/flashcards';
import { subjectTags } from '../../engines/outline';
import type { DataApi } from '../context';
import type { User } from '../schemas/people';
import { discardProposal, saveProposals, type SavedProposals } from './aiCards';

type Api = Pick<DataApi, 'repos' | 'recordEvent'>;
type Person = Pick<User, 'id' | 'timeZone'>;

export async function acceptOutlineProposal(
  api: Api,
  user: Person,
  input: {
    outlineId: string;
    proposal: FlashcardProposal;
    artifactId: string;
    /** Si lo generó el simulado, la señal de controversia lo dice */
    simulated: boolean;
  },
  now: Date = new Date(),
): Promise<SavedProposals> {
  // Se lee el apunte guardado, así la tarjeta va al mazo y al tema de ahora
  const outline = await api.repos.outlines.get(input.outlineId);
  if (outline?.ownerId !== user.id) throw new Error('No se encontró el apunte');
  return saveProposals(
    api,
    user,
    {
      proposals: [input.proposal],
      sourceTitle: outline.title,
      artifactId: input.artifactId,
      simulated: input.simulated,
      deckId: outline.deckId,
      tags: subjectTags(outline.subject),
    },
    now,
  );
}

export { discardProposal as discardOutlineProposal };
