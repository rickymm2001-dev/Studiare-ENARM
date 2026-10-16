// @vitest-environment jsdom
// La tarjeta de Mis errores de una pregunta de Inglés médico (B13). Una tarjeta con el texto completo,
// sin la fuente y sin el idioma marcado era el hallazgo de la revisión independiente.
import { describe, expect, it } from 'vitest';
import { createCardSanitizer } from '@/data/content/cardHtml';
import { formatPassageSource } from '@/data/content/passageSource';
import { makeEnglishCase, TEST_ENGLISH_SOURCE } from '@/data/testing/english';
import { makeQuestionWithOptions } from '@/data/testing/fixtures';
import { errorCardContent } from './errorCardContent';

const sanitizer = createCardSanitizer(window);
const noMedia = () => null;

/** Un texto de unos 8,000 caracteres, el máximo que acepta el banco */
const LONG_TEXT = Array.from(
  { length: 160 },
  (_, index) => `[Prueba] Sentence number ${index + 1} of the simulated reading passage.`,
).join(' ');

function englishBundle(overrides: Parameters<typeof makeEnglishCase>[1] = {}) {
  const { bundles } = makeEnglishCase(3, overrides);
  const first = bundles[0];
  if (!first) throw new Error('El caso de prueba no trae preguntas');
  return { question: first.question, options: first.options, vignette: LONG_TEXT };
}

describe('tarjeta de una pregunta fallada de Inglés médico', () => {
  it('al frente va el fragmento corto del texto y no el texto completo', () => {
    expect(LONG_TEXT.length).toBeGreaterThan(7_500);
    const content = errorCardContent(englishBundle(), null);
    const front = content?.front ?? '';
    expect(front.length).toBeLessThan(1_000);
    expect(front).toContain('[Prueba] Sentence number 1 of the simulated reading passage.');
    expect(front).not.toContain('Sentence number 100');
    expect(front).toContain('…');
    // El resto de la tarjeta tampoco trae el texto entero
    expect(content?.back ?? '').not.toContain('Sentence number 100');
  });

  it('el inglés va en un span lang en, y la explicación en español no', () => {
    const data = englishBundle();
    const wrong = data.options.find((option) => !option.isCorrect);
    const content = errorCardContent(data, wrong?.id ?? null);
    const front = content?.front ?? '';
    const back = content?.back ?? '';
    expect(front).toMatch(/^<p><span lang="en">\[Prueba\] Sentence number 1 /);
    expect(front).toContain(
      '<p><strong><span lang="en">[Prueba] Which statement is correct? (item 1)</span></strong></p>',
    );
    const correct = data.options.find((option) => option.isCorrect);
    expect(back).toContain(
      `<strong>Respuesta correcta.</strong> <span lang="en">${correct?.text}</span>`,
    );
    expect(back).toContain(`<strong>Elegiste.</strong> <span lang="en">${wrong?.text}</span>`);
    // La explicación y la justificación del banco están en español
    expect(back).toContain('<p>[Prueba] Explicación simulada 1</p>');
    expect(back).not.toContain('<span lang="en">[Prueba] Explicación');
    expect(back).toContain(`<em>Por qué atrae.</em> ${wrong?.rationale}`);
    expect(back).not.toContain(`<span lang="en">${wrong?.rationale}`);
  });

  it('atrás va la fuente del texto con su licencia', () => {
    const content = errorCardContent(englishBundle(), null);
    expect(content?.back).toContain(
      '<p><strong>Fuente del texto.</strong> <span lang="en">[Prueba] Texto simulado</span>. Texto propio del equipo Studiare.</p>',
    );
  });

  it('con una licencia que pide enlace, la fuente trae el título, la licencia y el enlace', () => {
    const source = formatPassageSource({
      title: 'Heart Attack, MedlinePlus.gov (NLM)',
      license: 'public_domain',
      url: 'https://medlineplus.gov/heartattack.html?a=1&b=2',
    });
    const data = englishBundle({ gpcRefs: [{ title: source, status: 'to_verify' }] });
    const back = errorCardContent(data, null)?.back ?? '';
    expect(back).toContain(
      '<span lang="en">Heart Attack, MedlinePlus.gov (NLM)</span>. Dominio público. https://medlineplus.gov/heartattack.html?a=1&amp;b=2</p>',
    );
  });

  it('si la fuente no es válida deja la primera referencia para no perder la atribución', () => {
    const data = englishBundle({
      gpcRefs: [{ title: 'Fuente del texto. Sin licencia <b>', status: 'to_verify' }],
    });
    const back = errorCardContent(data, null)?.back ?? '';
    expect(back).toContain('<p>Fuente del texto. Sin licencia &lt;b&gt;</p>');
    expect(errorCardContent(englishBundle({ gpcRefs: [] }), null)?.back).not.toContain(
      'Fuente del texto',
    );
  });

  it('el saneador de las tarjetas conserva el idioma, así que el lector de pantalla lo recibe', () => {
    const content = errorCardContent(englishBundle(), null);
    const front = sanitizer.sanitize(content?.front ?? '', noMedia);
    const back = sanitizer.sanitize(content?.back ?? '', noMedia);
    expect(front).toContain('<span lang="en">[Prueba] Sentence number 1');
    expect(back).toContain('<span lang="en">[Prueba] Texto simulado</span>');
  });

  it('una pregunta en español queda igual que antes, sin idioma ni fuente', () => {
    const { question, options } = makeQuestionWithOptions();
    const content = errorCardContent({ question, options, vignette: 'Hombre de 60 años.' }, null);
    expect(`${content?.front}${content?.back}`).not.toContain('lang=');
    expect(content?.back).not.toContain('Fuente del texto');
    expect(TEST_ENGLISH_SOURCE).toContain('Fuente del texto');
  });

  it('un texto con la pregunta sin viñeta propia no deja un párrafo vacío', () => {
    const data = { ...englishBundle(), vignette: '   ' };
    expect(errorCardContent(data, null)?.front).toBe(
      '<p><strong><span lang="en">[Prueba] Which statement is correct? (item 1)</span></strong></p>',
    );
  });
});
