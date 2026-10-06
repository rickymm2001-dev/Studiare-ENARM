import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { makeQuestionWithOptions, makeUser, testApi } from '@/data/testing/fixtures';
import { contrastCardContent, contrastKey, createContrastCards } from './contrastCards';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

function pair() {
  const a = makeQuestionWithOptions();
  const b = makeQuestionWithOptions();
  a.question.prompt = '¿Qué fármaco baja la mortalidad?';
  a.question.explanation = 'Explicación A';
  a.options = a.options.map((option) =>
    option.isCorrect ? { ...option, text: 'Carvedilol' } : option,
  );
  b.question.prompt = '¿Qué fármaco alivia la congestión <b>ya</b>?';
  b.question.explanation = 'Explicación B';
  b.options = b.options.map((option) =>
    option.isCorrect ? { ...option, text: 'Furosemida' } : option,
  );
  return { a, b };
}

describe('tarjeta de contraste', () => {
  it('pone las dos respuestas lado a lado y atrás la explicación de cada una, escapado', () => {
    const { a, b } = pair();
    const content = contrastCardContent(a, b);
    expect(content?.front).toContain('Distingue estas dos respuestas');
    expect(content?.front).toContain('<strong>Carvedilol</strong>');
    expect(content?.front).toContain('<strong>Furosemida</strong>');
    expect(content?.front).toContain('¿Qué fármaco alivia la congestión &lt;b&gt;ya&lt;/b&gt;?');
    expect(content?.front).toContain('¿Qué las diferencia?');
    expect(content?.back).toBe(
      '<p><strong>Carvedilol</strong></p><p>Explicación A</p><p><strong>Furosemida</strong></p><p>Explicación B</p>',
    );
    expect(content?.quote).toBe('Explicación A');
  });

  it('sin la clave de alguna de las dos no hay tarjeta', () => {
    const { a, b } = pair();
    b.options = b.options.map((option) => ({ ...option, isCorrect: false }));
    expect(contrastCardContent(a, b)).toBeNull();
  });

  it('la clave del par no depende del orden', () => {
    expect(contrastKey('b', 'a')).toBe(contrastKey('a', 'b'));
  });

  it('crea la tarjeta en Mis errores una sola vez, con el estado más débil de las dos', async () => {
    const api = testApi('real');
    disposers.push(api.dispose);
    const user = makeUser();
    const { a, b } = pair();
    a.question.editorialStatus = 'approved';
    b.question.editorialStatus = 'draft';
    const bundles = new Map([
      [a.question.id, a],
      [b.question.id, b],
    ]);
    const pairs = [{ failedId: a.question.id, chosenId: b.question.id }];
    expect(await createContrastCards(api, user, pairs, bundles)).toBe(1);
    // Al revés es el mismo par y no se repite
    expect(
      await createContrastCards(
        api,
        user,
        [{ failedId: b.question.id, chosenId: a.question.id }],
        bundles,
      ),
    ).toBe(0);
    const [note] = await api.repos.notes.list();
    expect(note).toMatchObject({
      origin: 'generated',
      editorialStatus: 'draft',
      isDemo: true,
      sourceQuestionVersionId: a.question.id,
    });
    // Una pregunta que ya no está en el banco se omite sin romper
    expect(
      await createContrastCards(api, user, [{ failedId: a.question.id, chosenId: 'x' }], bundles),
    ).toBe(0);
  });
});
