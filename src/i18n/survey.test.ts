// Los textos de la encuesta de los primeros días (B18). Cada pregunta y cada opción de la configuración tiene su texto, y
// los textos cumplen las reglas del producto: español de México con trato de tú, sin signos de exclamación, sin dos puntos
// en la prosa y sin llamar anónima a una encuesta que se guarda con un código.
import { describe, expect, it } from 'vitest';
import { SURVEY_QUESTIONS, optionsOf } from '@/config/surveys';
import { surveyAdminTexts, surveyTexts } from './survey';

/** Todos los textos sueltos, también lo que dicen las funciones con unos datos de ejemplo */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown;
    for (const args of [
      [1],
      [3],
      [7, 8],
      [8, 'a@b.mx'],
      ['https://studiare.test/', 'a@b.mx'],
      [1, 'Nada', 'Mucho'],
      [2.5],
    ]) {
      try {
        const result = fn(...args);
        if (typeof result === 'string') out.push(result);
      } catch {
        // Una función con otra forma de argumentos no aplica a este ejemplo
      }
    }
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) allStrings(item, out);
  }
  return out;
}

const STRINGS = [...allStrings(surveyTexts), ...allStrings(surveyAdminTexts)];

describe('los textos de las preguntas', () => {
  it('cada pregunta de la configuración tiene su texto, y cada texto una pregunta', () => {
    expect(Object.keys(surveyTexts.questions).sort()).toEqual(
      SURVEY_QUESTIONS.map((question) => question.id).sort(),
    );
  });

  it('cada opción tiene su texto, y las escalas el texto de sus dos extremos', () => {
    for (const question of SURVEY_QUESTIONS) {
      const text = surveyTexts.questions[question.id];
      expect(text.label.length, question.id).toBeGreaterThan(10);
      if (question.kind === 'scale') {
        const scale = surveyTexts.questions[question.id];
        expect(
          'low' in scale && scale.low.length > 2 && 'high' in scale && scale.high.length > 2,
        ).toBe(true);
      } else {
        const options = 'options' in text ? Object.keys(text.options).sort() : [];
        expect(options, question.id).toEqual([...optionsOf(question)].sort());
      }
    }
  });

  it('las escalas dicen el extremo en la primera y la última opción', () => {
    expect(surveyTexts.scale.optionLabel(1, 'Nada claro', 'Muy claro')).toBe('1, Nada claro');
    expect(surveyTexts.scale.optionLabel(5, 'Nada claro', 'Muy claro')).toBe('5, Muy claro');
    expect(surveyTexts.scale.optionLabel(3, 'Nada claro', 'Muy claro')).toBe('3');
  });

  it('numera las preguntas como Pregunta 3 de 8', () => {
    expect(surveyTexts.position(3, 8)).toBe('Pregunta 3 de 8');
  });
});

describe('las reglas de redacción', () => {
  it('no usa signos de exclamación', () => {
    for (const text of STRINGS) expect(text).not.toMatch(/[¡!]/);
  });

  it('no usa dos puntos en la prosa', () => {
    // Las direcciones de ejemplo llevan https:// y no cuentan
    for (const text of STRINGS) expect(text.replaceAll('https://', 'https//')).not.toContain(':');
  });

  it('nunca llama anónima a la encuesta', () => {
    for (const text of STRINGS) expect(text).not.toMatch(/an[oó]nim/i);
  });

  it('trata de tú y no de usted', () => {
    for (const text of STRINGS)
      expect(text).not.toMatch(/\b(usted|ustedes|su respuesta de usted)\b/i);
  });

  it('dice que contestarla no depende de ningún permiso y que se guarda con un código', () => {
    expect(surveyTexts.independent).toMatch(/no depende de ningún permiso/);
    expect(surveyTexts.privacy).toMatch(/con un código y sin tu nombre ni tu correo/);
    expect(surveyTexts.privacy).toMatch(/Esto no es parte de la analítica/);
    expect(surveyTexts.erase).toMatch(/Configuración, Privacidad/);
    expect(surveyTexts.states.sentBody).toMatch(/antes de abrir el registro/);
  });

  it('el mensaje de invitación lleva la dirección, el correo exacto, los dos caminos y un dispositivo a la vez', () => {
    const message = surveyAdminTexts.invitation.message('https://studiare.test/', 'ana@correo.mx');
    expect(message).toContain('https://studiare.test/');
    expect(message).toContain('ana@correo.mx');
    expect(message).toMatch(/código/);
    expect(message).toMatch(/Google/);
    expect(message).toMatch(/un dispositivo a la vez/);
    expect(message).not.toMatch(/precio|descuento|puntaje|plaza/i);
  });
});
