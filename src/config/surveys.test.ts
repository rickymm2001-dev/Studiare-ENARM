// La configuración de la encuesta de los primeros días (B18) y su contrato con la migración. La base y la app comparten
// los mismos ids y las mismas reglas, y esta prueba lee 20261030000001_first_week_survey.sql para compararlos en los dos
// sentidos: lo que acepta el SQL tiene que estar en la app y lo que ofrece la app tiene que aceptarlo el SQL.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BLOCKERS,
  COMMENT_RULES,
  DAYS_USED,
  FIRST_WEEK_SURVEY_ID,
  KNOWN_SURVEY_IDS,
  MAX_BLOCKERS,
  QUESTION_COUNT,
  QUESTION_IDS,
  RECOMMEND,
  SCALE_VALUES,
  SURVEY_COMMENT_MAX,
  SURVEY_QUESTIONS,
  USED_FEATURES,
  answeredCount,
  cleanComment,
  commentProblem,
  completeAnswers,
  flattenComment,
  missingQuestions,
  optionsOf,
  scaleMedian,
  toggleOption,
  type SurveyAnswers,
} from './surveys';

const ROOT = join(import.meta.dirname, '../..');
const SQL = readFileSync(
  join(ROOT, 'supabase/migrations/20261030000001_first_week_survey.sql'),
  'utf8',
);

/** Los casos que comparten esta prueba y la S2 de supabase/tests/first_week_survey_test.sql */
const COMMENT_CASES = (
  JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/survey-comments.json'), 'utf8')) as {
    cases: { name: string; comment: string; problem: 'email' | 'phone' | null }[];
  }
).cases;

/** Los ids de una lista fija del SQL, como v_days constant text[] := array['d0', 'd1_2'] */
function sqlList(name: string): string[] {
  const match = new RegExp(`${name} constant text\\[\\] := array\\[([^\\]]*)\\]`).exec(SQL);
  if (!match?.[1]) throw new Error(`No encuentro la lista ${name} en la migración`);
  return [...match[1].matchAll(/'([a-z0-9_-]+)'/g)].map((item) => item[1] ?? '');
}

describe('el contrato con la migración', () => {
  it('cada lista de opciones del SQL es la de la app, en los dos sentidos', () => {
    expect(sqlList('v_days').sort()).toEqual([...DAYS_USED].sort());
    expect(sqlList('v_used').sort()).toEqual([...USED_FEATURES].sort());
    expect(sqlList('v_blockers').sort()).toEqual([...BLOCKERS].sort());
    expect(sqlList('v_recommend').sort()).toEqual([...RECOMMEND].sort());
  });

  it('las encuestas que la base conoce son las de la app, en el ajuste y en las respuestas', () => {
    // survey_setting compara el id del ajuste con esta lista, y survey_answers_ok solo acepta la primera
    expect(sqlList('v_known').sort()).toEqual([...KNOWN_SURVEY_IDS].sort());
    expect(KNOWN_SURVEY_IDS).toContain(FIRST_WEEK_SURVEY_ID);
    expect(SQL).toContain(`(v_value ->> 'id') = any (v_known)`);
    expect(SQL).toContain(`p_survey_id is distinct from '${FIRST_WEEK_SURVEY_ID}'`);
  });

  it('las siete llaves del SQL son las preguntas de la app', () => {
    const match = /p_answers \?& array\[([^\]]*)\]/.exec(SQL);
    const keys = [...(match?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((item) => item[1] ?? '');
    expect(keys.sort()).toEqual([...QUESTION_IDS].sort());
    expect(/jsonb_object_keys\(p_answers\)\) <> (\d+)/.exec(SQL)?.[1]).toBe(
      String(QUESTION_IDS.length),
    );
    // Las tres escalas del SQL son las de la app
    const scales = /foreach v_key in array array\[([^\]]*)\]/.exec(SQL)?.[1] ?? '';
    const scaleKeys = SURVEY_QUESTIONS.filter((question) => question.kind === 'scale').map(
      (question) => question.id,
    );
    expect([...scales.matchAll(/'([a-z_]+)'/g)].map((item) => item[1]).sort()).toEqual(
      [...scaleKeys].sort(),
    );
  });

  it('la escala, el máximo de motivos y el largo del comentario son los mismos', () => {
    expect(/!~ '\^\[(\d)-(\d)\]\$'/.exec(SQL)?.slice(1, 3)).toEqual([
      String(SCALE_VALUES[0]),
      String(SCALE_VALUES.at(-1)),
    ]);
    expect(SCALE_VALUES).toEqual([1, 2, 3, 4, 5]);
    // Hasta tres motivos, y hasta el total de opciones en qué usó
    const betweens = [
      ...SQL.matchAll(/jsonb_array_length\(v_list\) not between 1 and ([\w()]+)/g),
    ].map((item) => item[1]);
    expect(betweens).toEqual([`cardinality(v_used)`, String(MAX_BLOCKERS)]);
    expect(/char_length\(p_comment\) not between 1 and (\d+)/.exec(SQL)?.[1]).toBe(
      String(SURVEY_COMMENT_MAX),
    );
    expect(SQL).toContain(`'${FIRST_WEEK_SURVEY_ID}'`);
  });

  it('none y nothing excluyen a las demás en el SQL y en la app', () => {
    expect(SQL).toMatch(/v_list \? 'none' and jsonb_array_length\(v_list\) > 1/);
    expect(SQL).toMatch(/v_list \? 'nothing' and jsonb_array_length\(v_list\) > 1/);
    for (const question of SURVEY_QUESTIONS) {
      if (question.kind === 'multiple') expect(question.options).toContain(question.exclusive);
    }
  });

  it('el comentario tiene las mismas expresiones en el SQL y en la app, escritas igual', () => {
    for (const [name, pattern] of Object.entries(COMMENT_RULES)) {
      expect(SQL, name).toContain(`'${pattern}'`);
    }
    // Se normaliza con NFKC antes de revisar, en los dos lados, y la longitud va primero
    expect(SQL).toMatch(/normalize\(p_comment, nfkc\)/);
    expect(SQL).toContain(`position('@' in v_flat) = 0`);
    expect(SQL.indexOf('char_length(p_comment) not between 1 and 500')).toBeLessThan(
      SQL.indexOf('normalize(p_comment, nfkc)'),
    );
    expect(flattenComment('ana\uFF20x\u200B')).toBe('ana@x');
  });

  it('las mismas reglas de uso en el SQL: arroba, formas de at, palabra arroba y teléfono, con las banderas de la app', () => {
    // ~* (sin importar mayúsculas) en la forma de at y en la palabra, ~ en el teléfono, como las banderas de la app
    expect(SQL).toContain(`v_flat !~* '${COMMENT_RULES.atForm}'`);
    expect(SQL).toContain(`v_flat !~* '${COMMENT_RULES.arroba}'`);
    expect(SQL).toContain(`v_flat !~ '${COMMENT_RULES.phone}'`);
  });
});

describe('las preguntas', () => {
  it('son siete cerradas más el comentario, en orden y sin repetir', () => {
    expect(QUESTION_IDS).toEqual([
      'days_used',
      'used',
      'clarity',
      'ease',
      'useful',
      'blockers',
      'recommend',
    ]);
    expect(QUESTION_COUNT).toBe(8);
    expect(new Set(QUESTION_IDS).size).toBe(QUESTION_IDS.length);
  });

  it('cada pregunta ofrece sus opciones como texto, y la escala los cinco números', () => {
    for (const question of SURVEY_QUESTIONS) {
      const options = optionsOf(question);
      expect(options.length).toBeGreaterThan(1);
      expect(new Set(options).size).toBe(options.length);
    }
    expect(optionsOf({ id: 'clarity', kind: 'scale' })).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('las respuestas a medias', () => {
  const full: SurveyAnswers = {
    days_used: 'd5_6',
    used: ['review', 'practice'],
    clarity: 4,
    ease: 5,
    useful: 4,
    blockers: ['slow'],
    recommend: 'yes',
  };

  it('dice qué preguntas faltan, en el orden de la pantalla, y una lista vacía cuenta como no contestada', () => {
    expect(missingQuestions({})).toEqual([...QUESTION_IDS]);
    expect(missingQuestions({ ...full, ease: undefined })).toEqual(['ease']);
    expect(missingQuestions({ ...full, used: [], blockers: [] })).toEqual(['used', 'blockers']);
    expect(missingQuestions(full)).toEqual([]);
  });

  it('solo entrega las respuestas completas', () => {
    expect(completeAnswers(full)).toEqual(full);
    expect(completeAnswers({ ...full, recommend: undefined })).toBeNull();
    expect(completeAnswers({})).toBeNull();
  });
});

describe('las preguntas de varias respuestas', () => {
  const used = SURVEY_QUESTIONS.find((question) => question.id === 'used');
  const blockers = SURVEY_QUESTIONS.find((question) => question.id === 'blockers');
  if (used?.kind !== 'multiple' || blockers?.kind !== 'multiple')
    throw new Error('Faltan preguntas');

  it('marca y desmarca en el orden de la pregunta, sin importar el de los clics', () => {
    let current: string[] = [];
    current = toggleOption(used, current, 'tutor');
    current = toggleOption(used, current, 'review');
    expect(current).toEqual(['review', 'tutor']);
    expect(toggleOption(used, current, 'review')).toEqual(['tutor']);
  });

  it('Nada todavía saca a las demás, y marcar otra saca a Nada todavía', () => {
    expect(toggleOption(used, ['review', 'practice'], 'none')).toEqual(['none']);
    expect(toggleOption(used, ['none'], 'exam')).toEqual(['exam']);
    expect(toggleOption(blockers, ['slow', 'error'], 'nothing')).toEqual(['nothing']);
    expect(toggleOption(blockers, ['nothing'], 'slow')).toEqual(['slow']);
  });

  it('no deja pasar de tres motivos, pero Nada me frenó siempre entra', () => {
    const three = ['unclear_start', 'error', 'slow'];
    expect(toggleOption(blockers, three, 'few_questions')).toEqual(three);
    expect(toggleOption(blockers, three, 'slow')).toEqual(['unclear_start', 'error']);
    expect(toggleOption(blockers, three, 'nothing')).toEqual(['nothing']);
  });
});

describe('el comentario', () => {
  it('se limpia y un comentario vacío es no haber escrito nada', () => {
    expect(cleanComment('  hola  ')).toBe('hola');
    expect(cleanComment('   \n ')).toBeNull();
    expect(commentProblem(null)).toBeNull();
    expect(answeredCount(null)).toBe(7);
    expect(answeredCount('algo')).toBe(8);
  });

  it('avisa de un correo, de un teléfono y de un texto largo', () => {
    expect(commentProblem('Escríbeme a alguien@correo.mx')).toBe('email');
    expect(commentProblem('mi correo A.B+c@Sub.Dominio.COM')).toBe('email');
    expect(commentProblem('llámame al 55 1234 5678')).toBe('phone');
    expect(commentProblem('+52 (55) 1234-5678')).toBe('phone');
    expect(commentProblem('5512345678')).toBe('phone');
    expect(commentProblem('a'.repeat(501))).toBe('too_long');
  });

  it('deja pasar números cortos y fechas, y cuenta hasta 500 caracteres', () => {
    expect(commentProblem('Tardó 3 segundos, como 12 veces en 2 días')).toBeNull();
    expect(commentProblem('Quiero que el 5 de enero salga el simulacro 7')).toBeNull();
    expect(commentProblem('a'.repeat(500))).toBeNull();
  });

  it('cualquier arroba cuenta como correo, también la palabra, aunque no tenga forma de correo', () => {
    expect(commentProblem('Mejor poner arroba en lugar del símbolo')).toBe('email');
    expect(commentProblem('mándame un @')).toBe('email');
    expect(commentProblem('ana@gmail')).toBe('email');
  });
});

// Los mismos casos corren en SQL (S2 de first_week_survey_test.sql con survey_comment_ok). Si se agrega una forma nueva de
// esconder un correo o un teléfono, se agrega a tests/fixtures/survey-comments.json y las dos pruebas la exigen
describe('los casos compartidos con la base', () => {
  it('la lista llegó completa y trae las formas que se esconden', () => {
    expect(COMMENT_CASES.length).toBeGreaterThanOrEqual(40);
    const names = COMMENT_CASES.map((item) => item.name);
    expect(new Set(names).size).toBe(names.length);
    const comments = COMMENT_CASES.map((item) => item.comment);
    // Con los caracteres invisibles y de ancho completo escritos de verdad, no como texto
    expect(comments.some((item) => item.includes('\u200B'))).toBe(true);
    expect(comments.some((item) => item.includes('\uFF20'))).toBe(true);
    expect(comments.some((item) => item.includes('\uFEFF'))).toBe(true);
    expect(comments.some((item) => item.includes('\u00AD'))).toBe(true);
    expect(comments.some((item) => /[\uFF10-\uFF19]/.test(item))).toBe(true);
    expect(comments.some((item) => /\(at\)/i.test(item))).toBe(true);
    expect(comments.some((item) => /\[at\]/i.test(item))).toBe(true);
    expect(comments.some((item) => /arroba/i.test(item))).toBe(true);
    expect(comments.some((item) => /@ .* \. /.test(item))).toBe(true);
    expect(COMMENT_CASES.some((item) => item.problem === null)).toBe(true);
    expect(COMMENT_CASES.some((item) => item.problem === 'phone')).toBe(true);
  });

  for (const item of COMMENT_CASES) {
    it(`${item.problem === null ? 'deja pasar' : `avisa de ${item.problem}`}. ${item.name}`, () => {
      expect(commentProblem(cleanComment(item.comment))).toBe(item.problem);
    });
  }
});

describe('la mediana de una escala', () => {
  it('sale de cuántas respuestas hubo en cada valor', () => {
    expect(scaleMedian({})).toBeNull();
    expect(scaleMedian({ '1': 0, '5': 0 })).toBeNull();
    expect(scaleMedian({ '5': 1 })).toBe(5);
    expect(scaleMedian({ '5': 1, '3': 1, '2': 1 })).toBe(3);
    // Un número par de respuestas con dos valores en medio es el promedio de los dos
    expect(scaleMedian({ '2': 1, '3': 1, '4': 1, '5': 1 })).toBe(3.5);
    expect(scaleMedian({ '4': 2, '5': 2 })).toBe(4.5);
    expect(scaleMedian({ '1': 3, '5': 1 })).toBe(1);
  });
});
