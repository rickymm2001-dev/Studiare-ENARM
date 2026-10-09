import 'fake-indexeddb/auto';
import type { CallMeta } from '@/ai/engines';
import { afterEach, describe, expect, it } from 'vitest';
import { PLANS } from '@/config/billing';
import type { FlashcardProposal, GenerationResult } from '../../ai/flashcards';
import { makeUser, testApi } from '../testing/fixtures';
import {
  GenerationLimitError,
  AI_DECK_NAME,
  generationsLeft,
  generationsToday,
  recordGeneration,
  resolveControversy,
  saveNoteAndSignals,
  saveProposals,
} from './aiCards';
import { draftOf } from './manualDecks';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

function setup() {
  const api = testApi('real');
  disposers.push(api.dispose);
  return { api, user: makeUser() };
}

const result = (overrides: Partial<GenerationResult> = {}): GenerationResult => ({
  proposals: [],
  rejected: 2,
  rejectedBy: { quote_not_in_source: 2 },
  sections: 1,
  sectionsCut: false,
  scrubbed: { email: 0, phone: 0, curp: 0, rfc: 0, url: 0, name: 0 },
  scrubbedTotal: 0,
  mode: 'template',
  model: 'plantilla-simulada-v1',
  fellBack: false,
  promptVersion: 'flashcards.provisional.v1',
  durationMs: 12,
  processedText: 'texto',
  metas: [],
  ...overrides,
});

const proposal = (overrides: Partial<FlashcardProposal> = {}): FlashcardProposal => ({
  id: 'p1',
  kind: 'cloze',
  front: 'La {{c1::metformina}} es de primera línea',
  back: '',
  quote: 'La metformina es de primera línea en la diabetes',
  sectionIndex: 0,
  sectionTitle: 'Diabetes mellitus',
  controversy: null,
  duplicate: false,
  ...overrides,
});

const NOW = new Date('2026-10-08T15:00:00.000Z');

describe('cuota de generaciones', () => {
  it('el plan Gratis no tiene generaciones y los de pago tienen su tope diario', async () => {
    const { api, user } = setup();
    expect(await generationsLeft(api, user, 'free', NOW)).toBe(0);
    expect(await generationsLeft(api, user, 'monthly', NOW)).toBe(PLANS.monthly.aiCardsPerDay);
  });

  it('cada generación descuenta una, aunque no salga ninguna tarjeta', async () => {
    const { api, user } = setup();
    await recordGeneration(api, user, 'monthly', result(), 'Guía.pdf', NOW);
    expect(await generationsToday(api, user, NOW)).toBe(1);
    expect(await generationsLeft(api, user, 'monthly', NOW)).toBe(PLANS.monthly.aiCardsPerDay - 1);
  });

  it('al agotarse la cuota no registra nada más y el plan Gratis no puede generar', async () => {
    const { api, user } = setup();
    await expect(recordGeneration(api, user, 'free', result(), 'x', NOW)).rejects.toBeInstanceOf(
      GenerationLimitError,
    );
    expect(await api.repos.aiCallLog.list()).toHaveLength(0);
    for (let n = 0; n < PLANS.monthly.aiCardsPerDay; n += 1) {
      await recordGeneration(api, user, 'monthly', result(), 'x', NOW);
    }
    await expect(recordGeneration(api, user, 'monthly', result(), 'x', NOW)).rejects.toBeInstanceOf(
      GenerationLimitError,
    );
    expect(await api.repos.aiCallLog.list()).toHaveLength(PLANS.monthly.aiCardsPerDay);
  });

  it('la cuota es del alumno y del día de estudio, con corte a las 4 a. m.', async () => {
    const { api, user } = setup();
    const other = makeUser();
    await recordGeneration(api, user, 'monthly', result(), 'x', NOW);
    expect(await generationsToday(api, other, NOW)).toBe(0);
    // Al día siguiente, a las 5 a. m. de Mérida, ya es otro día de estudio
    expect(await generationsToday(api, user, new Date('2026-10-09T11:00:00.000Z'))).toBe(0);
    // Antes de las 4 a. m. todavía es el día anterior
    expect(await generationsToday(api, user, new Date('2026-10-09T08:00:00.000Z'))).toBe(1);
  });

  it('la llamada y el artefacto quedan en borrador y la bitácora lo recuerda', async () => {
    const { api, user } = setup();
    const { artifactId, callId } = await recordGeneration(
      api,
      user,
      'monthly',
      result({ fellBack: true }),
      'Guía.pdf',
      NOW,
    );
    const [call] = await api.repos.aiCallLog.list();
    expect(call).toMatchObject({
      id: callId,
      engine: 'flashcards',
      userId: user.id,
      outcome: 'fallback',
      mode: 'template',
    });
    const artifact = await api.repos.aiArtifacts.get(artifactId);
    expect(artifact).toMatchObject({ kind: 'flashcard', status: 'draft', decidedBy: null });
    expect(artifact?.validatorResult.issues).toEqual(['quote_not_in_source: 2']);
    const events = (await api.repos.events.query({ userId: user.id })).filter(
      (event) => event.type === 'ai_artifact_created',
    );
    expect(events).toHaveLength(1);
  });
});

describe('bitácora de costo', () => {
  const callMeta = (overrides: Partial<CallMeta> = {}): CallMeta => ({
    engine: 'flashcards',
    mode: 'real',
    model: 'claude-sonnet-5-5',
    promptVersion: 'flashcards.provisional.v1',
    inputTokens: 800,
    outputTokens: 300,
    cacheWriteTokens: 100,
    cacheReadTokens: 50,
    estimatedCostUsd: 0.0046,
    latencyMs: 900,
    outcome: 'ok',
    validator: { passed: true, issues: [] },
    ...overrides,
  });

  it('suma los tokens y el costo de todas las secciones en una sola llamada', async () => {
    const { api, user } = setup();
    await recordGeneration(
      api,
      user,
      'monthly',
      result({
        mode: 'real',
        model: 'claude-sonnet-5-5',
        metas: [callMeta(), callMeta({ outcome: 'retried_ok', estimatedCostUsd: 0.0054 })],
      }),
      'Guía.pdf',
      NOW,
    );
    const calls = await api.repos.aiCallLog.list();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      mode: 'real',
      model: 'claude-sonnet-5-5',
      inputTokens: 1600,
      outputTokens: 600,
      cacheWriteTokens: 200,
      cacheReadTokens: 100,
      estimatedCostUsd: 0.01,
      outcome: 'retried_ok',
    });
  });

  it('sin llamadas al proxy no hay tokens ni costo', async () => {
    const { api, user } = setup();
    await recordGeneration(api, user, 'monthly', result(), 'Guía.pdf', NOW);
    expect((await api.repos.aiCallLog.list())[0]).toMatchObject({
      inputTokens: 0,
      estimatedCostUsd: 0,
      outcome: 'ok',
    });
  });
});

describe('guardar las tarjetas elegidas', () => {
  it('quedan en borrador, citadas, con su título, etiquetas y señal, y sin cambiar el texto', async () => {
    const { api, user } = setup();
    const { artifactId } = await recordGeneration(
      api,
      user,
      'monthly',
      result(),
      'Guía de diabetes.pdf',
      NOW,
    );
    const saved = await saveProposals(
      api,
      user,
      {
        proposals: [
          proposal(),
          proposal({
            id: 'p2',
            kind: 'basic',
            front: '¿Cómo se define la HbA1c?',
            back: 'Un promedio de la glucosa en tres meses',
            quote: 'La HbA1c se define como un promedio de la glucosa en tres meses',
            controversy: {
              reason:
                'La frase usa una afirmación absoluta y las guías la matizan, así que conviene revisarla.',
              sources: [{ key: 'gpc_cenetec', locator: null }],
            },
          }),
        ],
        sourceTitle: 'Guía de diabetes.pdf',
        artifactId,
        simulated: true,
      },
      NOW,
    );
    expect(saved).toMatchObject({ notes: 2, cards: 2, flagged: 1 });

    const deck = await api.repos.decks.get(saved.deckId);
    expect(deck).toMatchObject({
      name: AI_DECK_NAME,
      origin: 'manual',
      visibility: 'private',
      ownerId: user.id,
    });

    const notes = await api.repos.notes.list();
    expect(
      notes.every((note) => note.origin === 'generated' && note.editorialStatus === 'draft'),
    ).toBe(true);
    expect(notes.every((note) => note.sourceTitle === 'Guía de diabetes.pdf')).toBe(true);
    expect(notes.map((note) => note.sourceQuote).sort()).toEqual([
      'La HbA1c se define como un promedio de la glucosa en tres meses',
      'La metformina es de primera línea en la diabetes',
    ]);
    expect(notes.every((note) => note.tags.includes('Generada_con_IA'))).toBe(true);
    expect(notes.every((note) => note.tags.includes('Diabetes_mellitus'))).toBe(true);
    const basic = notes.find((note) => note.kind === 'basic');
    expect(basic?.controversy).toMatchObject({
      simulated: true,
      sources: [{ key: 'gpc_cenetec' }],
    });
    expect(draftOf(basic as NonNullable<typeof basic>)).toMatchObject({
      front: '¿Cómo se define la HbA1c?',
      back: 'Un promedio de la glucosa en tres meses',
    });

    // El artefacto sale de borrador porque el alumno lo decidió
    const artifact = await api.repos.aiArtifacts.get(artifactId);
    expect(artifact).toMatchObject({ status: 'approved', decidedBy: user.id });
    const approved = (await api.repos.events.query({ userId: user.id })).filter(
      (event) => event.type === 'ai_artifact_approved',
    );
    expect(approved).toHaveLength(1);
  });

  it('un segundo guardado reutiliza el mazo Tarjetas con IA', async () => {
    const { api, user } = setup();
    const { artifactId } = await recordGeneration(api, user, 'monthly', result(), 'a', NOW);
    await saveProposals(
      api,
      user,
      { proposals: [proposal()], sourceTitle: 'a', artifactId, simulated: false },
      NOW,
    );
    await saveProposals(
      api,
      user,
      { proposals: [proposal()], sourceTitle: 'a', artifactId, simulated: false },
      NOW,
    );
    expect(
      (await api.repos.decks.list()).filter((deck) => deck.name === AI_DECK_NAME),
    ).toHaveLength(1);
    expect(await api.repos.notes.list()).toHaveLength(2);
    // El artefacto ya decidido no vuelve a aprobarse ni repite su evento
    const approved = (await api.repos.events.query({ userId: user.id })).filter(
      (event) => event.type === 'ai_artifact_approved',
    );
    expect(approved).toHaveLength(1);
  });

  it('un cloze con dos huecos da dos cartas', async () => {
    const { api, user } = setup();
    const { artifactId } = await recordGeneration(api, user, 'monthly', result(), 'a', NOW);
    const saved = await saveProposals(
      api,
      user,
      {
        proposals: [proposal({ front: 'La {{c1::metformina}} baja la {{c2::glucosa}} en ayunas' })],
        sourceTitle: 'a',
        artifactId,
        simulated: false,
      },
      NOW,
    );
    expect(saved.cards).toBe(2);
  });
});

describe('atender una controversia', () => {
  async function flagged() {
    const { api, user } = setup();
    const { artifactId } = await recordGeneration(api, user, 'monthly', result(), 'a', NOW);
    await saveProposals(
      api,
      user,
      {
        proposals: [
          proposal({
            controversy: {
              reason:
                'La frase usa una afirmación absoluta y las guías la matizan, así que conviene revisarla.',
              sources: [{ key: 'harrison', locator: null }],
            },
          }),
        ],
        sourceTitle: 'a',
        artifactId,
        simulated: true,
      },
      NOW,
    );
    const [note] = await api.repos.notes.list();
    return { api, user, note: note as NonNullable<typeof note> };
  }

  it('al verificarla la señal se quita, el texto no cambia y queda un evento', async () => {
    const { api, user, note } = await flagged();
    expect(note.controversy).not.toBeNull();
    expect(await resolveControversy(api, user, note.id, 'verified', NOW)).toBe(true);
    const after = await api.repos.notes.get(note.id);
    expect(after?.controversy).toBeNull();
    expect(JSON.stringify({ ...after, controversy: 0, updatedAt: 0 })).toBe(
      JSON.stringify({ ...note, controversy: 0, updatedAt: 0 }),
    );
    const events = (await api.repos.events.query({ userId: user.id })).filter(
      (event) => event.type === 'card_controversy_resolved',
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ noteId: note.id, resolution: 'verified' });
  });

  it('atenderla otra vez no hace nada y no repite el evento', async () => {
    const { api, user, note } = await flagged();
    await resolveControversy(api, user, note.id, 'verified', NOW);
    expect(await resolveControversy(api, user, note.id, 'edited', NOW)).toBe(false);
    const events = (await api.repos.events.query({ userId: user.id })).filter(
      (event) => event.type === 'card_controversy_resolved',
    );
    expect(events).toHaveLength(1);
  });

  it('una tarjeta sin señal o que no existe no hace nada', async () => {
    const { api, user } = setup();
    expect(await resolveControversy(api, user, '01J000000000000000000000AA', 'verified', NOW)).toBe(
      false,
    );
  });
});

describe('editar una tarjeta generada', () => {
  async function flaggedNote() {
    const { api, user } = setup();
    const { artifactId } = await recordGeneration(api, user, 'monthly', result(), 'Guía.pdf', NOW);
    await saveProposals(
      api,
      user,
      {
        proposals: [
          proposal({
            kind: 'basic',
            front: '¿Qué es la HbA1c?',
            back: 'Un promedio de la glucosa',
            quote: 'La HbA1c es un promedio de la glucosa en tres meses',
            controversy: {
              reason:
                'La frase usa una afirmación absoluta y las guías la matizan, así que conviene revisarla.',
              sources: [{ key: 'harrison', locator: null }],
            },
          }),
        ],
        sourceTitle: 'Guía.pdf',
        artifactId,
        simulated: true,
      },
      NOW,
    );
    const [note] = await api.repos.notes.list();
    return { api, user, note: note as NonNullable<typeof note> };
  }

  it('cambiar el texto quita la señal, deja el evento y conserva el origen y la cita', async () => {
    const { api, user, note } = await flaggedNote();
    const edited = await saveNoteAndSignals(
      api,
      user,
      {
        deckId: note.deckId,
        noteId: note.id,
        draft: { kind: 'basic', front: '¿Qué mide la HbA1c?', back: 'El promedio de la glucosa' },
      },
      NOW,
    );
    expect(edited.controversy ?? null).toBeNull();
    // Sigue siendo una tarjeta generada, en borrador, con su cita y su fuente
    expect(edited).toMatchObject({
      origin: 'generated',
      editorialStatus: 'draft',
      sourceQuote: 'La HbA1c es un promedio de la glucosa en tres meses',
      sourceTitle: 'Guía.pdf',
    });
    const events = (await api.repos.events.query({ userId: user.id })).filter(
      (event) => event.type === 'card_controversy_resolved',
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toEqual({ noteId: note.id, resolution: 'edited' });
  });

  it('guardar sin cambiar el texto no quita la señal ni deja evento', async () => {
    const { api, user, note } = await flaggedNote();
    const same = await saveNoteAndSignals(
      api,
      user,
      { deckId: note.deckId, noteId: note.id, draft: draftOf(note) },
      NOW,
    );
    expect(same.controversy).not.toBeNull();
    const events = (await api.repos.events.query({ userId: user.id })).filter(
      (event) => event.type === 'card_controversy_resolved',
    );
    expect(events).toHaveLength(0);
  });

  it('cambiar solo las etiquetas tampoco cuenta como atender la señal', async () => {
    const { api, user, note } = await flaggedNote();
    const retagged = await saveNoteAndSignals(
      api,
      user,
      { deckId: note.deckId, noteId: note.id, draft: draftOf(note), tags: ['otra'] },
      NOW,
    );
    expect(retagged.controversy).not.toBeNull();
    expect(retagged.tags).toEqual(['otra']);
  });
});
