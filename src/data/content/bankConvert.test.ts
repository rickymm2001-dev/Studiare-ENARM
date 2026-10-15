// Convertidor tolerante del Google Sheet del banco (B11, 3.3 y 3.4 del plan de B11). Todo el texto es
// simulado y dice [Prueba], nunca es contenido médico.
import { describe, expect, it } from 'vitest';
import { biasTaxonomy, structureDictionary, taggableBiasKeys, topicTaxonomy } from '@/demo/content';
import { analyzeStructure } from '@/engines/structure';
import { HEADERS, SHEET_HEADERS, optionHeaders } from './bankColumns';
import { convertSheetTable, sheetQuestionFormat, type SheetConvertContext } from './bankConvert';
import { canonicalFromSheet, contentHash } from './contentHash';
import { parsePassageSource } from './passageSource';
import { incompleteOnly, versionIssues } from './questionRules';

const context: SheetConvertContext = {
  data: { branches: topicTaxonomy.branches, biases: biasTaxonomy.biases },
  analyze: (question) => {
    const auto = analyzeStructure(question, structureDictionary);
    return { polarity: auto.polarity, task: auto.task };
  },
  idPattern: '^[A-Z]{2,4}-[0-9]{4,5}$',
};

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
// Como el Sheet de hoy, cada encabezado trae una segunda línea con instrucciones (PC 7.2)
const HEADER_ROW = [
  ...Object.values(HEADERS),
  ...LETTERS.flatMap((letter) => Object.values(optionHeaders(letter))),
  ...Object.values(SHEET_HEADERS),
].map((header) => `${header}\nInstrucción de la plantilla para ${header}`);

type Cells = Record<string, string>;

const BASE: Cells = {
  [HEADERS.id]: 'GO-0001',
  [HEADERS.branch]: 'Ginecología y obstetricia',
  [HEADERS.topic]: 'Control prenatal',
  [HEADERS.subtopic]: 'Diabetes gestacional',
  [HEADERS.difficulty]: '3',
  [HEADERS.task]: 'Diagnóstico',
  [HEADERS.polarity]: 'Afirmativa',
  [HEADERS.vignette]: '[Prueba] Caso simulado, no es contenido médico.',
  [HEADERS.prompt]: '[Prueba] ¿Cuál es el diagnóstico simulado?',
  [HEADERS.correct]: 'A',
  [optionHeaders('A').text]: '[Prueba] Opción A',
  [optionHeaders('A').rationale]: '[Prueba] Justificación A',
  [optionHeaders('B').text]: '[Prueba] Opción B',
  [optionHeaders('B').rationale]: '[Prueba] Justificación B',
  [optionHeaders('B').bias]: 'Sesgo de anclaje',
  [optionHeaders('C').text]: '[Prueba] Opción C',
  [optionHeaders('C').rationale]: '[Prueba] Justificación C',
  [optionHeaders('C').bias]: 'Cierre prematuro',
  [optionHeaders('D').text]: '[Prueba] Opción D',
  [optionHeaders('D').rationale]: '[Prueba] Justificación D',
  [optionHeaders('D').bias]: 'Sesgo de encuadre',
  [HEADERS.explanation]: '[Prueba] Explicación simulada.',
  [HEADERS.refs]: '[Prueba] Guía simulada uno;;[Prueba] Guía simulada dos',
  [HEADERS.status]: 'Borrador',
};

function convert(...rows: Cells[]) {
  const plain = HEADER_ROW.map((header) => header.split('\n')[0] ?? '');
  return convertSheetTable(
    {
      name: 'Preguntas',
      headers: HEADER_ROW,
      rows: rows.map((cells, index) => ({
        rowNumber: index + 2,
        cells: plain.map((header) => cells[header] ?? ''),
      })),
    },
    context,
  );
}
const row = (overrides: Cells, base: Cells = BASE): Cells => ({ ...base, ...overrides });
const only = (overrides: Cells = {}) => {
  const result = convert(row(overrides));
  const first = result.rows[0];
  if (!first) throw new Error('Sin renglón');
  return first;
};
const codes = (overrides: Cells) => only(overrides).problems.map((problem) => problem.code);

describe('encabezados y renglones que se saltan', () => {
  it('lee solo la primera línea de cada encabezado y convierte un renglón completo', () => {
    const result = convert(BASE);
    expect(result.missingColumns).toEqual([]);
    expect(result.counts).toEqual({ read: 1, empty: 0, example: 0 });
    const [first] = result.rows;
    expect(first?.problems).toEqual([]);
    expect(first?.incomplete).toEqual([]);
    expect(first?.notices).toEqual([]);
    expect(first?.question).toMatchObject({
      branch: 'obstetrics_gynecology',
      topic: 'prenatal_care',
      subtopic: 'gestational_diabetes',
      difficulty: 3,
      task: 'diagnosis',
      polarity: 'affirmative',
      structureDeclared: true,
      language: 'es',
      refs: ['[Prueba] Guía simulada uno', '[Prueba] Guía simulada dos'],
      canonical: ['A', 'B', 'C', 'D'],
      caseKey: null,
    });
    expect(first?.question?.options.map((option) => option.bias)).toEqual([
      null,
      'anchoring',
      'premature_closure',
      'framing_effect',
    ]);
    expect(first?.meta).toEqual({ authorCode: null, reviewerCode: null, sheetStatus: 'draft' });
  });

  it('salta los renglones vacíos, los que solo traen ID por la fórmula y la fila de ejemplo', () => {
    const result = convert(
      {},
      { [HEADERS.id]: 'GO-0002' },
      { [HEADERS.id]: '  ' },
      row({ [HEADERS.id]: 'EJEMPLO, borra esta fila' }),
      BASE,
    );
    expect(result.counts).toEqual({ read: 1, empty: 3, example: 1 });
    expect(result.rows.map((item) => item.rowNumber)).toEqual([6]);
  });

  it('sin una columna obligatoria no convierte nada y dice cuál falta', () => {
    const result = convertSheetTable(
      { name: 'Preguntas', headers: HEADER_ROW.filter((h) => !h.startsWith('Subtema')), rows: [] },
      context,
    );
    expect(result.missingColumns).toEqual(['Subtema']);
  });
});

describe('lo que entra incompleto y lo que solo se avisa', () => {
  it('Ninguno en la correcta cuenta como vacío y en un distractor es un pendiente', () => {
    const result = only({
      [optionHeaders('A').bias]: 'Ninguno',
      [optionHeaders('C').bias]: 'Ninguno',
    });
    expect(result.problems).toEqual([]);
    expect(result.notices).toEqual(['bias_none_on_correct']);
    expect(result.incomplete).toEqual(['bias_missing:C']);
    expect(result.question?.options[0]?.bias).toBeNull();
  });

  it('sin explicación, referencias, justificación o sesgo entra como borrador incompleto', () => {
    const result = only({
      [HEADERS.explanation]: '',
      [HEADERS.refs]: '',
      [optionHeaders('B').rationale]: '',
      [optionHeaders('D').bias]: 'Sesgo inventado',
      [optionHeaders('C').bias]: '',
    });
    expect(result.problems).toEqual([]);
    expect(result.incomplete).toEqual([
      'explanation_missing',
      'references_missing',
      'rationale_missing:B',
      'bias_missing:C',
      'bias_unknown:D',
    ]);
    expect(result.question).not.toBeNull();
  });

  it('un sesgo que no se usa como etiqueta queda como desconocido', () => {
    expect(only({ [optionHeaders('B').bias]: 'Fatiga de decisión' }).incomplete).toEqual([
      'bias_unknown:B',
    ]);
  });

  it('Aprobado en Estado se ignora con aviso, y Lista para revisión y Retirar se leen', () => {
    expect(only({ [HEADERS.status]: 'Aprobado' })).toMatchObject({
      notices: ['status_approved_ignored'],
      meta: { sheetStatus: null },
    });
    expect(only({ [HEADERS.status]: 'Lista para revisión' }).meta.sheetStatus).toBe('ready');
    expect(only({ [HEADERS.status]: 'Retirar' }).meta.sheetStatus).toBe('retire');
    expect(only({ [HEADERS.status]: '' }).meta.sheetStatus).toBeNull();
    expect(only({ [HEADERS.status]: 'Revisada' }).notices).toEqual(['status_unknown']);
  });

  it('Tarea o Polaridad vacías se detectan y avisan', () => {
    const result = only({ [HEADERS.task]: '', [HEADERS.polarity]: '' });
    expect(result.notices).toEqual(['structure_auto']);
    expect(result.question).toMatchObject({ task: 'diagnosis', structureDeclared: false });
  });

  it('sin Tarea y sin tarea que detectar entra con el pendiente task_undetected, sin rechazo', () => {
    const result = only({
      [HEADERS.task]: '',
      [HEADERS.prompt]: '[Prueba] ¿Qué opinas del caso simulado?',
      [HEADERS.refs]: '',
    });
    expect(result.problems).toEqual([]);
    expect(result.notices).toEqual(['structure_auto']);
    expect(result.incomplete).toEqual(['task_undetected', 'references_missing']);
    expect(result.question).toMatchObject({ task: '', structureDeclared: false });
    // El mismo orden que pide la aprobación
    const question = result.question;
    if (!question) throw new Error('Debió entrar');
    expect(
      versionIssues(
        {
          prompt: question.prompt,
          task: question.task,
          explanation: question.explanation,
          refs: question.refs,
          options: question.options.map((option, position) => ({
            letter: option.letter,
            position,
            text: option.text,
            isCorrect: option.correct,
            biasTag: option.bias,
            rationale: option.rationale,
          })),
          canonicalPositions: question.options
            .map((option, position) => (question.canonical.includes(option.letter) ? position : -1))
            .filter((position) => position >= 0),
        },
        taggableBiasKeys,
      ),
    ).toEqual(result.incomplete);
  });

  it('un renglón con todos los tipos de reactivo raros entra sin pendientes (D-080)', () => {
    const result = only({
      [HEADERS.kind]:
        'De control, Con incoherencias; Resolución inversa\nDatos oscuros, Desde el paciente',
      [HEADERS.polarity]: 'Negativa',
      [HEADERS.prompt]: '[Prueba] ¿Cuál NO es el diagnóstico simulado?',
      [HEADERS.difficulty]: '5',
      [HEADERS.vignette]:
        '[Prueba] Caso simulado con datos incoherentes, oscuros y contado por el paciente.',
    });
    expect(result.problems).toEqual([]);
    expect(result.incomplete).toEqual([]);
    expect(result.notices).toEqual(['kind_control_check']);
    expect(result.question?.itemKinds).toEqual([
      'control',
      'incoherent',
      'inverse_resolution',
      'obscure_detail',
      'patient_perspective',
    ]);
    expect(result.question?.polarity).toBe('negative');
  });

  it('el idioma por omisión es español y uno desconocido avisa', () => {
    expect(only({ [SHEET_HEADERS.language]: 'Español' }).question?.language).toBe('es');
    expect(only({ [SHEET_HEADERS.language]: 'spanish' }).question?.language).toBe('es');
    expect(only({ [SHEET_HEADERS.language]: 'Francés' })).toMatchObject({
      notices: ['language_unknown'],
      question: { language: 'es' },
    });
    // Inglés en una rama de español ya no entra. Lo cuida language_branch_mismatch (B13)
    expect(only({ [SHEET_HEADERS.language]: 'Inglés' })).toMatchObject({
      problems: [{ code: 'language_branch_mismatch', column: 'Idioma', value: 'Inglés' }],
      question: null,
    });
  });

  it('las claves de médico se leen en mayúsculas y las inválidas o repetidas solo avisan', () => {
    expect(
      only({ [SHEET_HEADERS.author]: 'pm', [SHEET_HEADERS.reviewer]: ' al ' }).meta,
    ).toMatchObject({ authorCode: 'PM', reviewerCode: 'AL' });
    expect(only({ [SHEET_HEADERS.author]: 'Paco Médico' })).toMatchObject({
      notices: ['author_unknown'],
      meta: { authorCode: null },
    });
    expect(only({ [SHEET_HEADERS.author]: 'PM', [SHEET_HEADERS.reviewer]: 'PM' })).toMatchObject({
      notices: ['author_is_reviewer'],
      meta: { authorCode: 'PM', reviewerCode: null },
    });
  });

  it('los pendientes son los mismos que pide la aprobación (questionRules)', () => {
    const result = only({
      [HEADERS.refs]: '',
      [optionHeaders('C').rationale]: '',
      [optionHeaders('B').bias]: 'Ninguno',
    });
    const question = result.question;
    if (!question) throw new Error('Debió entrar');
    const issues = versionIssues(
      {
        prompt: question.prompt,
        explanation: question.explanation,
        refs: question.refs,
        options: question.options.map((option, position) => ({
          letter: option.letter,
          position,
          text: option.text,
          isCorrect: option.correct,
          biasTag: option.bias,
          rationale: option.rationale,
        })),
        canonicalPositions: question.options
          .map((option, position) => (question.canonical.includes(option.letter) ? position : -1))
          .filter((position) => position >= 0),
      },
      taggableBiasKeys,
    );
    expect(incompleteOnly(issues)).toEqual(result.incomplete);
    expect(issues).toEqual(result.incomplete);
  });
});

describe('subespecialidad y subtema (8.2 y 8.3)', () => {
  it('deduce la subespecialidad cuando el subtema es de una sola en la rama', () => {
    const result = only({ [HEADERS.topic]: 'Obstetricia' });
    expect(result.problems).toEqual([]);
    expect(result.notices).toEqual(['topic_inferred']);
    expect(result.question?.topic).toBe('prenatal_care');
  });

  it('no deduce si el subtema está en dos subespecialidades', () => {
    const result = only({ [HEADERS.topic]: 'Ginecología', [HEADERS.subtopic]: 'Cáncer de mama' });
    expect(result.problems).toEqual([
      { code: 'topic_unknown', column: 'Subespecialidad', value: 'Ginecología' },
    ]);
    expect(result.question).toBeNull();
  });

  it('un subtema con el nombre de una subespecialidad se rechaza para que el médico lo elija', () => {
    expect(only({ [HEADERS.subtopic]: 'Control prenatal' }).problems).toEqual([
      { code: 'subtopic_is_topic', column: 'Subtema', value: 'Control prenatal' },
    ]);
    expect(
      only({ [HEADERS.topic]: 'Obstetricia', [HEADERS.subtopic]: 'Control prenatal' }).problems,
    ).toEqual([
      { code: 'topic_unknown', column: 'Subespecialidad', value: 'Obstetricia' },
      { code: 'subtopic_is_topic', column: 'Subtema', value: 'Control prenatal' },
    ]);
    // Sin comparar singular y plural, para no casar mal
    expect(codes({ [HEADERS.subtopic]: 'Enfermedades hipertensivas del embarazo' })).toEqual([
      'subtopic_unknown',
    ]);
  });

  it('una rama fuera de la lista se rechaza con su valor recortado a 60 caracteres', () => {
    const result = only({ [HEADERS.branch]: 'x'.repeat(80) });
    expect(result.problems).toEqual([
      { code: 'branch_unknown', column: 'Rama troncal', value: 'x'.repeat(60) },
    ]);
  });
});

describe('rechazos', () => {
  it('el ID es obligatorio, con el patrón fijo y sin repetirse', () => {
    expect(codes({ [HEADERS.id]: '' })).toEqual(['id_missing']);
    expect(codes({ [HEADERS.id]: 'GO-12' })).toEqual(['id_format']);
    const result = convert(BASE, row({}), row({ [HEADERS.id]: 'GO-0003' }));
    expect(result.rows.map((item) => item.problems.map((problem) => problem.code))).toEqual([
      ['id_duplicate'],
      ['id_duplicate'],
      [],
    ]);
    expect(result.rows.map((item) => item.question === null)).toEqual([true, true, false]);
  });

  it('dificultad, tipo, tarea, polaridad, correcta y set canónico fuera de su lista', () => {
    expect(codes({ [HEADERS.difficulty]: '7' })).toEqual(['difficulty_invalid']);
    expect(codes({ [HEADERS.difficulty]: '' })).toEqual(['difficulty_invalid']);
    expect(codes({ [HEADERS.kind]: 'Rarísimo' })).toEqual(['kind_unknown']);
    expect(codes({ [HEADERS.task]: 'Adivinar' })).toEqual(['task_unknown']);
    expect(codes({ [HEADERS.polarity]: 'Neutra' })).toEqual(['polarity_invalid']);
    expect(codes({ [HEADERS.correct]: 'F' })).toEqual(['correct_invalid']);
    expect(codes({ [HEADERS.canonical]: 'B, C, D' })).toEqual(['canonical_invalid']);
    expect(codes({ [HEADERS.canonical]: 'A, B, C, D' })).toEqual([]);
  });

  it('opciones salteadas, huérfanas o menos de cuatro', () => {
    expect(
      codes({
        [optionHeaders('C').text]: '',
        [optionHeaders('C').rationale]: '',
        [optionHeaders('C').bias]: '',
        [optionHeaders('E').text]: '[Prueba] Opción E',
        [optionHeaders('E').rationale]: '[Prueba] Justificación E',
        [optionHeaders('E').bias]: 'Sesgo de omisión',
      }),
    ).toEqual(['option_gap']);
    expect(codes({ [optionHeaders('C').text]: '' })).toEqual([
      'option_orphan',
      'option_gap',
      'options_few',
    ]);
    expect(
      codes({
        [optionHeaders('E').rationale]: '[Prueba] Justificación sin opción',
      }),
    ).toEqual(['option_orphan']);
    expect(
      codes({
        [optionHeaders('D').text]: '',
        [optionHeaders('D').rationale]: '',
        [optionHeaders('D').bias]: '',
      }),
    ).toEqual(['options_few']);
  });

  it('sin pregunta, texto de relleno de la plantilla o texto más largo que el esquema', () => {
    expect(codes({ [HEADERS.prompt]: '' })).toEqual(['prompt_missing']);
    expect(codes({ [HEADERS.vignette]: 'Escribe aquí el caso clínico' })).toEqual([
      'template_placeholder',
    ]);
    expect(codes({ [HEADERS.prompt]: 'a'.repeat(1001) })).toEqual(['text_too_long']);
    expect(only({ [optionHeaders('B').rationale]: 'a'.repeat(1501) }).problems).toEqual([
      { code: 'text_too_long', column: 'Justificación B' },
    ]);
  });

  it('el reporte nunca copia texto de la pregunta, solo valores de listas', () => {
    const result = only({
      [HEADERS.prompt]: 'a'.repeat(1001),
      [optionHeaders('C').text]: '',
      [HEADERS.subtopic]: 'Control prenatal',
    });
    const reported = JSON.stringify(result.problems);
    expect(reported).not.toContain('[Prueba]');
    expect(reported).not.toContain('aaaa');
  });
});

describe('casos clínicos (3.6)', () => {
  const caseRow = (id: string, order: string, overrides: Cells = {}) =>
    row({
      [HEADERS.id]: id,
      [SHEET_HEADERS.caseKey]: 'go-c001',
      [SHEET_HEADERS.caseOrder]: order,
      [HEADERS.vignette]: `[Prueba] Datos simulados del paso ${order}`,
      ...overrides,
    });

  it('los renglones del mismo Caso forman un caso aunque no estén juntos', () => {
    const result = convert(
      caseRow('GO-0001', '1'),
      caseRow('GO-0002', '2'),
      row({ [HEADERS.id]: 'GO-0003' }),
      caseRow('GO-0004', '3'),
    );
    const members = result.rows.filter((item) => item.question?.caseKey === 'GO-C001');
    expect(members.map((item) => item.question?.caseOrder)).toEqual([1, 2, 3]);
    expect(members.every((item) => item.notices.includes('case_rows_apart'))).toBe(true);
    // La viñeta del caso es la del Orden 1. Los demás traen lo que se agrega en su paso
    expect(members.map((item) => item.question?.caseVignette)).toEqual([
      '[Prueba] Datos simulados del paso 1',
      '[Prueba] Datos simulados del paso 1',
      '[Prueba] Datos simulados del paso 1',
    ]);
    expect(members.map((item) => item.question?.vignette)).toEqual([
      '',
      '[Prueba] Datos simulados del paso 2',
      '[Prueba] Datos simulados del paso 3',
    ]);
    expect(members[0]?.question && sheetQuestionFormat(members[0].question)).toBe('serial_case');
    expect(result.rows[2]?.notices).toEqual([]);
  });

  it('un caso con órdenes repetidos, con huecos o sin el 1 se rechaza entero', () => {
    for (const orders of [
      ['1', '3'],
      ['1', '1'],
      ['2', '3'],
      ['1', ''],
    ]) {
      const result = convert(
        caseRow('GO-0001', orders[0] ?? ''),
        caseRow('GO-0002', orders[1] ?? ''),
      );
      expect(
        result.rows.map((item) => item.problems.map((problem) => problem.code)),
        orders.join(),
      ).toEqual([['case_inconsistent'], ['case_inconsistent']]);
    }
    expect(codes({ [SHEET_HEADERS.caseOrder]: '2' })).toEqual(['case_inconsistent']);
  });

  it('si un renglón del caso se rechaza, el caso entero no entra', () => {
    const result = convert(
      caseRow('GO-0001', '1'),
      caseRow('GO-0002', '2', { [HEADERS.subtopic]: 'Control prenatal' }),
    );
    expect(result.rows.map((item) => item.problems.map((problem) => problem.code))).toEqual([
      ['case_inconsistent'],
      ['subtopic_is_topic'],
    ]);
    expect(result.rows.every((item) => item.question === null)).toBe(true);
  });

  it('sin la columna Caso, cada renglón es una pregunta suelta', () => {
    const result = only();
    expect(result.question?.caseKey).toBeNull();
    expect(result.question && sheetQuestionFormat(result.question)).toBe('clinical_case');
    const direct = only({ [HEADERS.vignette]: '' });
    expect(direct.question && sheetQuestionFormat(direct.question)).toBe('direct');
  });
});

describe('Inglés médico (B13, 1.5 y 1.6 del plan de B13)', () => {
  const SOURCE = '[Prueba] Texto simulado';
  const URL = 'https://example.org/texto';
  const REFERENCE = `Fuente del texto. ${SOURCE}. CC BY. ${URL}`;
  // Un renglón en inglés. Texto, pregunta y opciones en inglés, justificación y explicación en español
  const ENGLISH: Cells = {
    ...BASE,
    [HEADERS.branch]: 'Inglés médico',
    [HEADERS.topic]: 'Comprensión de lectura',
    [HEADERS.subtopic]: 'Pediatría',
    [HEADERS.task]: '',
    [HEADERS.polarity]: '',
    [HEADERS.vignette]: '[Prueba] Simulated passage, not medical content.',
    [HEADERS.prompt]: '[Prueba] Which statement does the passage support?',
    [SHEET_HEADERS.language]: 'Inglés',
    [SHEET_HEADERS.passageSource]: SOURCE,
    [SHEET_HEADERS.passageLicense]: 'CC BY',
    [SHEET_HEADERS.passageUrl]: URL,
  };
  const english = (overrides: Cells = {}) => row(overrides, ENGLISH);
  const onlyEnglish = (overrides: Cells = {}) => {
    const first = convert(english(overrides)).rows[0];
    if (!first) throw new Error('Sin renglón');
    return first;
  };

  it('un renglón en inglés completo entra con la fuente como primera referencia y data_interpretation', () => {
    const result = onlyEnglish();
    expect(result.problems).toEqual([]);
    expect(result.incomplete).toEqual([]);
    expect(result.notices).toEqual(['structure_auto']);
    expect(result.question).toMatchObject({
      branch: 'medical_english',
      topic: 'reading_comprehension',
      subtopic: 'english_pediatrics',
      language: 'en',
      task: 'data_interpretation',
      polarity: 'affirmative',
      structureDeclared: false,
      refs: [REFERENCE, '[Prueba] Guía simulada uno', '[Prueba] Guía simulada dos'],
    });
    expect(parsePassageSource((result.question?.refs ?? []).map((title) => ({ title })))).toEqual({
      ok: true,
      source: { title: SOURCE, license: 'cc_by', url: URL },
    });
  });

  it('con la Tarea y la Polaridad escritas no avisa que las detectó solas', () => {
    const result = onlyEnglish({
      [HEADERS.task]: 'Diagnóstico',
      [HEADERS.polarity]: 'Afirmativa',
    });
    expect(result.notices).toEqual([]);
    expect(result.question).toMatchObject({ task: 'diagnosis', structureDeclared: true });
  });

  it('la polaridad se detecta con las negaciones en inglés y la del médico gana', () => {
    expect(onlyEnglish().question?.polarity).toBe('affirmative');
    const negative = onlyEnglish({
      [HEADERS.prompt]: '[Prueba] Which of these is NOT in the text?',
    });
    expect(negative.question?.polarity).toBe('negative');
    expect(negative.notices).toEqual(['structure_auto']);
    expect(
      onlyEnglish({
        [HEADERS.prompt]: '[Prueba] Which of these is NOT in the text?',
        [HEADERS.polarity]: 'Afirmativa',
      }).question?.polarity,
    ).toBe('affirmative');
    // Una pregunta en español no se lee con el diccionario en inglés
    expect(only({ [HEADERS.prompt]: '[Prueba] ¿Cuál de estos es NOT?' }).question?.polarity).toBe(
      'affirmative',
    );
  });

  describe('idioma y rama', () => {
    it('Idioma vacío en Inglés médico se toma como inglés y avisa', () => {
      const result = onlyEnglish({ [SHEET_HEADERS.language]: '' });
      expect(result.problems).toEqual([]);
      expect(result.question?.language).toBe('en');
      expect(result.notices).toEqual(['structure_auto', 'language_inferred']);
    });

    it('Inglés en otra rama y Español en Inglés médico rechazan el renglón', () => {
      expect(
        onlyEnglish({
          [HEADERS.branch]: 'Pediatría',
          [HEADERS.topic]: 'Neonatología',
          [HEADERS.subtopic]: 'Ictericia neonatal',
        }),
      ).toMatchObject({
        problems: [{ code: 'language_branch_mismatch', column: 'Idioma', value: 'Inglés' }],
        question: null,
      });
      expect(onlyEnglish({ [SHEET_HEADERS.language]: 'Español' })).toMatchObject({
        problems: [{ code: 'language_branch_mismatch', column: 'Idioma', value: 'Español' }],
        question: null,
      });
      // Un Idioma desconocido cuenta como español y en Inglés médico tampoco entra
      expect(onlyEnglish({ [SHEET_HEADERS.language]: 'Francés' })).toMatchObject({
        problems: [{ code: 'language_branch_mismatch' }],
        notices: expect.arrayContaining(['language_unknown']) as string[],
        question: null,
      });
    });

    it('con la rama desconocida solo se rechaza por la rama', () => {
      expect(
        onlyEnglish({ [HEADERS.branch]: 'Rama inventada' }).problems.map((item) => item.code),
      ).toEqual(['branch_unknown']);
    });
  });

  describe('fuente del texto y licencia', () => {
    it('sin fuente queda el pendiente passage_source_missing, después de la explicación y las referencias', () => {
      const result = onlyEnglish({
        [SHEET_HEADERS.passageSource]: '',
        [SHEET_HEADERS.passageLicense]: '',
        [SHEET_HEADERS.passageUrl]: '',
      });
      expect(result.problems).toEqual([]);
      expect(result.incomplete).toEqual(['passage_source_missing']);
      expect(result.question?.refs).toEqual([
        '[Prueba] Guía simulada uno',
        '[Prueba] Guía simulada dos',
      ]);
      const more = onlyEnglish({
        [SHEET_HEADERS.passageSource]: '',
        [SHEET_HEADERS.passageLicense]: '',
        [SHEET_HEADERS.passageUrl]: '',
        [HEADERS.explanation]: '',
        [HEADERS.refs]: '',
        [optionHeaders('C').rationale]: '',
      });
      expect(more.incomplete).toEqual([
        'explanation_missing',
        'references_missing',
        'passage_source_missing',
        'rationale_missing:C',
      ]);
    });

    it('una licencia fuera de la lista deja license_not_allowed y conserva lo que escribió el médico', () => {
      for (const license of ['CC BY-NC', 'CC BY-ND', 'Todos los derechos reservados']) {
        const result = onlyEnglish({ [SHEET_HEADERS.passageLicense]: license });
        expect(result.problems, license).toEqual([]);
        expect(result.incomplete, license).toEqual(['license_not_allowed']);
        expect(result.question?.refs[0], license).toBe(
          `Fuente del texto. ${SOURCE}. ${license}. ${URL}`,
        );
      }
    });

    it('licencia vacía, sin enlace o con un enlace que no es https deja passage_source_missing', () => {
      const variants: Cells[] = [
        { [SHEET_HEADERS.passageLicense]: '' },
        { [SHEET_HEADERS.passageUrl]: '' },
        { [SHEET_HEADERS.passageUrl]: 'http://example.org/texto' },
        { [SHEET_HEADERS.passageUrl]: 'example.org/texto' },
        { [SHEET_HEADERS.passageSource]: '' },
      ];
      for (const overrides of variants) {
        const result = onlyEnglish(overrides);
        expect(result.problems, JSON.stringify(overrides)).toEqual([]);
        expect(result.incomplete, JSON.stringify(overrides)).toEqual(['passage_source_missing']);
      }
    });

    it('el texto propio del equipo no pide título ni enlace', () => {
      const result = onlyEnglish({
        [SHEET_HEADERS.passageSource]: '',
        [SHEET_HEADERS.passageLicense]: 'Texto propio del equipo Studiare',
        [SHEET_HEADERS.passageUrl]: '',
      });
      expect(result.incomplete).toEqual([]);
      expect(result.question?.refs[0]).toBe('Fuente del texto. Texto propio del equipo Studiare.');
    });

    it('acepta la licencia como la escribe el médico y la guarda con su nombre exacto', () => {
      const expected: [string, string][] = [
        ['cc by', 'CC BY'],
        ['CC BY 4.0', 'CC BY'],
        ['cc-by-sa', 'CC BY-SA'],
        ['cc0', 'CC0'],
        ['dominio publico', 'Dominio público'],
        ['public domain', 'Dominio público'],
      ];
      for (const [written, label] of expected) {
        const result = onlyEnglish({ [SHEET_HEADERS.passageLicense]: written });
        expect(result.incomplete, written).toEqual([]);
        expect(result.question?.refs[0], written).toBe(
          `Fuente del texto. ${SOURCE}. ${label}. ${URL}`,
        );
      }
    });

    it('la fuente cuenta como referencia, así que sin Referencias no falta references_missing', () => {
      const result = onlyEnglish({ [HEADERS.refs]: '' });
      expect(result.incomplete).toEqual([]);
      expect(result.question?.refs).toEqual([REFERENCE]);
    });

    it('una referencia a mano con la forma de la fuente cuenta si las tres columnas vienen vacías', () => {
      const result = onlyEnglish({
        [SHEET_HEADERS.passageSource]: '',
        [SHEET_HEADERS.passageLicense]: '',
        [SHEET_HEADERS.passageUrl]: '',
        [HEADERS.refs]: `${REFERENCE};;[Prueba] Guía simulada uno`,
      });
      expect(result.incomplete).toEqual([]);
      expect(result.question?.refs).toEqual([REFERENCE, '[Prueba] Guía simulada uno']);
    });

    it('recorta el título largo para que la referencia quepa y no deja pendiente', () => {
      const result = onlyEnglish({ [SHEET_HEADERS.passageSource]: 'Título largo '.repeat(40) });
      expect(result.problems).toEqual([]);
      expect(result.incomplete).toEqual([]);
      const reference = result.question?.refs[0] ?? '';
      expect(reference.length).toBeLessThanOrEqual(300);
      expect(reference.endsWith(`. CC BY. ${URL}`)).toBe(true);
    });

    it('si el enlace no cabe o sobran referencias, rechaza el renglón por el largo', () => {
      expect(
        onlyEnglish({ [SHEET_HEADERS.passageUrl]: `https://example.org/${'a'.repeat(290)}` }),
      ).toMatchObject({
        problems: [{ code: 'text_too_long', column: 'Fuente del texto' }],
        question: null,
      });
      const ten = Array.from({ length: 10 }, (_, index) => `[Prueba] Guía ${index}`).join(';;');
      expect(onlyEnglish({ [HEADERS.refs]: ten })).toMatchObject({
        problems: [{ code: 'text_too_long', column: 'Fuente del texto' }],
        question: null,
      });
    });

    it('los pendientes son los mismos que pide la aprobación (questionRules)', () => {
      const issuesOf = (overrides: Cells) => {
        const result = onlyEnglish(overrides);
        const question = result.question;
        if (!question) throw new Error('Debió entrar');
        const issues = versionIssues(
          {
            prompt: question.prompt,
            task: question.task,
            explanation: question.explanation,
            refs: question.refs,
            language: question.language,
            englishBranch: true,
            options: question.options.map((option, position) => ({
              letter: option.letter,
              position,
              text: option.text,
              isCorrect: option.correct,
              biasTag: option.bias,
              rationale: option.rationale,
            })),
            canonicalPositions: question.options
              .map((option, position) =>
                question.canonical.includes(option.letter) ? position : -1,
              )
              .filter((position) => position >= 0),
          },
          taggableBiasKeys,
        );
        expect(issues, JSON.stringify(overrides)).toEqual(result.incomplete);
      };
      const variants: Cells[] = [
        {},
        {
          [SHEET_HEADERS.passageSource]: '',
          [SHEET_HEADERS.passageLicense]: '',
          [SHEET_HEADERS.passageUrl]: '',
        },
        { [SHEET_HEADERS.passageLicense]: 'CC BY-NC' },
        { [SHEET_HEADERS.passageUrl]: '' },
        {
          [HEADERS.refs]: '',
          [SHEET_HEADERS.passageSource]: '',
          [SHEET_HEADERS.passageLicense]: '',
          [SHEET_HEADERS.passageUrl]: '',
        },
        {
          [HEADERS.explanation]: '',
          [optionHeaders('B').bias]: '',
          [SHEET_HEADERS.passageLicense]: 'GPL',
        },
      ];
      for (const overrides of variants) issuesOf(overrides);
    });
  });

  describe('en español las columnas nuevas se ignoran', () => {
    it('un renglón en español con fuente, licencia y enlace queda igual que sin ellos', () => {
      const filled = row({
        [SHEET_HEADERS.passageSource]: SOURCE,
        [SHEET_HEADERS.passageLicense]: 'CC BY-NC',
        [SHEET_HEADERS.passageUrl]: 'no es un enlace',
      });
      expect(convert(filled)).toEqual(convert(BASE));
    });

    it('la huella de un renglón en español no cambia por las columnas nuevas', async () => {
      const plain = only().question;
      const filled = only({ [SHEET_HEADERS.passageSource]: SOURCE }).question;
      if (!plain || !filled) throw new Error('Debieron entrar');
      expect(await contentHash(canonicalFromSheet(filled))).toBe(
        await contentHash(canonicalFromSheet(plain)),
      );
    });

    it('la huella de un renglón en inglés cambia con su fuente', async () => {
      const first = onlyEnglish().question;
      const second = onlyEnglish({ [SHEET_HEADERS.passageLicense]: 'CC0' }).question;
      if (!first || !second) throw new Error('Debieron entrar');
      expect(await contentHash(canonicalFromSheet(first))).not.toBe(
        await contentHash(canonicalFromSheet(second)),
      );
    });
  });

  describe('casos de lectura', () => {
    const caseRow = (id: string, order: string, overrides: Cells = {}) =>
      english({
        [HEADERS.id]: id,
        [SHEET_HEADERS.caseKey]: 'go-c010',
        [SHEET_HEADERS.caseOrder]: order,
        // El texto va completo en el Orden 1. En los demás renglones el caso clínico trae lo que se agrega
        [HEADERS.vignette]: order === '1' ? (ENGLISH[HEADERS.vignette] ?? '') : '',
        // Los demás renglones heredan la fuente del Orden 1
        ...(order === '1'
          ? {}
          : {
              [SHEET_HEADERS.passageSource]: '',
              [SHEET_HEADERS.passageLicense]: '',
              [SHEET_HEADERS.passageUrl]: '',
            }),
        ...overrides,
      });

    it('los renglones del caso heredan la fuente del Orden 1 y todos la llevan como primera referencia', () => {
      const result = convert(
        caseRow('GO-0001', '1'),
        caseRow('GO-0002', '2'),
        caseRow('GO-0003', '3'),
      );
      expect(result.rows.map((item) => item.problems)).toEqual([[], [], []]);
      expect(result.rows.map((item) => item.incomplete)).toEqual([[], [], []]);
      for (const item of result.rows) {
        expect(item.question?.refs[0]).toBe(REFERENCE);
        expect(item.question?.language).toBe('en');
        expect(item.question?.caseVignette).toBe(ENGLISH[HEADERS.vignette]);
        expect(item.notices).toEqual(['structure_auto']);
      }
    });

    it('la fuente puede venir en otro renglón del caso y los demás la heredan', () => {
      const result = convert(
        caseRow('GO-0001', '1', {
          [SHEET_HEADERS.passageSource]: '',
          [SHEET_HEADERS.passageLicense]: '',
          [SHEET_HEADERS.passageUrl]: '',
        }),
        caseRow('GO-0002', '2', {
          [SHEET_HEADERS.passageSource]: SOURCE,
          [SHEET_HEADERS.passageLicense]: 'CC BY',
          [SHEET_HEADERS.passageUrl]: URL,
        }),
      );
      expect(result.rows.map((item) => item.question?.refs[0])).toEqual([REFERENCE, REFERENCE]);
      expect(result.rows.map((item) => item.incomplete)).toEqual([[], []]);
    });

    it('repetir la misma fuente en todos los renglones no estorba, aunque cambie la forma', () => {
      const result = convert(
        caseRow('GO-0001', '1'),
        caseRow('GO-0002', '2', {
          [SHEET_HEADERS.passageSource]: ' [PRUEBA] texto simulado ',
          [SHEET_HEADERS.passageLicense]: 'cc by 4.0',
          [SHEET_HEADERS.passageUrl]: URL,
        }),
      );
      expect(result.rows.every((item) => item.problems.length === 0)).toBe(true);
      expect(result.rows.map((item) => item.question?.refs[0])).toEqual([REFERENCE, REFERENCE]);
    });

    it('dos fuentes distintas en un caso lo rechazan entero con case_inconsistent en la fuente', () => {
      const result = convert(
        caseRow('GO-0001', '1'),
        caseRow('GO-0002', '2', {
          [SHEET_HEADERS.passageSource]: '[Prueba] Otro texto simulado',
          [SHEET_HEADERS.passageLicense]: 'CC0',
          [SHEET_HEADERS.passageUrl]: 'https://example.org/otro',
        }),
      );
      expect(result.rows.map((item) => item.problems)).toEqual([
        [{ code: 'case_inconsistent', column: 'Fuente del texto' }],
        [{ code: 'case_inconsistent', column: 'Fuente del texto' }],
      ]);
      expect(result.rows.every((item) => item.question === null)).toBe(true);
    });

    it('un caso con idiomas distintos se rechaza entero y lo dice en la columna Idioma', () => {
      const result = convert(
        caseRow('GO-0001', '1'),
        caseRow('GO-0002', '2', {
          [HEADERS.branch]: 'Ginecología y obstetricia',
          [HEADERS.topic]: 'Control prenatal',
          [HEADERS.subtopic]: 'Diabetes gestacional',
          [SHEET_HEADERS.language]: 'Español',
        }),
      );
      expect(result.rows.map((item) => item.problems.map((problem) => problem.code))).toEqual([
        ['case_inconsistent'],
        ['case_inconsistent'],
      ]);
      expect(result.rows[0]?.problems[0]?.column).toBe('Idioma');
    });

    it('si un renglón del caso se rechaza por el largo de la fuente, el caso no entra partido', () => {
      const result = convert(
        caseRow('GO-0001', '1', {
          [SHEET_HEADERS.passageUrl]: `https://example.org/${'a'.repeat(290)}`,
        }),
        caseRow('GO-0002', '2'),
      );
      expect(result.rows.every((item) => item.question === null)).toBe(true);
      expect(result.rows.map((item) => item.problems.map((problem) => problem.code))).toEqual([
        ['text_too_long'],
        ['text_too_long'],
      ]);
    });

    it('un caso de lectura con una pregunta o con más de tres entra y solo avisa del tamaño', () => {
      const sizes = (count: number) =>
        convert(
          ...Array.from({ length: count }, (_, index) =>
            caseRow(`GO-000${index + 1}`, String(index + 1)),
          ),
        );
      for (const count of [1, 4, 5]) {
        const result = sizes(count);
        expect(
          result.rows.every((item) => item.problems.length === 0),
          String(count),
        ).toBe(true);
        expect(
          result.rows.every((item) => item.notices.includes('english_case_size')),
          String(count),
        ).toBe(true);
      }
      for (const count of [2, 3]) {
        const result = sizes(count);
        expect(
          result.rows.some((item) => item.notices.includes('english_case_size')),
          String(count),
        ).toBe(false);
      }
    });

    it('una pregunta suelta en inglés es válida y no avisa del tamaño', () => {
      const result = onlyEnglish();
      expect(result.notices).not.toContain('english_case_size');
      expect(result.question?.caseKey).toBeNull();
      expect(result.question && sheetQuestionFormat(result.question)).toBe('clinical_case');
    });

    it('un caso en español no avisa del tamaño aunque tenga una sola pregunta', () => {
      const result = convert(
        row({
          [HEADERS.id]: 'GO-0001',
          [SHEET_HEADERS.caseKey]: 'go-c020',
          [SHEET_HEADERS.caseOrder]: '1',
        }),
      );
      expect(result.rows[0]?.notices).toEqual([]);
    });
  });
});
