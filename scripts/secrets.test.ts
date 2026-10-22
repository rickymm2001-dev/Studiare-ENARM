// Las formas de llaves que el escáner del build busca (B15, 2.3 y 6.3). Sin construir nada: solo el contenido
import { describe, expect, it } from 'vitest';
import { findServiceKeys } from './secrets.ts';

const some = (length: number, char = 'a') => char.repeat(length);

describe('formas de B15 en el escáner de secretos', () => {
  it('marca el token de organización y el de usuario de Sentry', () => {
    const org = `sntrys_${some(40, 'B')}`;
    const user = `sntryu_${some(30)}`;
    expect(findServiceKeys(`const t="${org}";`)).toEqual(['token de Sentry (sntrys_ o sntryu_)']);
    expect(findServiceKeys(`const t="${user}";`)).toEqual(['token de Sentry (sntrys_ o sntryu_)']);
    // Un token de verdad es un texto en base64 largo, con signos
    expect(
      findServiceKeys(`x=sntrys_eyJpYXQiOjE3MDAwMDAwMDAsInVybCI6Imh0dHBzOi8v+/=_-abc`),
    ).toHaveLength(1);
  });

  it('marca la llave personal de PostHog (phx_) y deja pasar la de proyecto (phc_), que es pública', () => {
    expect(findServiceKeys(`k="phx_${some(43, 'Q')}"`)).toEqual([
      'llave personal de PostHog (phx_)',
    ]);
    expect(findServiceKeys(`k="phc_${some(43, 'Q')}"`)).toEqual([]);
    expect(findServiceKeys('k="phc_SimuladaPruebasStudiare00000000000000000000"')).toEqual([]);
  });

  it('marca una llave de Resend en sus dos formas', () => {
    expect(findServiceKeys(`k="re_${some(8, 'x')}_${some(24, 'Y')}"`)).toEqual([
      'llave de Resend (re_)',
    ]);
    expect(findServiceKeys(`k="re_${some(36, 'z')}"`)).toEqual(['llave de Resend (re_)']);
  });

  it('no confunde el código con una llave: prefijos solos, nombres de funciones y textos que mencionan la forma', () => {
    for (const code of [
      "if (key.startsWith('sntrys_')) return false;",
      "if (key.startsWith('phx_')) return false;",
      "if (key.startsWith('re_')) return false;",
      'function re_render() {}',
      'const re_render_all_items_after_scroll_now = 1;',
      "const sntryu_ = 'x';",
      'const phx_ = 1;',
      'phx_corta',
    ]) {
      expect(findServiceKeys(code), code).toEqual([]);
    }
  });

  it('el DSN de Sentry es público y puede ir en el build', () => {
    expect(
      findServiceKeys(
        'dsn="https://0123456789abcdef0123456789abcdef@o4500000000000000.ingest.sentry.io/4500000000000001"',
      ),
    ).toEqual([]);
  });

  it('cada llave se cuenta una vez aunque aparezca varias veces', () => {
    const key = `sntrys_${some(40, 'B')}`;
    expect(findServiceKeys(`${key} ${key}`)).toEqual(['token de Sentry (sntrys_ o sntryu_)']);
  });
});
