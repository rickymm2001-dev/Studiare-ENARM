import { describe, expect, it } from 'vitest';
import {
  MESSAGE_MAX,
  SCREEN_MAX,
  STACK_MAX,
  VERSION_MAX,
  buildClientErrorReport,
  hashText,
  isNoise,
  screenOf,
  scrub,
} from './clientErrors';

describe('quitar datos de personas', () => {
  it('cambia correos, ids, claves y tokens', () => {
    expect(scrub('falló para alumna@ejemplo.mx', 300)).toBe('falló para [correo]');
    expect(scrub('mazo 3f9c1c2e-5b7a-4a52-9d1e-0a1b2c3d4e5f no existe', 300)).toBe(
      'mazo [id] no existe',
    );
    expect(scrub('tarjeta 01J9Z0000000000000000000A1 sin nota', 300)).toBe('tarjeta [id] sin nota');
    expect(scrub('Bearer eyJhbGciOi.eyJzdWIiOiIxIn0.firma_abc', 300)).toBe('Bearer [token]');
    expect(scrub('llave sk-ant-api03-abcdefghijkl y whsec_12345678ab', 300)).toBe(
      'llave [clave] y [clave]',
    );
  });

  it('quita lo que va detrás de ? y # en una dirección', () => {
    expect(scrub('GET https://x.mx/a?token=abc&email=u@x.mx#sec falló', 300)).toBe(
      'GET https://x.mx/a?[q] falló',
    );
    expect(scrub('(https://x.mx/assets/a.js:1:23456)', 300)).toBe(
      '(https://x.mx/assets/a.js:1:23456)',
    );
  });

  it('cambia los números largos, pero no las líneas y columnas del código', () => {
    expect(scrub('teléfono 5512345678 y curp 12345678', 300)).toBe('teléfono [n] y curp [n]');
    expect(scrub('at f (a.js:1:2345678)', 300)).toBe('at f (a.js:1:2345678)');
  });

  it('recorta, quita caracteres de control y conserva los saltos de línea solo si se pide', () => {
    expect(scrub('a'.repeat(500), 300)).toHaveLength(300);
    expect(scrub('uno\ndos\t\u0007tres', 300)).toBe('uno dos tres');
    expect(scrub('uno\ndos\u0007tres', 300, true)).toBe('uno\ndos tres');
  });
});

describe('pantalla', () => {
  it('quita la base de la app y cambia los ids por :id', () => {
    expect(screenOf('/Studiare-ENARM/mazos/01J9Z0000000000000000000A1', '/Studiare-ENARM/')).toBe(
      '/mazos/:id',
    );
    expect(screenOf('/repaso/12345')).toBe('/repaso/:id');
    expect(screenOf('/')).toBe('/');
    expect(screenOf('/mazos/explorar')).toBe('/mazos/explorar');
  });

  it('no pasa del tope', () => {
    expect(screenOf(`/${'a'.repeat(200)}`).length).toBeLessThanOrEqual(SCREEN_MAX);
  });
});

describe('huella', () => {
  it('son 16 caracteres hexadecimales, estables y distintos para textos distintos', () => {
    expect(hashText('hola')).toMatch(/^[0-9a-f]{16}$/);
    expect(hashText('hola')).toBe(hashText('hola'));
    expect(hashText('hola')).not.toBe(hashText('hola.'));
    expect(hashText('')).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('armar el informe', () => {
  const base = { kind: 'error' as const, pathname: '/mazos', version: 'abc1234' };
  const boom = () => {
    const error = new TypeError('Cannot read properties of undefined');
    error.stack = [
      'TypeError: Cannot read properties of undefined',
      'at f (https://x.mx/assets/a.js:10:200)',
      'at g (https://x.mx/assets/a.js:11:300)',
    ].join('\n');
    return error;
  };

  it('resume un Error con su nombre, su traza y la pantalla', () => {
    const report = buildClientErrorReport({ ...base, error: boom() });
    expect(report).toMatchObject({
      kind: 'error',
      message: 'TypeError: Cannot read properties of undefined',
      screen: '/mazos',
      version: 'abc1234',
    });
    expect(report?.stack).toContain('at f (https://x.mx/assets/a.js:10:200)');
    expect(report?.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it('la huella no cambia con las columnas de la traza y sí con la versión o el mensaje', () => {
    const one = buildClientErrorReport({ ...base, error: boom() });
    const moved = boom();
    moved.stack = moved.stack?.replace(':10:200', ':10:999') ?? '';
    expect(buildClientErrorReport({ ...base, error: moved })?.fingerprint).toBe(one?.fingerprint);
    expect(
      buildClientErrorReport({ ...base, version: 'zzz9999', error: boom() })?.fingerprint,
    ).not.toBe(one?.fingerprint);
    expect(
      buildClientErrorReport({ ...base, error: new TypeError('otra cosa') })?.fingerprint,
    ).not.toBe(one?.fingerprint);
  });

  it('un texto lanzado se usa y un valor raro se describe sin volcar su contenido', () => {
    expect(buildClientErrorReport({ ...base, error: 'algo falló' })?.message).toBe('algo falló');
    const odd = buildClientErrorReport({ ...base, error: { secreto: 'alumna@ejemplo.mx' } });
    expect(odd?.message).toBe('Se lanzó un valor que no es un Error');
    expect(JSON.stringify(odd)).not.toContain('alumna');
    expect(odd?.stack).toBeNull();
  });

  it('descarta el ruido que no ayuda a diagnosticar', () => {
    expect(buildClientErrorReport({ ...base, error: 'Script error.' })).toBeNull();
    expect(
      buildClientErrorReport({
        ...base,
        error: new Error('ResizeObserver loop completed with undelivered notifications.'),
      }),
    ).toBeNull();
    expect(buildClientErrorReport({ ...base, error: '   ' })).toBeNull();
    expect(isNoise('Error: otra cosa')).toBe(false);
  });

  it('nunca pasa de los topes que exige el servidor', () => {
    const error = new Error('m'.repeat(900));
    error.stack = Array.from(
      { length: 50 },
      (_, index) => `at f${index} (${'x'.repeat(300)})`,
    ).join('\n');
    const report = buildClientErrorReport({
      ...base,
      error,
      pathname: `/${'p'.repeat(300)}`,
      version: 'v'.repeat(100),
    });
    expect(report?.message.length).toBeLessThanOrEqual(MESSAGE_MAX);
    expect(report?.stack?.length).toBeLessThanOrEqual(STACK_MAX);
    expect(report?.screen.length).toBeLessThanOrEqual(SCREEN_MAX);
    expect(report?.version.length).toBeLessThanOrEqual(VERSION_MAX);
    expect(report?.stack?.split('\n').length).toBeLessThanOrEqual(8);
  });

  it('el informe no trae correos ni ids aunque vengan en el mensaje o en la traza', () => {
    const error = new Error(
      'falló para alumna@ejemplo.mx con 3f9c1c2e-5b7a-4a52-9d1e-0a1b2c3d4e5f',
    );
    error.stack = `Error: x\nat f (https://x.mx/a.js?token=secreto:1:2)`;
    const text = JSON.stringify(buildClientErrorReport({ ...base, error }));
    expect(text).not.toContain('alumna@');
    expect(text).not.toContain('3f9c1c2e');
    expect(text).not.toContain('secreto');
  });

  it('sin versión usa dev', () => {
    expect(buildClientErrorReport({ ...base, version: '', error: 'x' })?.version).toBe('dev');
  });
});
