import { describe, expect, it } from 'vitest';
import { ConsentPurposeSchema } from '@/data/schemas/common';
import { consentTexts, privacyHint } from './consents';
import { studentSyncTexts } from './studentSync';

const all = [
  ...Object.values(consentTexts.purposes).flat(),
  consentTexts.withdrawal,
  studentSyncTexts.officialScoreStaysHere,
];
const [, improvement] = consentTexts.purposes.anonymized_improvement;

describe('textos de los permisos (B14, 6.2)', () => {
  it('hay una etiqueta y una pista para cada finalidad que guarda la app', () => {
    expect(Object.keys(consentTexts.purposes).sort()).toEqual(
      [...ConsentPurposeSchema.options].sort(),
    );
    for (const [label, hint] of Object.values(consentTexts.purposes)) {
      expect(label.length).toBeGreaterThan(2);
      expect(hint.length).toBeGreaterThan(20);
    }
  });

  it('van sin dos puntos ni signos de exclamación, con trato de tú', () => {
    for (const text of all) expect(text).not.toMatch(/[!¡:]/);
    expect(improvement).toMatch(/\btu\b|\btus\b/);
    expect(improvement).toMatch(/Lo puedes retirar cuando quieras/);
  });

  it('la mejora dice que los datos son seudónimos, sin nombre ni correo, y todo lo que cubre', () => {
    expect(improvement).toMatch(/identificador seudónimo/);
    expect(improvement).toMatch(/sin tu nombre ni tu correo/);
    // Calibración de la dificultad, aviso a los médicos, comparación, fallas de la app y puntaje oficial
    expect(improvement).toMatch(/cada noche la dificultad real de las preguntas/);
    expect(improvement).toMatch(/avisar a los médicos de opciones que casi nadie elige/);
    expect(improvement).toMatch(/comparar a los alumnos por percentiles/);
    expect(improvement).toMatch(/reportes de fallas de la app/);
    expect(improvement).toMatch(/puntaje oficial/);
    // Seudónimos, no anónimos. No promete lo que no es
    expect(improvement).not.toMatch(/anónim/i);
  });

  it('en Privacidad la mejora suma qué pasa al retirarla y las demás no cambian', () => {
    expect(privacyHint('anonymized_improvement')).toBe(`${improvement} ${consentTexts.withdrawal}`);
    expect(consentTexts.withdrawal).toMatch(/desde la noche siguiente/);
    expect(consentTexts.withdrawal).toMatch(/tu puntaje oficial se borra/);
    expect(privacyHint('party')).toBe(consentTexts.purposes.party[1]);
    expect(privacyHint('ai_analysis')).toBe(consentTexts.purposes.ai_analysis[1]);
  });

  it('dice que el puntaje oficial se queda en el dispositivo y que retirar el permiso lo borra en todos', () => {
    expect(studentSyncTexts.officialScoreStaysHere).toMatch(
      /solo en el dispositivo donde lo capturas/,
    );
    expect(studentSyncTexts.officialScoreStaysHere).toMatch(/se borra en todos/);
  });

  it('nunca hablan de puntaje estimado, probabilidad de plaza ni ranking', () => {
    for (const text of all)
      expect(text).not.toMatch(/puntaje estimado|probabilidad|ranking|lugar n[uú]mero/i);
  });
});
