// Huella del contenido de una pregunta del banco (B11, 3.5 del plan de B11). Texto simulado.
import { describe, expect, it } from 'vitest';
import type { SyncQuestion } from '../bank/contracts';
import {
  canonicalFromSheet,
  canonicalFromVersion,
  canonicalText,
  contentHash,
  metaHash,
  sha256Hex,
  sheetHash,
  type VersionContent,
} from './contentHash';

const sheetRow: SyncQuestion = {
  branch: 'obstetrics_gynecology',
  topic: 'prenatal_care',
  subtopic: 'gestational_diabetes',
  difficulty: 3,
  itemKinds: ['obscure_detail', 'control'],
  task: 'diagnosis',
  polarity: 'affirmative',
  structureDeclared: true,
  language: 'es',
  vignette: '[Prueba] Caso simulado de una paciente.',
  prompt: '[Prueba] ¿Cuál es el diagnóstico?',
  explanation: '[Prueba] Explicación simulada.',
  refs: ['[Prueba] Guía simulada'],
  options: ['A', 'B', 'C', 'D'].map((letter, index) => ({
    letter,
    text: `[Prueba] Opción ${letter}`,
    correct: index === 0,
    bias: index === 0 ? null : 'anchoring',
    rationale: `[Prueba] Justificación ${letter}`,
  })),
  canonical: ['A', 'B', 'C', 'D'],
  caseKey: null,
  caseOrder: null,
  caseVignette: null,
};

/** La versión de la app que le corresponde al renglón, como la guarda la base */
const appVersion: VersionContent = {
  ...sheetRow,
  itemKinds: ['control', 'obscure_detail'],
  options: [...sheetRow.options].reverse().map((option) => ({
    letter: null,
    position: ['A', 'B', 'C', 'D'].indexOf(option.letter),
    text: option.text,
    isCorrect: option.correct,
    biasTag: option.bias,
    rationale: option.rationale,
  })),
  canonical: ['D', 'C', 'B', 'A'],
};

const hashOf = (question: SyncQuestion) => contentHash(canonicalFromSheet(question));

describe('forma canónica', () => {
  it('quita espacios en las orillas y al final de las líneas, y cambia CRLF por \\n', () => {
    expect(canonicalText('  hola \r\n  mundo  \r\n')).toBe('hola\n  mundo');
  });

  it('compone los acentos (NFC)', () => {
    expect(canonicalText('Diagnóstico')).toBe('Diagnóstico');
  });
});

describe('huella del contenido', () => {
  it('no cambia con espacios en las orillas, saltos de línea de Windows ni acentos compuestos', async () => {
    const base = await hashOf(sheetRow);
    const noisy = await hashOf({
      ...sheetRow,
      prompt: `  ${sheetRow.prompt.replace('ó', 'ó')}  `,
      vignette: `${sheetRow.vignette}\r\n`,
      options: sheetRow.options.map((option) => ({ ...option, text: ` ${option.text} ` })),
    });
    expect(noisy).toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
  });

  it('es igual para un renglón y para la versión de la app que le corresponde', async () => {
    expect(await contentHash(canonicalFromVersion(appVersion))).toBe(await hashOf(sheetRow));
  });

  it('cambia con cualquier cambio de contenido', async () => {
    const base = await hashOf(sheetRow);
    const variants: SyncQuestion[] = [
      { ...sheetRow, prompt: '[Prueba] ¿Cuál es el tratamiento?' },
      { ...sheetRow, difficulty: 4 },
      { ...sheetRow, subtopic: 'prenatal_control' },
      { ...sheetRow, refs: [] },
      { ...sheetRow, caseKey: 'GO-C001', caseOrder: 1, caseVignette: '[Prueba] Caso' },
      {
        ...sheetRow,
        options: sheetRow.options.map((option, index) =>
          index === 1 ? { ...option, bias: 'premature_closure' } : option,
        ),
      },
      {
        ...sheetRow,
        options: sheetRow.options.map((option, index) => ({ ...option, correct: index === 1 })),
      },
    ];
    for (const variant of variants) expect(await hashOf(variant)).not.toBe(base);
  });

  it('sin nivel cognitivo la huella es la de antes del nivel, para no volver a versionar todo (V4-B5)', async () => {
    // Esta huella se calculó con la versión anterior de contentHash.ts y no debe cambiar nunca
    expect(await hashOf(sheetRow)).toBe(
      '2d9b681fb26f93c00380996942f801447c6dba3960e91173982b87f4e7f23d3a',
    );
    expect(Object.keys(canonicalFromSheet(sheetRow))).not.toContain('cognitiveLevel');
    expect(
      Object.keys(canonicalFromVersion({ ...appVersion, cognitiveLevel: null })),
    ).not.toContain('cognitiveLevel');
  });

  it('con nivel cognitivo cambia, y un renglón y su versión con el mismo nivel dan la misma huella (V4-B5)', async () => {
    const base = await hashOf(sheetRow);
    const leveled = await hashOf({ ...sheetRow, cognitiveLevel: 'analysis' });
    expect(leveled).not.toBe(base);
    expect(await hashOf({ ...sheetRow, cognitiveLevel: 'synthesis' })).not.toBe(leveled);
    expect(
      await contentHash(canonicalFromVersion({ ...appVersion, cognitiveLevel: 'analysis' })),
    ).toBe(leveled);
    // El nivel está al final de la forma canónica, así la huella de lo demás no se mueve
    expect(
      Object.keys(canonicalFromSheet({ ...sheetRow, cognitiveLevel: 'analysis' })).at(-1),
    ).toBe('cognitiveLevel');
  });

  it('el sesgo de la correcta no cuenta, porque la correcta no lleva sesgo', async () => {
    const withBias = {
      ...sheetRow,
      options: sheetRow.options.map((option, index) =>
        index === 0 ? { ...option, bias: 'anchoring' } : option,
      ),
    };
    expect(await hashOf(withBias)).toBe(await hashOf(sheetRow));
  });
});

describe('otras huellas', () => {
  it('sha256 conocido', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('la de Autor, Revisor y Estado cambia con cualquiera de los tres', async () => {
    const meta = { authorCode: 'PM', reviewerCode: 'AL', sheetStatus: 'draft' as const };
    const base = await metaHash(meta);
    expect(await metaHash({ ...meta })).toBe(base);
    expect(await metaHash({ ...meta, reviewerCode: null })).not.toBe(base);
    expect(await metaHash({ ...meta, sheetStatus: 'ready' })).not.toBe(base);
  });

  it('la del Sheet no cambia con celdas vacías al final y sí con cualquier celda', async () => {
    const headers = ['ID', 'Pregunta'];
    const base = await sheetHash(headers, [['GO-0001', '[Prueba] Uno']]);
    expect(await sheetHash([...headers, ''], [['GO-0001', '[Prueba] Uno ', '', '']])).toBe(base);
    expect(await sheetHash(headers, [['GO-0001', '[Prueba] Dos']])).not.toBe(base);
  });
});
