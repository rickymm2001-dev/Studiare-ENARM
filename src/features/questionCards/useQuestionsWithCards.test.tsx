// @vitest-environment jsdom
// Las preguntas con las que el alumno ya creó una tarjeta (B5, comentario 1). Se leen de sus
// eventos question_card_created, sobreviven a volver a montar el gancho, como al recargar la
// página, y salen de la base activa sin mezclar la de demostración con la real.
import 'fake-indexeddb/auto';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useDataApi, type DataApi } from '@/data/context';
import { DataProvider } from '@/data/DataProvider';
import type { DatabaseKind } from '@/data/databases';
import { createEvent } from '@/data/events/createEvent';
import { newId } from '@/data/testing/fixtures';
import { questionsWithCards, useQuestionsWithCards } from './useQuestionsWithCards';

const TZ = 'America/Mexico_City';

/** El evento que deja Crear tarjeta. La pregunta va por su ID estable y por el de su versión */
function cardCreated(userId: string, questionId: string) {
  return createEvent(
    'question_card_created',
    {
      questionId,
      questionVersionId: newId(),
      version: 1,
      deckId: newId(),
      noteDeckId: newId(),
      noteId: newId(),
      source: 'bank',
      artifactId: null,
      from: 'practice_review',
    },
    { userId, tz: TZ },
  );
}

// Las bases que tocó cada prueba, para dejarlas vacías al terminar
const used = new Set<DataApi>();

afterEach(async () => {
  // Primero se desmontan los ganchos, así ninguna consulta viva queda leyendo una base cerrada
  cleanup();
  for (const api of used) {
    await (api.deleteAllData ? api.deleteAllData() : api.demo?.clear());
  }
  used.clear();
});

/** Monta el gancho dentro de una base, como la app con la base activa */
function mount(kind: DatabaseKind, userId: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <DataProvider kind={kind}>{children}</DataProvider>
  );
  const hook = renderHook(() => ({ api: useDataApi(), cards: useQuestionsWithCards(userId) }), {
    wrapper,
  });
  used.add(hook.result.current.api);
  return hook;
}

describe('preguntas con tarjeta creada (B5, comentario 1)', () => {
  it('solo cuentan los eventos de tarjeta creada y por el ID estable de la pregunta', () => {
    const userId = newId();
    const questionId = newId();
    const created = cardCreated(userId, questionId);
    const motive = createEvent(
      'cause_reported',
      { targetKind: 'question', targetId: newId(), cause: 'knowledge' },
      { userId, tz: TZ },
    );
    expect(questionsWithCards([])).toEqual(new Set());
    expect(questionsWithCards([motive])).toEqual(new Set());
    // Dos tarjetas con la misma pregunta, en dos mazos, cuentan como una pregunta
    expect(questionsWithCards([motive, created, cardCreated(userId, questionId)])).toEqual(
      new Set([questionId]),
    );
  });

  it('sin tarjeta no hay ninguna, con tarjeta aparece al momento y sigue al volver a montar el gancho', async () => {
    const userId = newId();
    const questionId = newId();
    const first = mount('real', userId);
    await waitFor(() => {
      expect(first.result.current.cards).toEqual(new Set());
    });

    await first.result.current.api.recordEvent(cardCreated(userId, questionId));
    await waitFor(() => {
      expect(first.result.current.cards).toEqual(new Set([questionId]));
    });

    // Como al recargar la página. Nada vive en memoria y se lee otra vez de la bitácora
    first.unmount();
    const again = mount('real', userId);
    await waitFor(() => {
      expect(again.result.current.cards).toEqual(new Set([questionId]));
    });
  });

  it('solo lee lo del alumno en la base activa, sin mezclar la de demostración con la real', async () => {
    const userId = newId();
    const realQuestion = newId();
    const demoQuestion = newId();
    const real = mount('real', userId);
    const demo = mount('demo', userId);
    await real.result.current.api.recordEvent(cardCreated(userId, realQuestion));
    // La tarjeta de otro alumno en la misma base no cuenta
    await real.result.current.api.recordEvent(cardCreated(newId(), newId()));
    await demo.result.current.api.recordEvent(cardCreated(userId, demoQuestion));

    await waitFor(() => {
      expect(real.result.current.cards).toEqual(new Set([realQuestion]));
      expect(demo.result.current.cards).toEqual(new Set([demoQuestion]));
    });
  });
});
