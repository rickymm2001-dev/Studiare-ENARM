// Tarjetas con IA desde un apunte, en modo simulado (B6 del plan del cambio, D-085). Cada propuesta
// se ancla a la frase literal de una línea del apunte, llega como borrador y se acepta o se descarta
// una por una. Lo aceptado va al mazo del apunte con su tema, la sincronización del apunte no lo
// retira y sigue al apunte cuando cambian su mazo o su tema.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { simulatedGenerator, type CardGenerator } from '../../ai/flashcards';
import { generateOutlineCards } from '../../ai/outlineCards';
import type { OutlineNode } from '../../engines/outline';
import { isAiNote, isLive } from '../schemas/decks';
import { makeUser, newId, testApi } from '../testing/fixtures';
import { AI_TAG, recordGeneration, saveNoteAndSignals, saveProposals } from './aiCards';
import { createManualDeck, draftOf } from './manualDecks';
import { acceptOutlineProposal, discardOutlineProposal } from './outlineAi';
import { createOutline, freeSubjectCardIds, saveOutline, updateOutlineSettings } from './outlines';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

function setup() {
  const api = testApi('real');
  disposers.push(api.dispose);
  return { api, user: makeUser() };
}

const NOW = new Date('2026-10-13T15:00:00.000Z');
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

const line = (text: string, ...children: OutlineNode[]): OutlineNode => ({
  id: newId(),
  text,
  children,
});

const METFORMIN = 'La metformina es el tratamiento de primera línea de la diabetes mellitus tipo 2';
const DOSE = 'La dosis inicial habitual es de 500 mg cada 12 horas con los alimentos';

/** Un apunte de Endocrinología con dos líneas sin marca y una que ya es tarjeta */
async function diabetesOutline(api: ReturnType<typeof testApi>, user: ReturnType<typeof makeUser>) {
  const outline = await createOutline(
    api,
    user,
    {
      title: 'Diabetes',
      subject: { kind: 'enarm', branch: 'internal_medicine', topic: 'endocrinology' },
    },
    NOW,
  );
  const nodes = [
    line('Tratamiento', line(METFORMIN), line(DOSE), line('Meta de HbA1c >> Menor de 7%')),
  ];
  const saved = await saveOutline(api, user, { outlineId: outline.id, nodes }, NOW);
  return { outline: saved.outline, nodes };
}

describe('generar tarjetas de un apunte en modo simulado', () => {
  it('cada propuesta pasa el validador y cita tal cual una línea del apunte', async () => {
    const { api, user } = setup();
    const { nodes } = await diabetesOutline(api, user);
    const { proposals, result, source } = await generateOutlineCards({
      nodes,
      generator: simulatedGenerator,
    });
    expect(result.mode).toBe('template');
    expect(proposals.map((proposal) => proposal.quote)).toEqual([METFORMIN, DOSE]);
    const lineIds = nodes[0]?.children.map((child) => child.id) ?? [];
    expect(proposals.map((proposal) => proposal.nodeId)).toEqual(lineIds.slice(0, 2));
    // La línea que ya era tarjeta no se mandó a la IA
    expect(source.text).not.toContain('HbA1c');
  });

  it('una propuesta cuya cita no está en una sola línea se descarta y se cuenta', async () => {
    const nodes = [line('Diabetes', line(METFORMIN), line(DOSE))];
    // Un generador que cita un pedazo que cruza de una línea a la otra. Pasa el validador, porque
    // está en la sección, pero no se puede anclar a una sola línea del alumno
    const crossing: CardGenerator = {
      mode: 'template',
      model: 'prueba',
      generate: (section) =>
        Promise.resolve([
          {
            kind: 'basic' as const,
            front: '¿Qué sigue después de la diabetes tipo 2?',
            back: 'La dosis inicial habitual',
            quote: 'diabetes mellitus tipo 2. La dosis inicial habitual',
          },
          {
            kind: 'cloze' as const,
            front: 'La dosis inicial habitual es de {{c1::500 mg}} cada 12 horas',
            back: '',
            quote: section.text.includes(DOSE) ? DOSE : 'nada',
          },
        ]),
    };
    const { proposals, result } = await generateOutlineCards({ nodes, generator: crossing });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.quote).toBe(DOSE);
    expect(result.proposals).toHaveLength(1);
    expect(result.rejectedBy.quote_not_in_source).toBe(1);
  });
});

describe('aceptar o descartar una por una', () => {
  it('aceptar guarda un borrador en el mazo del apunte, con su cita, su fuente y su tema', async () => {
    const { api, user } = setup();
    const { outline, nodes } = await diabetesOutline(api, user);
    const generation = await generateOutlineCards({ nodes, generator: simulatedGenerator });
    const recorded = await recordGeneration(
      api,
      user,
      'monthly',
      generation.result,
      outline.title,
      NOW,
    );
    const [first, second] = generation.proposals;
    if (!first || !second) throw new Error('Faltan propuestas');

    const saved = await acceptOutlineProposal(
      api,
      user,
      { outlineId: outline.id, proposal: first, artifactId: recorded.artifactId, simulated: true },
      later(1),
    );
    expect(saved).toMatchObject({ deckId: outline.deckId, notes: 1, cards: 1, flagged: 0 });
    const notes = (await api.repos.notes.list()).filter((note) => isAiNote(note));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      deckId: outline.deckId,
      origin: 'generated',
      editorialStatus: 'draft',
      sourceQuote: METFORMIN,
      sourceTitle: 'Diabetes',
    });
    expect(notes[0]?.tags).toEqual(['topic:endocrinology', AI_TAG, 'Tratamiento']);
    expect(notes[0]?.outlineId ?? null).toBeNull();
    let artifact = await api.repos.aiArtifacts.get(recorded.artifactId);
    expect(artifact).toMatchObject({ status: 'approved', decidedBy: user.id });
    expect(artifact?.content).toMatchObject({ saved: 1 });

    // La segunda se acepta después con el mismo artefacto, que solo suma
    await acceptOutlineProposal(
      api,
      user,
      { outlineId: outline.id, proposal: second, artifactId: recorded.artifactId, simulated: true },
      later(2),
    );
    artifact = await api.repos.aiArtifacts.get(recorded.artifactId);
    expect(artifact?.content).toMatchObject({ saved: 2 });
    const events = await api.repos.events.query({ userId: user.id });
    expect(events.filter((event) => event.type === 'ai_artifact_approved')).toHaveLength(1);

    // Guardar el apunte no retira las tarjetas de la IA, que no son de una línea
    await saveOutline(
      api,
      user,
      { outlineId: outline.id, nodes: [line('Otra cosa >> Distinta')] },
      later(3),
    );
    const live = (await api.repos.notes.list()).filter((note) => isAiNote(note) && isLive(note));
    expect(live).toHaveLength(2);
  });

  it('descartar todas sin aceptar ninguna deja el artefacto rechazado y no guarda nada', async () => {
    const { api, user } = setup();
    const { outline, nodes } = await diabetesOutline(api, user);
    const generation = await generateOutlineCards({ nodes, generator: simulatedGenerator });
    const recorded = await recordGeneration(
      api,
      user,
      'monthly',
      generation.result,
      outline.title,
      NOW,
    );
    await discardOutlineProposal(api, user, { artifactId: recorded.artifactId, pending: 1 }, NOW);
    let artifact = await api.repos.aiArtifacts.get(recorded.artifactId);
    expect(artifact).toMatchObject({ status: 'draft' });
    expect(artifact?.content).toMatchObject({ discarded: 1 });
    await discardOutlineProposal(api, user, { artifactId: recorded.artifactId, pending: 0 }, NOW);
    artifact = await api.repos.aiArtifacts.get(recorded.artifactId);
    expect(artifact).toMatchObject({ status: 'rejected', decidedBy: user.id });
    expect(artifact?.content).toMatchObject({ discarded: 2 });
    const events = await api.repos.events.query({ userId: user.id });
    expect(events.filter((event) => event.type === 'ai_artifact_rejected')).toHaveLength(1);
    expect((await api.repos.notes.list()).filter((note) => isAiNote(note))).toEqual([]);
  });

  it('lo aceptado sigue al apunte cuando cambian su mazo y su tema, sin quedar unido a una línea', async () => {
    const { api, user } = setup();
    const { outline, nodes } = await diabetesOutline(api, user);
    const generation = await generateOutlineCards({ nodes, generator: simulatedGenerator });
    const recorded = await recordGeneration(
      api,
      user,
      'monthly',
      generation.result,
      outline.title,
      NOW,
    );
    const [first] = generation.proposals;
    if (!first) throw new Error('Falta la propuesta');
    await acceptOutlineProposal(
      api,
      user,
      { outlineId: outline.id, proposal: first, artifactId: recorded.artifactId, simulated: true },
      later(1),
    );
    const [accepted] = (await api.repos.notes.list()).filter((note) => isAiNote(note));
    if (!accepted) throw new Error('Falta la tarjeta aceptada');
    expect(accepted).toMatchObject({ deckId: outline.deckId, sourceOutlineId: outline.id });
    expect(accepted.outlineId ?? null).toBeNull();
    expect(accepted.outlineNodeId ?? null).toBeNull();
    // Una tarjeta con IA de un PDF no es del apunte y no lo sigue
    const fromPdf = await saveProposals(
      api,
      user,
      { proposals: [first], sourceTitle: 'Guía.pdf', artifactId: newId(), simulated: true },
      later(2),
    );
    const [pdfNote] = (await api.repos.notes.list()).filter(
      (note) => note.sourceTitle === 'Guía.pdf',
    );

    // El apunte pasa a un mazo de clases con una materia libre
    const classes = await createManualDeck(api, user, { name: 'Clases' }, later(3));
    const farmacology = { kind: 'free', name: 'Farmacología' } as const;
    const moved = await updateOutlineSettings(
      api,
      user,
      { outlineId: outline.id, deck: { kind: 'deck', deckId: classes.id }, subject: farmacology },
      later(4),
    );
    expect(moved.aiNotes).toBe(1);
    const after = await api.repos.notes.get(accepted.id);
    expect(after).toMatchObject({ deckId: classes.id, sourceOutlineId: outline.id });
    // Sin la etiqueta del tema de antes, con la nueva primero, y las demás se quedan
    expect(after?.tags).toEqual(['Materia::Farmacología', AI_TAG, 'Tratamiento']);
    const cards = await api.repos.cards.listAllForNotes([accepted.id]);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((card) => card.deckId === classes.id)).toBe(true);
    // La del PDF sigue donde estaba
    expect(await api.repos.notes.get(pdfNote?.id ?? '')).toMatchObject({
      deckId: fromPdf.deckId,
      tags: pdfNote?.tags,
    });
    // Ahora es de una materia libre, así que Conócete la deja fuera
    const free = await freeSubjectCardIds(api);
    expect(cards.every((card) => free.has(card.id))).toBe(true);

    // Repetir no escribe nada
    const before = await api.repos.notes.get(accepted.id);
    const again = await updateOutlineSettings(
      api,
      user,
      { outlineId: outline.id, deck: { kind: 'deck', deckId: classes.id }, subject: farmacology },
      later(5),
    );
    expect(again.aiNotes).toBe(0);
    expect(await api.repos.notes.get(accepted.id)).toEqual(before);

    // Editarla a mano en su mazo no la separa del apunte, y el tema vuelve con el apunte
    const draft = draftOf(accepted);
    const edited = await saveNoteAndSignals(
      api,
      user,
      {
        deckId: classes.id,
        noteId: accepted.id,
        draft:
          draft.kind === 'cloze' ? { ...draft, extra: 'Con comida' } : { ...draft, back: 'Sí' },
      },
      later(6),
    );
    expect(edited.sourceOutlineId).toBe(outline.id);
    const back = await updateOutlineSettings(
      api,
      user,
      {
        outlineId: outline.id,
        deck: { kind: 'deck', deckId: classes.id },
        subject: { kind: 'enarm', branch: 'internal_medicine', topic: 'endocrinology' },
      },
      later(7),
    );
    expect(back.aiNotes).toBe(1);
    expect((await api.repos.notes.get(accepted.id))?.tags).toEqual([
      'topic:endocrinology',
      AI_TAG,
      'Tratamiento',
    ]);
  });

  it('no deja aceptar en el apunte de otro alumno', async () => {
    const { api, user } = setup();
    const { outline, nodes } = await diabetesOutline(api, user);
    const generation = await generateOutlineCards({ nodes, generator: simulatedGenerator });
    const [first] = generation.proposals;
    if (!first) throw new Error('Falta la propuesta');
    await expect(
      acceptOutlineProposal(api, makeUser(), {
        outlineId: outline.id,
        proposal: first,
        artifactId: newId(),
        simulated: true,
      }),
    ).rejects.toThrow();
  });
});
