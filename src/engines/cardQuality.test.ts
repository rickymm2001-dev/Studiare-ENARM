import { describe, expect, it } from 'vitest';
import { DEFAULT_CARD_QUALITY, type CardQualityConfig } from '@/config/cardQuality';
import { checkCardQuality, type CardDraft, type CardQualityIssue } from './cardQuality';

const words = (count: number, word = 'palabra') =>
  Array.from({ length: count }, () => word).join(' ');
const basic = (front: string, back: string): CardDraft => ({ kind: 'basic', front, back });
const reverse = (front: string, back: string): CardDraft => ({
  kind: 'basic_reverse',
  front,
  back,
});
const cloze = (text: string, extra?: string): CardDraft =>
  extra === undefined ? { kind: 'cloze', text } : { kind: 'cloze', text, extra };

const codes = (issues: CardQualityIssue[]) => issues.map((issue) => issue.code);
const only = <C extends CardQualityIssue['code']>(issues: CardQualityIssue[], code: C) =>
  issues.find((issue): issue is Extract<CardQualityIssue, { code: C }> => issue.code === code);

describe('tarjetas buenas', () => {
  it('una pregunta corta con una respuesta corta no da avisos', () => {
    expect(
      checkCardQuality(
        basic(
          '¿Cuál es el tratamiento de primera línea de la preeclampsia severa?',
          'Sulfato de magnesio',
        ),
      ),
    ).toEqual([]);
  });

  it('un cloze con una sola idea y contexto no da avisos', () => {
    expect(
      checkCardQuality(
        cloze(
          'El tratamiento de primera línea de la preeclampsia severa es {{c1::sulfato de magnesio}}',
        ),
      ),
    ).toEqual([]);
  });

  it('los campos vacíos no dan avisos, de eso se encarga el editor', () => {
    expect(checkCardQuality(basic('', ''))).toEqual([]);
    expect(checkCardQuality(basic('<p> </p>', '<br>'))).toEqual([]);
    expect(checkCardQuality(cloze(''))).toEqual([]);
    expect(checkCardQuality(cloze('Un texto sin ningún hueco'))).toEqual([]);
  });

  it('la nota extra de un cloze no se revisa', () => {
    expect(
      checkCardQuality(cloze('El {{c1::bazo}} es el órgano que filtra la sangre', words(300))),
    ).toEqual([]);
  });
});

describe('largo de la pregunta, la respuesta y el texto cloze', () => {
  it('avisa de un frente largo con sugerencia y luego con aviso', () => {
    expect(checkCardQuality(basic(words(30), 'ok'))).toEqual([]);
    const note = checkCardQuality(basic(words(31), 'ok'));
    expect(note).toEqual([{ code: 'front_too_long', severity: 'note', words: 31, limit: 30 }]);
    const warning = checkCardQuality(basic(words(61), 'ok'));
    expect(warning).toEqual([
      { code: 'front_too_long', severity: 'warning', words: 61, limit: 30 },
    ]);
  });

  it('cuenta lo que ve el alumno, no las etiquetas ni las entidades', () => {
    const html = `<p><b>${words(15)}</b></p><p>${words(15)}&nbsp;&amp;</p>`;
    expect(checkCardQuality(basic(html, 'ok'))).toEqual([]);
    expect(codes(checkCardQuality(basic(`${html}<p>una más</p>`, 'ok')))).toEqual([
      'front_too_long',
    ]);
  });

  it('avisa de una respuesta larga con sugerencia y luego con aviso', () => {
    expect(checkCardQuality(basic('Pregunta', words(25)))).toEqual([]);
    expect(only(checkCardQuality(basic('Pregunta', words(26))), 'back_too_long')).toEqual({
      code: 'back_too_long',
      severity: 'note',
      words: 26,
      limit: 25,
    });
    expect(only(checkCardQuality(basic('Pregunta', words(51))), 'back_too_long')?.severity).toBe(
      'warning',
    );
  });

  it('avisa de un texto cloze largo, sin contar las marcas del hueco', () => {
    const text = (count: number) => `${words(count - 2, 'dato')} {{c1::sulfato de}}`;
    expect(codes(checkCardQuality(cloze(text(35))))).not.toContain('text_too_long');
    expect(only(checkCardQuality(cloze(text(36))), 'text_too_long')).toEqual({
      code: 'text_too_long',
      severity: 'note',
      words: 36,
      limit: 35,
    });
    expect(only(checkCardQuality(cloze(text(71))), 'text_too_long')?.severity).toBe('warning');
  });

  it('respeta los umbrales que reciba', () => {
    const strict: CardQualityConfig = {
      ...DEFAULT_CARD_QUALITY,
      frontWords: { max: 3, hardMax: 5 },
      backWords: { max: 1, hardMax: 2 },
    };
    expect(codes(checkCardQuality(basic('uno dos tres cuatro', 'ok ok ok'), strict))).toEqual([
      'back_too_long',
      'front_too_long',
    ]);
    expect(checkCardQuality(basic('uno dos tres', 'ok'), strict)).toEqual([]);
  });
});

describe('listas', () => {
  const items = (count: number) =>
    `<ul>${Array.from({ length: count }, (_, i) => `<li>Elemento ${i}</li>`).join('')}</ul>`;

  it('cuenta los elementos de una lista HTML', () => {
    expect(checkCardQuality(basic('Pregunta', items(3)))).toEqual([]);
    expect(only(checkCardQuality(basic('Pregunta', items(4))), 'list_too_long')).toEqual({
      code: 'list_too_long',
      severity: 'note',
      field: 'back',
      items: 4,
      limit: 3,
    });
    expect(only(checkCardQuality(basic('Pregunta', items(8))), 'list_too_long')?.severity).toBe(
      'warning',
    );
  });

  it('una lista no cuenta como varias ideas', () => {
    expect(codes(checkCardQuality(basic('Pregunta', items(10))))).toEqual(['list_too_long']);
  });

  it('cuenta viñetas y números en texto plano, aunque las líneas sean largas', () => {
    const line = 'un hallazgo que se describe con bastantes palabras para no ser corto';
    const bullets = ['-', '–', '•', '*'].map((mark) => `${mark} ${line}`).join('\n');
    expect(only(checkCardQuality(basic('Pregunta', bullets)), 'list_too_long')?.items).toBe(4);
    const numbered = ['1)', '2.', '(a)', 'b)', '10.'].map((mark) => `${mark} ${line}`).join('\n');
    expect(only(checkCardQuality(basic('Pregunta', numbered)), 'list_too_long')?.items).toBe(5);
  });

  it('un guion pegado a un número no es una viñeta', () => {
    const line = '-5 mmHg en la presión arterial media del paciente de hoy';
    const lines = Array.from({ length: 4 }, () => line).join('\n');
    expect(codes(checkCardQuality(basic('Pregunta', lines)))).not.toContain('list_too_long');
  });

  it('cuenta como lista cuatro o más líneas cortas aunque no traigan viñetas', () => {
    expect(
      only(checkCardQuality(basic('P', 'Fiebre\nTos\nDisnea\nDolor')), 'list_too_long')?.items,
    ).toBe(4);
    expect(checkCardQuality(basic('P', 'Fiebre\nTos\nDisnea'))).toEqual([]);
    // Una línea larga entre las demás ya no es una lista de líneas cortas
    const mixed = `Fiebre\nTos\nDisnea\n${words(12)}`;
    expect(codes(checkCardQuality(basic('P', mixed)))).not.toContain('list_too_long');
  });

  it('cuenta una enumeración con comas y con y, de fragmentos cortos', () => {
    const issue = only(
      checkCardQuality(basic('Síntomas', 'Fiebre, tos, disnea y dolor torácico')),
      'list_too_long',
    );
    expect(issue).toMatchObject({ items: 4, severity: 'note' });
    expect(checkCardQuality(basic('Síntomas', 'Fiebre, tos y disnea'))).toEqual([]);
    expect(only(checkCardQuality(basic('S', 'a; b; c; d')), 'list_too_long')?.items).toBe(4);
    expect(
      only(checkCardQuality(basic('S', 'uno e dos o tres u cuatro')), 'list_too_long')?.items,
    ).toBe(4);
  });

  it('ignora la frase que presenta la lista, antes de los dos puntos', () => {
    expect(
      checkCardQuality(
        basic('S', 'Los síntomas más frecuentes de esta enfermedad son: fiebre, tos y disnea'),
      ),
    ).toEqual([]);
    expect(
      only(
        checkCardQuality(
          basic(
            'S',
            'Los síntomas más frecuentes de esta enfermedad son: fiebre, tos, disnea y dolor',
          ),
        ),
        'list_too_long',
      )?.items,
    ).toBe(4);
  });

  it('una oración con comas y fragmentos largos no es una lista', () => {
    const sentence =
      'Reduce la producción hepática de glucosa, aumenta la sensibilidad periférica a la insulina, disminuye la absorción intestinal de glucosa, mejora el perfil de lípidos';
    expect(codes(checkCardQuality(basic('Metformina', sentence)))).not.toContain('list_too_long');
  });

  it('no parte los números con coma de millares ni los decimales', () => {
    expect(checkCardQuality(basic('Cifras', '1,000, 2,500, 1,000,000 y 0,5'))).toEqual([
      expect.objectContaining({ code: 'list_too_long', items: 4 }),
    ]);
    expect(checkCardQuality(basic('Cifra', '1,000,000'))).toEqual([]);
  });

  it('en cloze revisa el hueco, el texto y las líneas', () => {
    const inHole = checkCardQuality(cloze('Los síntomas son {{c1::fiebre, tos, disnea y dolor}}'));
    expect(inHole).toEqual([
      expect.objectContaining({ code: 'list_too_long', field: 'text', items: 4 }),
    ]);
    const lines = checkCardQuality(
      cloze('Criterios\n{{c1::Carditis}}\n{{c2::Artritis}}\n{{c3::Corea}}\n{{c4::Eritema}}'),
    );
    expect(only(lines, 'list_too_long')?.items).toBe(5);
  });

  it('respeta los umbrales que reciba', () => {
    const lax: CardQualityConfig = { ...DEFAULT_CARD_QUALITY, listItems: { max: 9, hardMax: 12 } };
    expect(checkCardQuality(basic('P', items(8)), lax)).toEqual([]);
  });
});

describe('varias ideas', () => {
  it('avisa de varias oraciones en la respuesta', () => {
    expect(checkCardQuality(basic('P', 'Es benigno. Se cura sola.'))).toEqual([]);
    expect(
      checkCardQuality(basic('P', 'Es benigno. Se cura sola. No requiere tratamiento.')),
    ).toEqual([
      { code: 'multiple_ideas', severity: 'note', field: 'back', sentences: 3, lines: 1 },
    ]);
    const many = 'Uno es. Dos es. Tres es. Cuatro es. Cinco es.';
    expect(only(checkCardQuality(basic('P', many)), 'multiple_ideas')).toMatchObject({
      severity: 'warning',
      sentences: 5,
    });
  });

  it('cuenta oraciones con ?, ! y puntos suspensivos', () => {
    expect(
      only(checkCardQuality(basic('P', '¿Sí? ¡Claro! Quizá… tal vez')), 'multiple_ideas')
        ?.sentences,
    ).toBe(4);
  });

  it('no parte las oraciones en abreviaturas, iniciales ni decimales', () => {
    expect(
      checkCardQuality(basic('P', 'El Dr. Pérez usó p. ej. 3.5 mg cada 8 h. Funcionó bien.')),
    ).toEqual([]);
    expect(checkCardQuality(basic('P', 'Dosis de 3.5 mg. Cada 8 horas. Por 5 días.'))).toEqual([
      expect.objectContaining({ code: 'multiple_ideas', sentences: 3 }),
    ]);
  });

  it('ignora lo que no tiene letras ni números', () => {
    expect(checkCardQuality(basic('P', 'Sí. ... ¡¡¡ Claro.'))).toEqual([]);
  });

  it('avisa de varios párrafos largos que no son lista', () => {
    const paragraph = `<p>${words(10)}</p>`;
    expect(only(checkCardQuality(basic('P', paragraph.repeat(3))), 'multiple_ideas')).toMatchObject(
      {
        severity: 'note',
        sentences: 3,
        lines: 3,
      },
    );
    expect(
      only(checkCardQuality(basic('P', paragraph.repeat(7))), 'multiple_ideas')?.severity,
    ).toBe('warning');
  });

  it('un salto de línea en HTML con br cuenta como otra línea', () => {
    const lines = `${words(10)}<br>${words(10)}<br>${words(10)}`;
    expect(only(checkCardQuality(basic('P', lines)), 'multiple_ideas')?.lines).toBe(3);
  });

  it('en cloze mira el texto completo', () => {
    const text = 'Primero {{c1::uno}} ocurre. Luego dos ocurre. Después tres ocurre.';
    expect(only(checkCardQuality(cloze(text)), 'multiple_ideas')).toMatchObject({
      field: 'text',
      sentences: 3,
    });
  });

  it('respeta los umbrales que reciba', () => {
    const lax: CardQualityConfig = {
      ...DEFAULT_CARD_QUALITY,
      sentences: { max: 5, hardMax: 8 },
      lines: { max: 5, hardMax: 8 },
    };
    expect(checkCardQuality(basic('P', 'Uno es. Dos es. Tres es. Cuatro es.'), lax)).toEqual([]);
  });
});

describe('varias preguntas', () => {
  it('avisa de dos signos de interrogación en el frente', () => {
    expect(checkCardQuality(basic('¿Qué es la FEVI? ¿Cómo se mide?', 'Un dato'))).toEqual([
      { code: 'multiple_questions', severity: 'note', questions: 2 },
    ]);
    expect(checkCardQuality(basic('¿Qué es la FEVI?', 'Un dato'))).toEqual([]);
    expect(checkCardQuality(basic('Dime la FEVI', 'Un dato'))).toEqual([]);
  });
});

describe('respuesta dentro de la pregunta', () => {
  it('avisa si la respuesta aparece en el frente, sin importar mayúsculas, acentos ni HTML', () => {
    expect(checkCardQuality(basic('¿Qué fármaco es la <b>Metformina</b>?', 'METFORMINA'))).toEqual([
      { code: 'answer_in_question', severity: 'warning', direction: 'forward' },
    ]);
    expect(checkCardQuality(basic('Órgano llamado corazón', 'Corazón'))).toHaveLength(1);
  });

  it('exige palabras completas y una respuesta de al menos tres letras', () => {
    expect(checkCardQuality(basic('¿Qué es la metformina?', 'mina'))).toEqual([]);
    expect(checkCardQuality(basic('¿Es benigno? no', 'no'))).toEqual([]);
    expect(checkCardQuality(basic('¿Es benigno? sí', 'sí'))).toEqual([]);
    expect(checkCardQuality(basic('Dato HTA', 'HTA'))).toHaveLength(1);
  });

  it('en básica con inversa también revisa que el frente no esté en la respuesta', () => {
    expect(checkCardQuality(reverse('Metformina', 'Metformina es una biguanida'))).toEqual([
      { code: 'answer_in_question', severity: 'warning', direction: 'reverse' },
    ]);
    expect(checkCardQuality(basic('Metformina', 'Metformina es una biguanida'))).toEqual([]);
    expect(checkCardQuality(reverse('Metformina', 'Una biguanida'))).toEqual([]);
  });

  it('si el texto es el mismo en las dos caras, la inversa lo dice una sola vez', () => {
    expect(checkCardQuality(reverse('Bazo', 'bazo'))).toEqual([
      { code: 'answer_in_question', severity: 'warning', direction: 'both' },
    ]);
    expect(checkCardQuality(basic('Bazo', 'bazo'))).toEqual([
      { code: 'answer_in_question', severity: 'warning', direction: 'forward' },
    ]);
  });
});

describe('huecos de cloze', () => {
  const holes = (count: number) =>
    `El cuadro incluye ${Array.from({ length: count }, (_, i) => `{{c${i + 1}::hallazgo${String.fromCharCode(97 + i)}}}`).join(' ')} y nada más`;

  it('avisa de demasiados huecos distintos', () => {
    expect(codes(checkCardQuality(cloze(holes(3))))).not.toContain('too_many_holes');
    expect(only(checkCardQuality(cloze(holes(4))), 'too_many_holes')).toEqual({
      code: 'too_many_holes',
      severity: 'note',
      holes: 4,
      limit: 3,
    });
    expect(only(checkCardQuality(cloze(holes(7))), 'too_many_holes')?.severity).toBe('warning');
  });

  it('los huecos con el mismo número cuentan una sola vez', () => {
    const same =
      '{{c1::uno}} {{c1::dos}} {{c1::tres}} {{c1::cuatro}} {{c1::cinco}} en total hay muchos';
    expect(codes(checkCardQuality(cloze(same)))).not.toContain('too_many_holes');
  });

  it('cuenta los huecos anidados', () => {
    const nested = '{{c1::A {{c2::B {{c3::C {{c4::D}}}}}}}} y otras cosas del tema general';
    expect(only(checkCardQuality(cloze(nested)), 'too_many_holes')?.holes).toBe(4);
  });

  it('avisa de un hueco que esconde demasiadas palabras y señala el peor', () => {
    const text = `El resultado es {{c1::${words(5, 'dato')}}} y también {{c2::${words(6, 'cosa')}}} en el cuadro clínico`;
    expect(only(checkCardQuality(cloze(text)), 'hole_answer_too_long')).toEqual({
      code: 'hole_answer_too_long',
      severity: 'note',
      ordinal: 2,
      words: 6,
      limit: 5,
    });
    const long = `El resultado completo es {{c1::${words(13, 'dato')}}} según varios estudios`;
    expect(only(checkCardQuality(cloze(long)), 'hole_answer_too_long')?.severity).toBe('warning');
  });

  it('en un hueco anidado el de afuera esconde también lo de adentro', () => {
    const text = `El cuadro completo incluye {{c1::${words(3, 'a')} {{c2::${words(3, 'b')}}}}} según la guía`;
    expect(only(checkCardQuality(cloze(text)), 'hole_answer_too_long')).toMatchObject({
      ordinal: 1,
      words: 6,
    });
  });

  it('avisa de un hueco con poco contexto y señala el que menos tiene', () => {
    const few = checkCardQuality(cloze('La {{c1::metformina}} es un fármaco'));
    expect(few).toEqual([
      { code: 'hole_without_context', severity: 'note', ordinal: 1, contextWords: 1, minimum: 3 },
    ]);
    const none = checkCardQuality(cloze('{{c1::Metformina}}'));
    expect(none).toEqual([
      {
        code: 'hole_without_context',
        severity: 'warning',
        ordinal: 1,
        contextWords: 0,
        minimum: 3,
      },
    ]);
    expect(
      checkCardQuality(cloze('El tratamiento de primera línea es {{c1::metformina}}')),
    ).toEqual([]);
  });

  it('las palabras cortas no cuentan como contexto y las pistas tampoco', () => {
    expect(
      only(checkCardQuality(cloze('El {{c1::bazo}} es un')), 'hole_without_context')?.contextWords,
    ).toBe(0);
    expect(
      only(
        checkCardQuality(cloze('{{c1::Metformina::tratamiento de primera línea}}')),
        'hole_without_context',
      )?.contextWords,
    ).toBe(0);
  });

  it('un hueco ve como contexto la respuesta de los demás huecos', () => {
    const issue = only(
      checkCardQuality(cloze('{{c1::Fiebre}} {{c2::persistente mayor}}')),
      'hole_without_context',
    );
    expect(issue).toMatchObject({ ordinal: 2, contextWords: 1 });
  });

  it('un hueco anidado queda tapado con el que lo contiene', () => {
    const text = 'En la diabetes {{c1::la metformina {{c2::reduce}} la glucosa}} según la guía';
    // Con c2 tapado se ven la mayoría de las palabras. Con c1 tapado se ve todo lo que está afuera
    expect(codes(checkCardQuality(cloze(text)))).not.toContain('hole_without_context');
  });

  it('respeta los umbrales que reciba', () => {
    const strict: CardQualityConfig = {
      ...DEFAULT_CARD_QUALITY,
      context: { min: 8, hardMin: 5, wordChars: 3 },
    };
    expect(
      only(
        checkCardQuality(cloze('El tratamiento de primera línea es {{c1::metformina}}'), strict),
        'hole_without_context',
      ),
    ).toMatchObject({ severity: 'warning', contextWords: 3, minimum: 8 });
  });
});

describe('respuesta dentro del texto cloze', () => {
  it('avisa si lo que esconde un hueco aparece en el resto del texto', () => {
    const text =
      'La metformina es un biguanida. La {{c1::metformina}} baja la glucosa del paciente';
    expect(checkCardQuality(cloze(text))).toEqual([
      { code: 'answer_in_cloze_text', severity: 'warning', ordinals: [1] },
    ]);
  });

  it('un hueco repetido con el mismo número no se delata a sí mismo', () => {
    const text =
      'La {{c1::metformina}} baja la glucosa y la {{c1::metformina}} no causa hipoglucemia';
    expect(codes(checkCardQuality(cloze(text)))).not.toContain('answer_in_cloze_text');
  });

  it('un hueco con otro número sí se ve, y avisa de los dos', () => {
    const text = 'La {{c1::insulina}} y la {{c2::insulina}} bajan la glucosa del paciente';
    expect(only(checkCardQuality(cloze(text)), 'answer_in_cloze_text')?.ordinals).toEqual([1, 2]);
  });

  it('la pista que contiene la respuesta la delata', () => {
    const text = 'El tratamiento de la diabetes es {{c1::metformina::la metformina o similar}}';
    expect(only(checkCardQuality(cloze(text)), 'answer_in_cloze_text')?.ordinals).toEqual([1]);
    const fine = 'El tratamiento de la diabetes es {{c1::metformina::un fármaco oral}}';
    expect(codes(checkCardQuality(cloze(fine)))).not.toContain('answer_in_cloze_text');
  });

  it('exige palabras completas y no avisa de respuestas de menos de tres letras', () => {
    expect(
      codes(
        checkCardQuality(
          cloze('La metformina es un fármaco. Es {{c1::mina}} de plata del paciente'),
        ),
      ),
    ).not.toContain('answer_in_cloze_text');
    expect(
      codes(checkCardQuality(cloze('Cada día es de {{c1::de}} verdad un dato clave del paciente'))),
    ).not.toContain('answer_in_cloze_text');
  });

  it('un hueco anidado no delata al que lo contiene', () => {
    const text =
      'La diabetes se trata con {{c1::fármacos como {{c2::metformina}} o insulina}} en general';
    expect(codes(checkCardQuality(cloze(text)))).not.toContain('answer_in_cloze_text');
  });
});

describe('orden de los avisos', () => {
  it('primero salen los warning y después los note, sin perder el orden entre iguales', () => {
    const issues = checkCardQuality(basic(`${words(31)} ¿uno? ¿dos?`, words(60)));
    expect(issues.map((issue) => [issue.code, issue.severity])).toEqual([
      ['back_too_long', 'warning'],
      ['front_too_long', 'note'],
      ['multiple_questions', 'note'],
    ]);
  });

  it('no cambia el borrador ni los umbrales', () => {
    const draft = basic(words(40), words(40));
    const before = JSON.stringify([draft, DEFAULT_CARD_QUALITY]);
    checkCardQuality(draft);
    expect(JSON.stringify([draft, DEFAULT_CARD_QUALITY])).toBe(before);
  });
});
