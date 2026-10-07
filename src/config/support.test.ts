import { describe, expect, it } from 'vitest';
import { readSupportEmail, supportMailto } from './support';

describe('contacto de ayuda', () => {
  it('lee el correo de VITE_SUPPORT_EMAIL y recorta espacios', () => {
    expect(readSupportEmail({ VITE_SUPPORT_EMAIL: ' ayuda@ejemplo.com ' })).toBe(
      'ayuda@ejemplo.com',
    );
  });

  it('sin la variable o con algo que no es un correo da null y no inventa una dirección', () => {
    for (const value of [
      undefined,
      '',
      '   ',
      'ayuda',
      'ayuda@',
      '@ejemplo.com',
      'a b@c.mx',
      'a@b',
      5,
      null,
    ]) {
      expect(readSupportEmail({ VITE_SUPPORT_EMAIL: value })).toBeNull();
    }
    expect(readSupportEmail({})).toBeNull();
  });

  it('no deja pasar texto que cambie el destino del enlace', () => {
    for (const value of [
      'a@b.mx,otro@c.mx',
      'a@b.mx?bcc=otro@c.mx',
      'a@b.mx?cc=x',
      'a@b.mx&x=1',
      'a@b.mx#x',
    ]) {
      expect(readSupportEmail({ VITE_SUPPORT_EMAIL: value })).toBeNull();
    }
    expect(readSupportEmail({ VITE_SUPPORT_EMAIL: 'ayuda+studiare@correo.ejemplo.com.mx' })).toBe(
      'ayuda+studiare@correo.ejemplo.com.mx',
    );
  });

  it('arma el enlace mailto con el asunto codificado', () => {
    expect(supportMailto('ayuda@ejemplo.com', 'Ayuda con mi cuenta & más')).toBe(
      'mailto:ayuda@ejemplo.com?subject=Ayuda%20con%20mi%20cuenta%20%26%20m%C3%A1s',
    );
  });
});
