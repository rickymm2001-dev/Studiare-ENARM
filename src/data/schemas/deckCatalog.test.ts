// Esquemas del catálogo compartido de mazos (B11, 1.15 y 4.8 del plan de B11)
import { describe, expect, it } from 'vitest';
import {
  DeckManifestSchema,
  DeckSubjectFileSchema,
  deckMediaPartPath,
  deckSubjectPath,
} from './deckCatalog';

const subject = {
  subjectKey: 'infectologia',
  name: 'Infectología',
  branch: 'internal_medicine',
  topic: 'infectious_diseases',
  notes: 12,
  cards: 14,
  jsonBytes: 20_000,
  mediaBytes: 4_000_000,
  mediaParts: 1,
  sha256: 'a'.repeat(64),
};

const manifest = {
  deckKey: 'paco-mi',
  name: 'Medicina interna (Paco)',
  description: '[Prueba] Mazo simulado',
  author: 'Paco',
  license: 'third_party' as const,
  authorizationNote: 'Autorización escrita de Paco, la conserva Ricardo',
  subjects: [subject],
  preview: [{ kind: 'basic' as const, front: '[Prueba] Frente', back: '[Prueba] Reverso' }],
};

describe('manifiesto de una versión del catálogo', () => {
  it('acepta un mazo de terceros con su nota de autorización', () => {
    expect(DeckManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it('un mazo de terceros sin nota de autorización no entra (respuesta 49)', () => {
    const parsed = DeckManifestSchema.safeParse({ ...manifest, authorizationNote: null });
    expect(parsed.success).toBe(false);
    expect(
      DeckManifestSchema.safeParse({ ...manifest, license: 'own', authorizationNote: null }),
    ).toMatchObject({ success: true });
  });

  it('cada submazo lleva una clave distinta y una huella sha256', () => {
    expect(
      DeckManifestSchema.safeParse({ ...manifest, subjects: [subject, subject] }).success,
    ).toBe(false);
    expect(
      DeckManifestSchema.safeParse({ ...manifest, subjects: [{ ...subject, sha256: 'xyz' }] })
        .success,
    ).toBe(false);
  });

  it('la vista previa de Gratis llega a 5 notas', () => {
    const preview = Array.from({ length: 6 }, () => manifest.preview[0]);
    expect(DeckManifestSchema.safeParse({ ...manifest, preview }).success).toBe(false);
  });
});

describe('archivo de un submazo', () => {
  const file = {
    version: 1,
    deckKey: 'paco-mi',
    deckVersion: 2,
    subjectKey: 'infectologia',
    name: 'Infectología',
    branch: 'internal_medicine',
    topic: 'infectious_diseases',
    author: 'Paco',
    status: 'pending_physician_review',
    media: ['/deck-media/paco-mi/infectologia/m-0001.jpg'],
    notes: [
      {
        key: 'paco-mi-e7199b280d57',
        sourceTag: 'Medicina-Interna::Infectología::Sepsis',
        tags: ['Medicina Interna'],
        branch: 'internal_medicine',
        topic: 'infectious_diseases',
        kind: 'basic',
        front: '[Prueba] Frente <img src="/deck-media/paco-mi/infectologia/m-0001.jpg">',
        back: '[Prueba] Reverso',
      },
    ],
  };

  it('acepta notas con imágenes del catálogo', () => {
    expect(DeckSubjectFileSchema.safeParse(file).success).toBe(true);
  });

  it('rechaza imágenes que no son del catálogo', () => {
    expect(
      DeckSubjectFileSchema.safeParse({ ...file, media: ['/demo-media/paco-mi/m-0001.jpg'] })
        .success,
    ).toBe(false);
    expect(
      DeckSubjectFileSchema.safeParse({ ...file, media: ['/deck-media/paco-mi/../x/a.jpg'] })
        .success,
    ).toBe(false);
  });
});

describe('rutas en el bucket', () => {
  it('cada versión va en su carpeta, sin sobrescribir la anterior', () => {
    expect(deckSubjectPath('paco-mi', 2, 'infectologia')).toBe('paco-mi/v2/infectologia.json');
    expect(deckMediaPartPath('paco-mi', 2, 'infectologia', 3)).toBe(
      'paco-mi/v2/infectologia.media-3.zip',
    );
  });
});
