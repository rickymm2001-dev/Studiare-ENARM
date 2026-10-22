import { describe, expect, it } from 'vitest';
import { FEATURE_FLAGS } from '@/config/featureFlags';
import { readWalletSetup } from './walletSetup';

const KEY = 'pk_test_' + 'SimuladaPruebasStudiare0000000000';

describe('cuándo se ofrecen las billeteras (B17, 6.6)', () => {
  it('con la bandera y una llave publicable buena sí, y devuelve la llave sin espacios', () => {
    expect(readWalletSetup(true, KEY)).toEqual({ publishableKey: KEY });
    expect(readWalletSetup(true, `  ${KEY}\n`)).toEqual({ publishableKey: KEY });
    expect(readWalletSetup(true, 'pk_live_' + 'SimuladaPruebasStudiare0000000000')).toEqual({
      publishableKey: 'pk_live_' + 'SimuladaPruebasStudiare0000000000',
    });
  });

  it('sin la bandera no, aunque la llave esté', () => {
    expect(readWalletSetup(false, KEY)).toBeNull();
  });

  it('sin llave, o con una que no es publicable, no, aunque la bandera esté', () => {
    for (const key of [
      undefined,
      '',
      '   ',
      'pk_test_corta',
      // Una llave secreta o restringida pegada por error no llega al navegador ni abre la política
      'sk_test_' + 'SimuladaPruebasStudiare0000000000',
      'rk_test_' + 'SimuladaPruebasStudiare0000000000',
      'whsec_' + 'SimuladaPruebasStudiare0000000000',
      'pk_test_Simulada Pruebas Studiare 0000000',
    ]) {
      expect(readWalletSetup(true, key), String(key)).toBeNull();
    }
  });

  it('por omisión lee la bandera del entorno y la llave del build, y hoy la bandera está apagada', () => {
    expect(Object.values(FEATURE_FLAGS.expressWallets.defaults)).toEqual([false, false, false]);
    expect(readWalletSetup()).toBeNull();
  });
});
