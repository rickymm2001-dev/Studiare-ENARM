import { describe, expect, it } from 'vitest';
import { readLegalIdentity } from './legal';

describe('readLegalIdentity', () => {
  it('lee el nombre, el domicilio y el correo y recorta espacios', () => {
    expect(
      readLegalIdentity({
        VITE_LEGAL_NAME: '  Studiare Educación SA de CV ',
        VITE_LEGAL_ADDRESS: 'Calle 60 número 100, Centro, 97000 Mérida, Yucatán',
        VITE_SUPPORT_EMAIL: 'privacidad@studiare.mx',
      }),
    ).toEqual({
      name: 'Studiare Educación SA de CV',
      address: 'Calle 60 número 100, Centro, 97000 Mérida, Yucatán',
      email: 'privacidad@studiare.mx',
    });
  });

  it('sin configurar no inventa nada', () => {
    expect(readLegalIdentity({})).toEqual({ name: null, address: null, email: null });
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
