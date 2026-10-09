// Revisar consejos por sesgo y tarjetas de mazos públicos (pantalla 20). El texto que revisa un
// médico deja de ser borrador. Lo que rechaza no llega a los alumnos. Nada de esto toca los eventos.
import type { DataApi } from '@/data/context';
import type { AiArtifact } from '@/data/schemas/activity';
import type { Deck, Note } from '@/data/schemas/decks';
import type { User } from '@/data/schemas/people';
import {
  TIP_MAX_CHARS,
  TIP_MIN_CHARS,
  tipReviewId,
  type TipReviewContent,
} from '../shared/tipReviews';

type Api = Pick<DataApi, 'repos'>;

export class InvalidTipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTipError';
  }
}

/** Aprueba el texto tal cual, lo aprueba con cambios (editado) o lo rechaza */
export async function decideTip(
  api: Api,
  physician: Pick<User, 'id'>,
  input: { biasKey: string; baseTip: string; tip: string; decision: 'approve' | 'reject' },
  now: Date = new Date(),
): Promise<AiArtifact> {
  const tip = input.tip.trim();
  if (input.decision === 'approve' && (tip.length < TIP_MIN_CHARS || tip.length > TIP_MAX_CHARS)) {
    throw new InvalidTipError(`El consejo lleva de ${TIP_MIN_CHARS} a ${TIP_MAX_CHARS} caracteres`);
  }
  // Rechazar guarda el texto base que se revisó, porque el esquema pide un texto con largo mínimo
  const kept = input.decision === 'approve' ? tip : input.baseTip.trim();
  const content: TipReviewContent = {
    biasKey: input.biasKey,
    tip: kept,
    baseTip: input.baseTip.trim(),
  };
  const status: AiArtifact['status'] =
    input.decision === 'reject' ? 'rejected' : tip === input.baseTip.trim() ? 'approved' : 'edited';
  const artifact: AiArtifact = {
    id: tipReviewId(input.biasKey),
    userId: null,
    kind: 'bias_tip',
    status,
    mode: 'template',
    model: 'revision-medica',
    promptVersion: 'bias_tips.review.v1',
    content,
    validatorResult: { passed: true, issues: [] },
    sourceIds: [],
    createdAt:
      (await api.repos.aiArtifacts.get(tipReviewId(input.biasKey)))?.createdAt ?? now.toISOString(),
    decidedAt: now.toISOString(),
    decidedBy: physician.id,
  };
  await api.repos.aiArtifacts.put(artifact);
  return artifact;
}

/** Quita la decisión y el consejo vuelve a ser un borrador con su texto base */
export async function reopenTip(api: Api, biasKey: string): Promise<void> {
  await api.repos.aiArtifacts.remove(tipReviewId(biasKey));
}

export interface PendingNote {
  note: Note;
  deck: Deck;
}

/** Las notas de mazos públicos que esperan decisión, en el orden de sus mazos */
export function pendingPublicNotes(decks: readonly Deck[], notes: readonly Note[]): PendingNote[] {
  const publicDecks = new Map(
    decks.filter((deck) => deck.visibility === 'public').map((deck) => [deck.id, deck]),
  );
  return notes
    .filter((note) => note.editorialStatus === 'draft' || note.editorialStatus === 'in_review')
    .flatMap((note) => {
      const deck = publicDecks.get(note.deckId);
      return deck ? [{ note, deck }] : [];
    })
    .sort((a, b) => a.deck.name.localeCompare(b.deck.name) || a.note.id.localeCompare(b.note.id));
}

export async function decideNote(
  api: Api,
  noteId: string,
  status: 'approved' | 'rejected',
  now: Date = new Date(),
): Promise<Note> {
  const note = await api.repos.notes.get(noteId);
  if (!note) throw new Error('La tarjeta ya no existe');
  return api.repos.notes.put({ ...note, editorialStatus: status, updatedAt: now.toISOString() });
}
