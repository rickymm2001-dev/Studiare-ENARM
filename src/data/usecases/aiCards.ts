// Tarjetas con IA desde un texto o PDF del alumno (D-085, fila 10, opción B). Aquí vive todo lo que
// toca la base. La cuota diaria se cuenta con la bitácora de llamadas de IA. Cada generación deja su
// llamada y su artefacto en borrador, y guardar las tarjetas elegidas las crea siempre en borrador,
// con la cita, el título de la fuente y su señal de controversia si la traen. La IA nunca corrige el
// texto. Atender una señal, verificando o editando, queda como evento y la quita de la tarjeta.
import { ACADEMIC_SOURCE_KEYS, type AcademicSourceKey } from '../../config/academicSources';
import { PLANS, type PlanKey } from '../../config/billing';
import { studyDayOf } from '../../engines/studyDay';
import { sanitizeTag } from '../../engines/tagPath';
import type { FlashcardProposal, GenerationResult } from '../../ai/flashcards';
import { textToHtml } from '../content/plainText';
import type { DataApi } from '../context';
import { createEvent } from '../events/createEvent';
import { newId } from '../ids';
import type { AiArtifact, AiCallLog } from '../schemas/activity';
import type { Card, Controversy, Deck, Note } from '../schemas/decks';
import type { User } from '../schemas/people';
import { clozeOrdinals, saveManualNote } from './manualDecks';

type Api = Pick<DataApi, 'repos' | 'recordEvent'>;
type Person = Pick<User, 'id' | 'timeZone'>;

export const AI_DECK_NAME = 'Tarjetas con IA';
export const AI_TAG = 'Generada_con_IA';

/** Cuántas generaciones hizo el alumno en su día de estudio actual */
export async function generationsToday(
  api: Pick<DataApi, 'repos'>,
  user: Person,
  now: Date = new Date(),
): Promise<number> {
  const today = studyDayOf(now, user.timeZone);
  return (await api.repos.aiCallLog.list()).filter(
    (call) =>
      call.engine === 'flashcards' &&
      call.userId === user.id &&
      studyDayOf(new Date(call.at), user.timeZone) === today,
  ).length;
}

/** Generaciones que le quedan hoy según su plan. 0 en el plan Gratis */
export async function generationsLeft(
  api: Pick<DataApi, 'repos'>,
  user: Person,
  plan: PlanKey,
  now: Date = new Date(),
): Promise<number> {
  return Math.max(0, PLANS[plan].aiCardsPerDay - (await generationsToday(api, user, now)));
}

export class GenerationLimitError extends Error {
  constructor() {
    super('Ya usaste todas tus generaciones de hoy');
    this.name = 'GenerationLimitError';
  }
}

export interface RecordedGeneration {
  artifactId: string;
  callId: string;
}

/**
 * Deja constancia de una generación. Cuenta contra la cuota aunque no haya salido ninguna tarjeta,
 * porque el texto sí se procesó. Falla sin registrar nada si el plan ya no tiene generaciones
 */
export async function recordGeneration(
  api: Api,
  user: Person,
  plan: PlanKey,
  result: GenerationResult,
  sourceTitle: string,
  now: Date = new Date(),
): Promise<RecordedGeneration> {
  if ((await generationsLeft(api, user, plan, now)) <= 0) throw new GenerationLimitError();
  const stamp = now.toISOString();
  const call: AiCallLog = {
    id: newId(),
    userId: user.id,
    engine: 'flashcards',
    mode: result.mode,
    model: result.model,
    at: stamp,
    // Sin un modelo real no hay tokens. Con uno, una estimación de 4 caracteres por token
    inputTokens: result.mode === 'template' ? 0 : Math.ceil(result.processedText.length / 4),
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    estimatedCostUsd: 0,
    latencyMs: result.durationMs,
    outcome: result.fellBack ? 'fallback' : 'ok',
  };
  await api.repos.aiCallLog.put(call);

  const issues = Object.entries(result.rejectedBy).map(([issue, count]) => `${issue}: ${count}`);
  const artifact: AiArtifact = {
    id: newId(),
    userId: user.id,
    kind: 'flashcard',
    status: 'draft',
    mode: result.mode,
    model: result.model,
    promptVersion: result.promptVersion,
    content: {
      sourceTitle,
      sections: result.sections,
      proposed: result.proposals.length,
      rejected: result.rejected,
    },
    // Lo que no pasó el validador nunca llegó al alumno. Aquí queda cuánto se descartó y por qué
    validatorResult: { passed: true, issues },
    sourceIds: [],
    createdAt: stamp,
    decidedAt: null,
    decidedBy: null,
  };
  await api.repos.aiArtifacts.put(artifact);
  await api.recordEvent(
    createEvent(
      'ai_artifact_created',
      {
        artifactId: artifact.id,
        kind: 'flashcard',
        model: artifact.model,
        promptVersion: artifact.promptVersion,
      },
      { userId: user.id, tz: user.timeZone, clock: { now: () => now } },
    ),
  );
  return { artifactId: artifact.id, callId: call.id };
}

const isAcademicKey = (key: string): key is AcademicSourceKey =>
  (ACADEMIC_SOURCE_KEYS as readonly string[]).includes(key);

/** La señal de la propuesta con solo fuentes de la lista cerrada. Ya las revisó el validador */
function controversyOf(
  proposal: FlashcardProposal,
  simulated: boolean,
  flaggedAt: string,
): Controversy | null {
  if (!proposal.controversy) return null;
  const sources = proposal.controversy.sources
    .filter((entry) => isAcademicKey(entry.key))
    .map((entry) => ({ key: entry.key as AcademicSourceKey, locator: entry.locator ?? null }));
  return sources.length === 0
    ? null
    : { reason: proposal.controversy.reason, sources, simulated, flaggedAt };
}

export interface SaveProposalsInput {
  proposals: readonly FlashcardProposal[];
  sourceTitle: string;
  artifactId: string;
  /** Si lo generó el simulado, la señal de controversia lo dice */
  simulated: boolean;
}

export interface SavedProposals {
  deckId: string;
  notes: number;
  cards: number;
  flagged: number;
}

/**
 * Guarda las tarjetas que el alumno eligió. Siempre en borrador y con su cita. Van al mazo Tarjetas
 * con IA, que es un mazo propio del alumno y por eso se puede editar y borrar como los demás
 */
export async function saveProposals(
  api: Api,
  user: Person,
  input: SaveProposalsInput,
  now: Date = new Date(),
): Promise<SavedProposals> {
  const stamp = now.toISOString();
  const decks = await api.repos.decks.list();
  const existing = decks.find(
    (deck) =>
      deck.ownerId === user.id &&
      deck.origin === 'manual' &&
      !deck.parentId &&
      deck.name === AI_DECK_NAME,
  );
  const deck: Deck = existing ?? {
    id: newId(),
    name: AI_DECK_NAME,
    description:
      'Tarjetas que propuso la IA a partir de tus textos y PDF. Son borradores, revísalas.',
    ownerId: user.id,
    origin: 'manual',
    visibility: 'private',
    isDemo: false,
    parentId: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  if (!existing) await api.repos.decks.put(deck);

  const notes: Note[] = [];
  const cards: Card[] = [];
  let flagged = 0;
  for (const proposal of input.proposals) {
    const titleTag = proposal.sectionTitle ? sanitizeTag(proposal.sectionTitle) : '';
    const base = {
      id: newId(),
      deckId: deck.id,
      tags: [AI_TAG, ...(titleTag ? [titleTag] : [])],
      origin: 'generated' as const,
      editorialStatus: 'draft' as const,
      sourceQuote: proposal.quote,
      sourceQuestionVersionId: null,
      sourceTitle: input.sourceTitle,
      controversy: controversyOf(proposal, input.simulated, stamp),
      isDemo: false,
      createdAt: stamp,
      updatedAt: stamp,
    };
    const note: Note =
      proposal.kind === 'cloze'
        ? {
            ...base,
            kind: 'cloze',
            text: textToHtml(proposal.front),
            extra: textToHtml(proposal.back),
          }
        : {
            ...base,
            kind: 'basic',
            front: textToHtml(proposal.front),
            back: textToHtml(proposal.back),
          };
    if (base.controversy) flagged += 1;
    notes.push(note);
    const ordinals = proposal.kind === 'cloze' ? clozeOrdinals(textToHtml(proposal.front)) : [0];
    for (const ordinal of ordinals) {
      cards.push({
        id: newId(),
        noteId: note.id,
        deckId: deck.id,
        ordinal,
        createdAt: stamp,
        updatedAt: stamp,
      });
    }
  }
  await api.repos.notes.putMany(notes);
  await api.repos.cards.putMany(cards);

  // El artefacto sale de borrador porque el alumno lo decidió, y queda en la bitácora
  const artifact = await api.repos.aiArtifacts.get(input.artifactId);
  if (artifact?.status === 'draft') {
    await api.repos.aiArtifacts.put({
      ...artifact,
      status: 'approved',
      decidedAt: stamp,
      decidedBy: user.id,
      content: { ...artifact.content, saved: notes.length },
    });
    await api.recordEvent(
      createEvent(
        'ai_artifact_approved',
        { artifactId: artifact.id, kind: 'flashcard' },
        { userId: user.id, tz: user.timeZone, clock: { now: () => now } },
      ),
    );
  }
  return { deckId: deck.id, notes: notes.length, cards: cards.length, flagged };
}

/**
 * El alumno atendió la señal de controversia de una tarjeta. La señal se quita de la tarjeta, sin
 * tocar su texto, y queda un evento. Si la señal ya no estaba no hace nada
 */
export async function resolveControversy(
  api: Api,
  user: Person,
  noteId: string,
  resolution: 'verified' | 'edited',
  now: Date = new Date(),
): Promise<boolean> {
  const note = await api.repos.notes.get(noteId);
  if (!note?.controversy) return false;
  await api.repos.notes.put({ ...note, controversy: null, updatedAt: now.toISOString() });
  await api.recordEvent(
    createEvent(
      'card_controversy_resolved',
      { noteId, resolution },
      { userId: user.id, tz: user.timeZone, clock: { now: () => now } },
    ),
  );
  return true;
}

/**
 * Guarda una tarjeta a mano, y si tenía una señal de controversia y el cambio de texto la quitó,
 * deja el evento de que el alumno la atendió editando. La señal la quita el propio guardado
 */
export async function saveNoteAndSignals(
  api: Api,
  user: Person,
  input: Parameters<typeof saveManualNote>[2],
  now: Date = new Date(),
): Promise<Note> {
  const before = input.noteId ? await api.repos.notes.get(input.noteId) : undefined;
  const note = await saveManualNote(api, user, input, now);
  if (before?.controversy && !note.controversy) {
    await api.recordEvent(
      createEvent(
        'card_controversy_resolved',
        { noteId: note.id, resolution: 'edited' },
        { userId: user.id, tz: user.timeZone, clock: { now: () => now } },
      ),
    );
  }
  return note;
}
