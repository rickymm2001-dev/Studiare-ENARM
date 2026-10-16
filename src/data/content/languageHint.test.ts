// El aviso de idioma dudoso (B13, hallazgo 2 de la revisión). Solo avisa con un texto largo que parece
// inglés. Los negativos pesan más que los positivos, porque un aviso de más le pide trabajo al médico:
// un texto en español con términos en inglés, uno que cita una frase en inglés y uno mezclado no avisan.
import { describe, expect, it } from 'vitest';
import { questionBatches } from '@/demo/content/questions';
import {
  LANGUAGE_HINT_MAX_SPANISH_SHARE,
  LANGUAGE_HINT_MIN_CHARS,
  LANGUAGE_HINT_MIN_ENGLISH_SHARE,
  looksEnglish,
  wordShares,
} from './languageHint';

// Todo es texto simulado, escrito para estas pruebas, y no es contenido médico
const ENGLISH_TEXTS: Record<string, string> = {
  'texto para pacientes':
    '[Prueba] You should take this simulated medicine with food. If you miss a dose, take it as soon as you remember, but do not take two doses at the same time. Tell your doctor if you are pregnant, because the medicine may harm the baby. Call your doctor if you have a fever or a rash after taking it.',
  'resumen de artículo':
    '[Prueba] Background: this invented study evaluated whether early referral to a clinic improves outcomes in adults. Methods: it included a simulated cohort that was followed for three years. Results: patients who were referred early had lower mortality than those who were referred late. Conclusions: early referral was associated with better survival.',
  'instrucciones del hospital':
    '[Prueba] The nurses check the temperature of every patient when they arrive at the clinic, and they write a note in the chart if the fever is higher than normal. The doctors read the notes before the visit and decide which patients need more tests. None of this is medical content.',
};

const SPANISH_TEXTS: Record<string, string> = {
  'español con términos en inglés':
    'Mujer de 54 años con lupus eritematoso sistémico y síndrome antifosfolípido que acude por disnea progresiva. La tomografía muestra un patrón en ground-glass con crazy paving en ambos campos pulmonares y el lavado broncoalveolar es compatible con proteinosis. El point-of-care ultrasound descarta derrame, el score de Wells es bajo y el D-dimer resulta normal. Se solicita BNP y troponina, y se decide manejo con high-flow nasal cannula mientras se completa el workup.',
  'español que cita una frase en inglés':
    'Paciente de 62 años con diabetes tipo 2 que acude a consulta de control. La guía internacional indica: "Patients with type 2 diabetes and established cardiovascular disease should receive an SGLT2 inhibitor or a GLP-1 receptor agonist regardless of baseline HbA1c". Con base en lo anterior, el médico decide modificar el esquema de tratamiento del paciente y solicita estudios de laboratorio.',
  'mitad y mitad':
    'La paciente refiere dolor abdominal de tres días de evolución. The patient reports abdominal pain for three days and has not had a fever. A la exploración se encuentra con signo de Murphy positivo y leucocitosis. The ultrasound shows gallbladder wall thickening and pericholecystic fluid. Se decide hospitalizar para manejo quirúrgico de la colecistitis aguda.',
  'estudio con odds ratio y siglas':
    'En un estudio de cohorte con 1,200 pacientes, el OR para mortalidad fue de 2.4 (IC 95%, 1.3 a 4.1) en quienes tenían ALL en recaída. El AS grave, el BE y el IT se registraron en la base y el seguimiento fue de cinco años en el 80% de los participantes, con pérdidas similares en ambos brazos.',
  'resultados de laboratorio con unidades en inglés':
    'Hemoglobin 9.2 g/dL, MCV 74 fL, ferritin 8 ng/mL, transferrin saturation 6%, reticulocytes 0.8%, leukocytes 6,200/mm3, platelets 410,000/mm3, creatinine 0.9 mg/dL, TSH 2.1 mIU/L, vitamin B12 480 pg/mL, folate 9 ng/mL, serum iron 20 mcg/dL, total iron-binding capacity 480 mcg/dL.',
};

describe('aviso de idioma dudoso', () => {
  it('avisa con un texto largo en inglés', () => {
    for (const [name, text] of Object.entries(ENGLISH_TEXTS)) {
      expect(text.length, name).toBeGreaterThan(LANGUAGE_HINT_MIN_CHARS);
      expect(looksEnglish(text), name).toBe(true);
      const { english, spanish } = wordShares(text);
      expect(english, name).toBeGreaterThanOrEqual(LANGUAGE_HINT_MIN_ENGLISH_SHARE);
      expect(spanish, name).toBeLessThanOrEqual(LANGUAGE_HINT_MAX_SPANISH_SHARE);
    }
  });

  it('un texto en inglés que no es largo no avisa, como un término o una frase', () => {
    expect(looksEnglish('[Prueba] Which statement does the passage support?')).toBe(false);
    expect(looksEnglish('heart attack')).toBe(false);
    expect(looksEnglish('')).toBe(false);
    const short = ENGLISH_TEXTS['texto para pacientes']?.slice(0, LANGUAGE_HINT_MIN_CHARS) ?? '';
    expect(short.trim().length).toBeLessThanOrEqual(LANGUAGE_HINT_MIN_CHARS);
    expect(looksEnglish(short)).toBe(false);
    // Los espacios de sobra no suman al largo
    expect(looksEnglish(`${' '.repeat(300)}[Prueba] You should take it.${' '.repeat(300)}`)).toBe(
      false,
    );
  });

  it('un texto en español, con términos en inglés o mezclado, no avisa', () => {
    for (const [name, text] of Object.entries(SPANISH_TEXTS)) {
      expect(text.length, name).toBeGreaterThan(LANGUAGE_HINT_MIN_CHARS);
      expect(looksEnglish(text), name).toBe(false);
    }
  });

  it('ninguna viñeta ni caso del banco de demostración en español avisa', () => {
    const texts = questionBatches.flatMap((batch) => [
      ...batch.questions.map((question) => question.vignette),
      ...batch.cases.map((clinicalCase) => clinicalCase.vignette),
    ]);
    const long = texts.filter((text) => text.length > LANGUAGE_HINT_MIN_CHARS);
    // Que la prueba mire texto de verdad, no una lista vacía
    expect(long.length).toBeGreaterThan(50);
    for (const text of long) {
      expect(looksEnglish(text), text.slice(0, 60)).toBe(false);
      // Y con holgura: ni cerca de los umbrales
      const { english, spanish } = wordShares(text);
      expect(english).toBeLessThan(LANGUAGE_HINT_MIN_ENGLISH_SHARE / 2);
      expect(spanish).toBeGreaterThan(LANGUAGE_HINT_MAX_SPANISH_SHARE * 3);
    }
  });

  it('cuenta palabras con acentos y sin signos, y un texto vacío no divide entre cero', () => {
    expect(wordShares('')).toEqual({ words: 0, english: 0, spanish: 0 });
    const shares = wordShares('El niño, con fiebre; la mamá: "no sabe".');
    expect(shares.words).toBe(8);
    // el, con, la
    expect(shares.spanish).toBeCloseTo(3 / 8);
    expect(shares.english).toBe(0);
  });
});
