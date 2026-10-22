// La vista previa de los bloques de la portada (B17, 5.2). Solo fuera de producción, con las mismas reglas
// que el texto ajeno, y siempre con la marca de contenido de prueba.
import { describe, expect, it } from 'vitest';
import { LANDING_PREVIEW_KEY, readLandingPreview } from './preview';

const valid = {
  creator: {
    name: 'Persona de prueba',
    role: 'Rol de prueba',
    quote: 'Cita de prueba.',
    photo: { file: 'creador-prueba.webp', alt: 'Retrato de prueba' },
  },
  testimonials: [
    { quote: 'Testimonio de prueba.', who: 'Alguien de prueba', permissionOn: '2026-10-01' },
  ],
};

const storing = (value: unknown) => ({
  getItem: (key: string) =>
    key === LANDING_PREVIEW_KEY
      ? typeof value === 'string'
        ? value
        : JSON.stringify(value)
      : null,
});

describe('vista previa de la portada', () => {
  it('con un JSON válido pinta los bloques y los marca como contenido de prueba', () => {
    for (const env of ['development', 'demo'] as const) {
      expect(readLandingPreview(env, storing(valid))).toEqual({ ...valid, sample: true });
    }
  });

  it('en producción nunca la lee, aunque el navegador la traiga', () => {
    let reads = 0;
    const storage = {
      getItem: () => {
        reads += 1;
        return JSON.stringify(valid);
      },
    };
    expect(readLandingPreview('production', storage)).toBeNull();
    expect(reads).toBe(0);
  });

  it('sin nada guardado, sin almacenamiento o con uno que falla, no hay vista previa', () => {
    expect(readLandingPreview('demo', { getItem: () => null })).toBeNull();
    expect(readLandingPreview('demo', null)).toBeNull();
    expect(
      readLandingPreview('demo', {
        getItem: () => {
          throw new Error('bloqueado');
        },
      }),
    ).toBeNull();
  });

  it('un JSON roto, con otra forma o con campos de más se ignora', () => {
    expect(readLandingPreview('demo', storing('{no es json'))).toBeNull();
    expect(readLandingPreview('demo', storing([]))).toBeNull();
    expect(readLandingPreview('demo', storing({ creator: null }))).toBeNull();
    expect(readLandingPreview('demo', storing({ ...valid, extra: 1 }))).toBeNull();
    expect(
      readLandingPreview('demo', storing({ ...valid, creator: { ...valid.creator, html: '<b>' } })),
    ).toBeNull();
    expect(
      readLandingPreview(
        'demo',
        storing({ ...valid, testimonials: Array.from({ length: 7 }, () => valid.testimonials[0]) }),
      ),
    ).toBeNull();
  });

  it('lo que rompe una regla de texto ajeno se ignora completo', () => {
    const bad = [
      { ...valid.creator, quote: '<img src=x onerror=alert(1)>' },
      { ...valid.creator, quote: 'Mira https://ejemplo.com ya' },
      { ...valid.creator, quote: 'Aprobarás el ENARM sin falla' },
      { ...valid.creator, photo: { file: 'https://ejemplo.com/f.webp', alt: 'Retrato' } },
      { ...valid.creator, photo: { file: 'creador.webp', alt: '' } },
    ];
    for (const creator of bad) {
      expect(readLandingPreview('demo', storing({ ...valid, creator }))).toBeNull();
    }
    const noPermission = [{ ...valid.testimonials[0], permissionOn: '' }];
    expect(
      readLandingPreview('demo', storing({ ...valid, testimonials: noPermission })),
    ).toBeNull();
  });

  it('un bloque puede quedar vacío en la vista previa', () => {
    expect(readLandingPreview('demo', storing({ creator: null, testimonials: [] }))).toEqual({
      creator: null,
      testimonials: [],
      sample: true,
    });
  });
});
