import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scrubPersonalData } from './piiFilter';

describe('scrubPersonalData', () => {
  it('oculta correos, teléfonos, enlaces, CURP y RFC y cuenta cada uno', () => {
    const result = scrubPersonalData(
      'Escribe a ana.lopez@correo.com o al 55 1234 5678 y +52 (999) 123-4567. ' +
        'Mira https://sitio.com/perfil?id=3 y www.ejemplo.org. CURP LOPA900101HYNPRN09, RFC LOPA900101AB1.',
    );
    expect(result.text).toBe(
      'Escribe a [correo] o al [número] y [número]. Mira [enlace] y [enlace]. CURP [CURP], RFC [RFC].',
    );
    expect(result.counts).toEqual({ email: 1, phone: 2, curp: 1, rfc: 1, url: 2, name: 0 });
    expect(result.total).toBe(7);
  });

  it('un correo dentro de un enlace se cuenta una sola vez, como enlace', () => {
    const result = scrubPersonalData('Ver http://x.com/?mail=a@b.com ahora');
    expect(result.counts).toMatchObject({ url: 1, email: 0 });
  });

  it('no toca valores clínicos con decimales, dosis ni rangos', () => {
    const clinical =
      'Dosis de 0.5 mg/kg cada 6 h. Creatinina 1.2 mg/dL. Presión 120/80 mmHg. 1,500,000 UI. Hb 12.345678901.';
    expect(scrubPersonalData(clinical)).toMatchObject({ text: clinical, total: 0 });
  });

  it('un número de seguro social de 11 dígitos se oculta', () => {
    expect(scrubPersonalData('NSS 12345678901 del paciente').text).toBe(
      'NSS [número] del paciente',
    );
  });

  it('oculta los nombres que se le pasen, sin importar mayúsculas ni acentos pegados a otra palabra', () => {
    const result = scrubPersonalData('Ana revisó el caso de ANA y de Ananías. Ana-María no.', [
      'Ana',
    ]);
    // Ananías no es Ana, pero Ana-María trae a Ana como palabra completa
    expect(result.text).toBe(
      '[nombre] revisó el caso de [nombre] y de Ananías. [nombre]-María no.',
    );
    expect(result.counts.name).toBe(3);
  });

  it('ignora nombres demasiado cortos o vacíos y escapa caracteres especiales', () => {
    expect(scrubPersonalData('Al y yo.', ['Al', ' ', ''])).toMatchObject({
      text: 'Al y yo.',
      total: 0,
    });
    expect(scrubPersonalData('El (x) sí', ['(x)']).text).toBe('El [nombre] sí');
  });

  it('es idempotente y nunca deja el texto original de lo que ocultó', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 120 }),
        fc
          .tuple(fc.stringMatching(/^[a-z][a-z0-9._]{1,10}$/), fc.stringMatching(/^[a-z]{2,8}$/))
          .map(([user, host]) => `${user}@${host}.com`),
        fc.string({ minLength: 10, maxLength: 11, unit: fc.constantFrom('0', '1', '5', '7', '9') }),
        (filler, email, digits) => {
          const input = `${filler} ${email} ${digits} ${filler}`;
          const once = scrubPersonalData(input);
          expect(once.text).not.toContain(email);
          expect(once.text).not.toContain(digits);
          const twice = scrubPersonalData(once.text);
          expect(twice.text).toBe(once.text);
          expect(twice.total).toBe(0);
        },
      ),
    );
  });
});
