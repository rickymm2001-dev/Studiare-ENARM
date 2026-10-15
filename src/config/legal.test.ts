import { describe, expect, it } from 'vitest';
import { readLegalIdentity } from './legal';

describe('readLegalIdentity', () => {
  it('lee el nombre, el domicilio y los correos y recorta espacios', () => {
    expect(
      readLegalIdentity({
        VITE_LEGAL_NAME: '  Plexus Medica S. de R.L. de C.V. ',
        VITE_LEGAL_ADDRESS: 'Calle 60 número 100, Centro, 97000 Mérida, Yucatán',
        VITE_PRIVACY_EMAIL: ' privacidad@studiare.mx ',
        VITE_SUPPORT_EMAIL: 'soporte@studiare.mx',
      }),
    ).toEqual({
      name: 'Plexus Medica S. de R.L. de C.V.',
      address: 'Calle 60 número 100, Centro, 97000 Mérida, Yucatán',
      email: 'soporte@studiare.mx',
      privacyEmail: 'privacidad@studiare.mx',
    });
  });

  it('sin configurar no inventa nada', () => {
    expect(readLegalIdentity({})).toEqual({
      name: null,
      address: null,
      email: null,
      privacyEmail: null,
    });
  });

  it('sin VITE_PRIVACY_EMAIL, o con algo que no es un correo, el de privacidad es el de ayuda (pregunta 43)', () => {
    expect(readLegalIdentity({ VITE_SUPPORT_EMAIL: 'ayuda@studiare.mx' }).privacyEmail).toBe(
      'ayuda@studiare.mx',
    );
    expect(
      readLegalIdentity({
        VITE_PRIVACY_EMAIL: 'privacidad@studiare.mx?bcc=otro@c.mx',
        VITE_SUPPORT_EMAIL: 'ayuda@studiare.mx',
      }).privacyEmail,
    ).toBe('ayuda@studiare.mx');
    // Y el de privacidad nunca se vuelve el de ayuda
    expect(readLegalIdentity({ VITE_PRIVACY_EMAIL: 'privacidad@studiare.mx' })).toMatchObject({
      email: null,
      privacyEmail: 'privacidad@studiare.mx',
    });
  });

  it('quita marcas y caracteres de control, y descarta lo demasiado corto o largo', () => {
    const control = String.fromCharCode(7);
    expect(readLegalIdentity({ VITE_LEGAL_NAME: `Studiare<script>${control}` }).name).toBe(
      'Studiarescript',
    );
    expect(readLegalIdentity({ VITE_LEGAL_NAME: 'ab' }).name).toBeNull();
    expect(readLegalIdentity({ VITE_LEGAL_NAME: 'x'.repeat(121) }).name).toBeNull();
    expect(readLegalIdentity({ VITE_LEGAL_ADDRESS: 42 }).address).toBeNull();
  });
});
