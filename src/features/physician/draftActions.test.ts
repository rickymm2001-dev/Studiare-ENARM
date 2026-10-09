import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { Deck, Note } from '@/data/schemas/decks';
import { newId, testApi } from '@/data/testing/fixtures';
import { tipReviewsFrom } from '../shared/tipReviews';
import {
  decideNote,
  decideTip,
  InvalidTipError,
  pendingPublicNotes,
  reopenTip,
} from './draftActions';

const disposers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});
const setup = () => {
  const api = testApi('real');
  disposers.push(api.dispose);
  return api;
};
const physician = { id: newId() };
const base = 'Antes de elegir, lee el caso hasta el final y busca el dato que descarta tu idea.';

const deck = (name: string, visibility: Deck['visibility']): Deck => ({
  id: newId(),
  name,
  description: '',
  ownerId: null,
  origin: 'preloaded',
  visibility,
  isDemo: true,
  createdAt: '2026-10-01T10:00:00.000Z',
});
const note = (deckId: string, editorialStatus: Note['editorialStatus'] = 'draft'): Note => ({
  id: newId(),
  deckId,
  tags: [],
  origin: 'preloaded',
  editorialStatus,
  sourceQuote: null,
  sourceQuestionVersionId: null,
  isDemo: true,
  createdAt: '2026-10-01T10:00:00.000Z',
  kind: 'basic',
  front: 'Frente',
  back: 'Reverso',
});

describe('revisión de consejos', () => {
  it('aprobar con el mismo texto queda aprobado y con cambios queda editado', async () => {
    const api = setup();
    const approved = await decideTip(api, physician, {
      biasKey: 'anchoring',
      baseTip: base,
      tip: base,
      decision: 'approve',
    });
    expect(approved).toMatchObject({ status: 'approved', userId: null, decidedBy: physician.id });
    const edited = await decideTip(api, physician, {
      biasKey: 'anchoring',
      baseTip: base,
      tip: `${base} Hazlo siempre.`,
      decision: 'approve',
    });
    // Es el mismo artefacto: decidir otra vez lo reemplaza
    expect(edited.id).toBe(approved.id);
    expect(edited.status).toBe('edited');
    expect(await api.repos.aiArtifacts.list()).toHaveLength(1);
    expect(tipReviewsFrom(await api.repos.aiArtifacts.list()).get('anchoring')?.tip).toContain(
      'Hazlo siempre',
    );
  });

  it('rechazar guarda la decisión y el texto base revisado', async () => {
    const api = setup();
    const rejected = await decideTip(api, physician, {
      biasKey: 'framing_effect',
      baseTip: base,
      tip: '',
      decision: 'reject',
    });
    expect(rejected.status).toBe('rejected');
    expect(tipReviewsFrom([rejected]).get('framing_effect')?.status).toBe('rejected');
  });

  it('un texto muy corto o muy largo no se aprueba', async () => {
    const api = setup();
    await expect(
      decideTip(api, physician, { biasKey: 'a', baseTip: base, tip: 'Corto', decision: 'approve' }),
    ).rejects.toBeInstanceOf(InvalidTipError);
    await expect(
      decideTip(api, physician, {
        biasKey: 'a',
        baseTip: base,
        tip: 'x'.repeat(501),
        decision: 'approve',
      }),
    ).rejects.toBeInstanceOf(InvalidTipError);
    expect(await api.repos.aiArtifacts.list()).toHaveLength(0);
  });

  it('reabrir quita la decisión', async () => {
    const api = setup();
    await decideTip(api, physician, {
      biasKey: 'anchoring',
      baseTip: base,
      tip: base,
      decision: 'approve',
    });
    await reopenTip(api, 'anchoring');
    expect(await api.repos.aiArtifacts.list()).toHaveLength(0);
  });
});

describe('tarjetas de mazos públicos', () => {
  it('lista solo las notas pendientes de mazos públicos, ordenadas por mazo', () => {
    const b = deck('B mazo', 'public');
    const a = deck('A mazo', 'public');
    const mine = deck('Mío', 'private');
    const pending = [note(b.id), note(a.id), note(a.id, 'in_review')];
    const view = pendingPublicNotes(
      [b, a, mine],
      [...pending, note(a.id, 'approved'), note(a.id, 'rejected'), note(mine.id)],
    );
    expect(view).toHaveLength(3);
    expect(view.map((item) => item.deck.name)).toEqual(['A mazo', 'A mazo', 'B mazo']);
  });

  it('aprobar o rechazar cambia el estado y marca la modificación', async () => {
    const api = setup();
    const d = deck('Público', 'public');
    const n = note(d.id);
    await api.repos.decks.put(d);
    await api.repos.notes.put(n);
    const at = new Date('2026-10-09T10:00:00Z');
    const approved = await decideNote(api, n.id, 'approved', at);
    expect(approved).toMatchObject({
      editorialStatus: 'approved',
      updatedAt: '2026-10-09T10:00:00.000Z',
    });
    expect((await api.repos.notes.get(n.id))?.editorialStatus).toBe('approved');
    await expect(decideNote(api, newId(), 'approved')).rejects.toThrow('ya no existe');
  });
});
