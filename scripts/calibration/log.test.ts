import { describe, expect, it } from 'vitest';
import {
  CODE_WORDS,
  ERROR_CLASSES,
  LOG_CODES,
  createLogger,
  describeError,
  isSafeValue,
  safeCounts,
  safeFields,
  type LogCode,
} from './log.ts';

function capture() {
  const lines: string[] = [];
  return { lines, logger: createLogger((line) => lines.push(line)) };
}

/** Todo lo que no debe salir jamás en un registro público */
const DANGEROUS = [
  'Ana López',
  'ana@ejemplo.mx',
  '3f9a0c1d-2e4b-4a69-8c1d-0123456789ab',
  '01HZX8Q6N7V3M4K5P6R7S8T9WA',
  'sb_secret_abcdefghijklmnop',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.firma',
  '[Prueba] ¿Qué diagnóstico es más probable?',
  'Mayúsculas',
  'con espacios',
  'con-guion',
  '',
  'a'.repeat(65),
  // Escritos en minúsculas y con guion bajo también son datos, no códigos
  'ana_lopez',
  'ana_lopez_garcia_12',
  'sb_publishable_abcdef',
  'password',
  'valores_de_la_pregunta',
];

describe('registro sin texto ni datos personales', () => {
  it('escribe una línea JSON con el código y los campos seguros', () => {
    const { lines, logger } = capture();
    logger.log('page_read', {
      kind: 'answers',
      rows: 20000,
      done: false,
      fatigueState: 'validated',
    });
    expect(lines).toEqual([
      '{"code":"page_read","kind":"answers","rows":20000,"done":false,"fatigueState":"validated"}',
    ]);
  });

  it('descarta cualquier valor que no sea un número, un booleano o un código en minúsculas', () => {
    const { lines, logger } = capture();
    for (const value of DANGEROUS) logger.log('error', { detail: value });
    for (const line of lines) {
      expect(JSON.parse(line)).toEqual({ code: 'error', dropped_field: 1 });
      for (const value of DANGEROUS.filter((item) => item !== ''))
        expect(line).not.toContain(value);
    }
    expect(lines).toHaveLength(DANGEROUS.length);
  });

  it('descarta objetos, listas, nulos, indefinidos y números que no son finitos', () => {
    const { kept, dropped } = safeFields({
      a: { nombre: 'Ana' },
      b: ['Ana'],
      c: null,
      d: undefined,
      e: Number.NaN,
      f: Number.POSITIVE_INFINITY,
      g: 12n,
      h: () => 'Ana',
      i: Symbol('Ana'),
      ok: 3,
    });
    expect(kept).toEqual({ ok: 3 });
    expect(dropped).toBe(9);
  });

  it('descarta los nombres de campo que no son nombres, los reservados y los que sobran', () => {
    const fields: Record<string, unknown> = {
      'ana@ejemplo.mx': 1,
      'con espacios': 1,
      Mayúscula: 1,
      code: 'otro',
      dropped_field: 99,
      ok_name: 1,
    };
    for (let i = 0; i < 60; i += 1) fields[`campo${i}`] = i;
    const { kept, dropped } = safeFields(fields);
    expect(Object.keys(kept)).toHaveLength(35);
    expect(kept).toHaveProperty('ok_name', 1);
    expect(dropped).toBeGreaterThan(20);
    expect(kept).not.toHaveProperty('code');
  });

  it('un código fuera de la lista cerrada no sale tal cual', () => {
    const { lines, logger } = capture();
    logger.log('ana@ejemplo.mx' as LogCode, { rows: 1 });
    expect(JSON.parse(lines[0] as string)).toEqual({
      code: 'error',
      errorClass: 'Error',
      errorCode: 'bad_log_code',
    });
    const warnings = capture();
    warnings.logger.warning('ana@ejemplo.mx');
    warnings.logger.warning('not_configured');
    expect(warnings.lines).toEqual(['::warning title=calibration::not_configured']);
  });

  it('toda línea es JSON de una sola línea y la lista de códigos solo tiene códigos', () => {
    const { lines, logger } = capture();
    for (const code of LOG_CODES) {
      expect(code).toMatch(/^[a-z][a-z0-9_]*$/);
      logger.log(code, { text: 'línea\ncon salto', n: 1 });
    }
    for (const line of lines) {
      expect(line).not.toContain('\n');
      expect(() => JSON.parse(line) as unknown).not.toThrow();
    }
  });

  it('los conteos de una corrida admiten más campos que una línea del registro', () => {
    const counts = Object.fromEntries(
      Array.from({ length: 120 }, (_, index) => [`campo${index}`, index]),
    );
    expect(Object.keys(safeCounts(counts))).toHaveLength(120);
    expect(Object.keys(safeFields(counts).kept)).toHaveLength(40);
  });

  it('solo pasan las palabras de la lista cerrada, los SQLSTATE y los estados HTTP', () => {
    for (const word of [...CODE_WORDS, ...ERROR_CLASSES]) {
      expect(word).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
      expect(word).not.toMatch(/^sb_|secret|key|token|password|eyj/);
      expect(isSafeValue(word)).toBe(true);
    }
    for (const code of [
      '57014',
      '22023',
      '42501',
      'p0001',
      'xx000',
      'http_503',
      'http_401',
      'pgrst301',
    ]) {
      expect(isSafeValue(code)).toBe(true);
    }
    for (const bad of [
      'http_999',
      'http_5',
      'hello',
      'abcde',
      '5701',
      '570140',
      'PGRST301',
      'pgrst30',
    ]) {
      expect(isSafeValue(bad)).toBe(false);
    }
  });

  it('safeCounts deja pasar números y códigos de los conteos, y nada más', () => {
    expect(
      safeCounts({
        consenters: 412,
        fatigueState: 'validated',
        parity: true,
        nota: 'Un texto con espacios',
        nested: { a: 1 },
        nan: Number.NaN,
      }),
    ).toEqual({ consenters: 412, fatigueState: 'validated', parity: true });
    expect(isSafeValue('dry_run')).toBe(true);
    expect(isSafeValue('Dry_run')).toBe(false);
    expect(isSafeValue(0)).toBe(true);
    expect(isSafeValue(-1.5)).toBe(true);
  });
});

describe('errores sin mensaje', () => {
  it('un error de la tienda sale con su clase y su SQLSTATE o su estado HTTP', () => {
    const secret = new Error('falló con sb_secret_abc y ana@ejemplo.mx');
    secret.name = 'StoreError';
    Object.assign(secret, { code: '57014', status: null, rpc: 'calibration_bank' });
    expect(describeError(secret)).toEqual({ errorClass: 'StoreError', errorCode: '57014' });
    const http = Object.assign(new Error('x'), { name: 'StoreError', code: null, status: 503 });
    expect(describeError(http)).toEqual({ errorClass: 'StoreError', errorCode: 'http_503' });
    const gateway = Object.assign(new Error('x'), { name: 'StoreError', code: 'PGRST301' });
    expect(describeError(gateway)).toEqual({ errorClass: 'StoreError', errorCode: 'pgrst301' });
    const network = Object.assign(new Error('x'), { name: 'StoreError', kind: 'network' });
    expect(describeError(network)).toEqual({ errorClass: 'StoreError', errorCode: 'network' });
  });

  it('una clase que no está en la lista sale como Error y nunca con su mensaje', () => {
    class Nombrada extends Error {}
    const error = new Nombrada('mensaje con Ana López y eyJhbGciOiJIUzI1NiJ9');
    const summary = describeError(error);
    expect(summary).toEqual({ errorClass: 'Error', errorCode: 'unknown' });
    expect(JSON.stringify(summary)).not.toMatch(/Ana|eyJ|mensaje/);
    expect(describeError('texto con Ana')).toEqual({ errorClass: 'Error', errorCode: 'unknown' });
    expect(describeError(null)).toEqual({ errorClass: 'Error', errorCode: 'unknown' });
    expect(describeError({ code: 'ana@ejemplo.mx', status: 99999 })).toEqual({
      errorClass: 'Error',
      errorCode: 'unknown',
    });
  });
});
