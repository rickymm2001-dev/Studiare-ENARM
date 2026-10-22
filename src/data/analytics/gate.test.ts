// La tabla completa de cuándo la analítica puede juntar y mandar (B15, 1.1, 1.4 y 6.1). Cada fila quita
// una sola condición a un caso que sí puede, y tiene que bloquear justo por esa razón
import { describe, expect, it } from 'vitest';
import {
  canCollect,
  canSend,
  collectBlock,
  sendBlock,
  type GateBlock,
  type GateInput,
} from './gate';

const ID = '2f5b0c38-6a52-4a1f-9d57-3c7a9d1f0b11';
const OK: GateInput = {
  flag: true,
  config: {
    key: 'phc_SimuladaPruebasStudiare00000000000000000000',
    host: 'https://us.i.posthog.com',
  },
  consent: true,
  database: 'real',
  appEnv: 'production',
  cloud: true,
  analyticsId: ID,
};

describe('gate de la analítica', () => {
  it('con todo en regla se puede juntar y mandar', () => {
    expect(canCollect(OK)).toBe(true);
    expect(canSend(OK)).toBe(true);
    expect(collectBlock(OK)).toBeNull();
    expect(sendBlock(OK)).toBeNull();
  });

  const rows: [string, Partial<GateInput>, GateBlock][] = [
    ['la bandera productAnalytics apagada', { flag: false }, 'flag_off'],
    ['sin llave ni host', { config: null }, 'no_config'],
    ['en desarrollo, aunque haya llave y permiso', { appEnv: 'development' }, 'development'],
    ['en la base de demostración', { database: 'demo' }, 'demo_database'],
    ['sin nube configurada, una cuenta solo local', { cloud: false }, 'no_cloud'],
    ['sin saber todavía el permiso', { consent: null }, 'consent_unknown'],
    ['con el permiso apagado', { consent: false }, 'no_consent'],
  ];
  for (const [name, patch, block] of rows) {
    it(`no junta ni manda ${name}`, () => {
      const input = { ...OK, ...patch };
      expect(collectBlock(input)).toBe(block);
      expect(sendBlock(input)).toBe(block);
      expect(canCollect(input)).toBe(false);
      expect(canSend(input)).toBe(false);
    });
  }

  it('la demo publicada tampoco mide, aunque alguien ponga llave y permiso', () => {
    // Es la combinación de la demo: base real de un navegador cualquiera pero bandera apagada por entorno
    expect(canSend({ ...OK, flag: false, appEnv: 'demo' })).toBe(false);
  });

  it('sin identificador puede juntar, pero no mandar', () => {
    const waiting = { ...OK, analyticsId: null };
    expect(canCollect(waiting)).toBe(true);
    expect(canSend(waiting)).toBe(false);
    expect(sendBlock(waiting)).toBe('no_identity');
  });

  it('un identificador que no es uuid no sirve de distinct_id', () => {
    for (const analyticsId of ['', 'abc', 'ana@correo.mx', `${ID}x`, ID.replace(/-/g, '')]) {
      expect(sendBlock({ ...OK, analyticsId })).toBe('no_identity');
    }
  });

  it('el entorno demo con las banderas prendidas desde el servidor sí puede, como las pruebas de nube', () => {
    expect(canSend({ ...OK, appEnv: 'demo' })).toBe(true);
  });

  it('cada condición por separado es necesaria: ninguna combinación con una en contra pasa', () => {
    const breakers: Partial<GateInput>[] = rows.map(([, patch]) => patch);
    for (let mask = 1; mask < 2 ** breakers.length; mask += 1) {
      const patch = breakers.reduce<Partial<GateInput>>(
        (all, one, index) => (mask & (1 << index) ? { ...all, ...one } : all),
        {},
      );
      expect(canSend({ ...OK, ...patch })).toBe(false);
    }
  });
});
