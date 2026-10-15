// @vitest-environment jsdom
// Partir un mazo de Anki por submazo para el catálogo (4.8 del plan de B11). Submazo por el segundo
// nivel de la etiqueta, claves de nota con la fórmula de import-paco-decks.ts, HTML saneado, imágenes
// en paquetes de hasta 5 MB y el .json partido arriba de 5 MB
import { createHash } from 'node:crypto';
import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { DeckSubjectFileSchema } from '../schemas/deckCatalog';
import { createCardSanitizer } from './cardHtml';
import {
  apkgMedia,
  groupMedia,
  manifestOf,
  noteKeyOf,
  packDeck,
  planSubjects,
  previewNotes,
  referencedImages,
  splitBytes,
  subjectKeyOf,
  uploadFilesOf,
  type PackDeps,
  type PackNote,
} from './deckPack';

const sanitizer = createCardSanitizer(window);
const IMAGE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

const note = (overrides: Partial<PackNote> = {}): PackNote => ({
  guid: 'guid-1',
  kind: 'basic',
  front: '<b>[Prueba] Frente</b><script>alert(1)</script>',
  back: '[Prueba] Reverso <img src="foto.png">',
  tags: ['Medicina-Interna::Hematología::Anemias'],
  deckPath: [],
  ...overrides,
});

const deps = (media: Record<string, Uint8Array> = { 'foto.png': IMAGE }): PackDeps => ({
  sanitize: (html, resolve) => sanitizer.sanitize(html, resolve),
  media: (name) => media[name] ?? null,
  zip: (files) => zipSync(files, { level: 0 }),
  propose: (segments) =>
    segments[1] === 'Hematología'
      ? { branch: 'internal_medicine', topic: 'hematology' }
      : { branch: 'internal_medicine', topic: null },
});

const meta = { deckKey: 'paco-mi', deckVersion: 2, author: 'Paco' };

describe('partir un mazo por submazo', () => {
  it('agrupa por el segundo nivel de la etiqueta y propone su rama y su tema', () => {
    const plans = planSubjects(
      [
        note(),
        note({ guid: 'g2', tags: ['Medicina-Interna::Hematología::Leucemias'] }),
        note({ guid: 'g3', tags: ['Medicina-Interna::Neumología'] }),
      ],
      deps().propose,
    );
    expect(plans).toEqual([
      {
        subjectKey: 'hematologia',
        name: 'Hematología',
        notes: 2,
        branch: 'internal_medicine',
        topic: 'hematology',
      },
      {
        subjectKey: 'neumologia',
        name: 'Neumología',
        notes: 1,
        branch: 'internal_medicine',
        topic: null,
      },
    ]);
  });

  it('las claves de nota son las de la demo, el HTML se sanea y las imágenes van al paquete', async () => {
    const packed = await packDeck(
      [
        note(),
        note({
          guid: 'guid-2',
          kind: 'cloze',
          front: '{{c1::[Prueba]}} y {{c2::hueco}}',
          back: '',
        }),
      ],
      meta,
      deps(),
    );
    const [subject] = packed.subjects;
    if (!subject) throw new Error('Sin submazo');
    const expectedKey = `paco-mi-${createHash('sha256').update('guid-1').digest('hex').slice(0, 12)}`;
    expect(await noteKeyOf('paco-mi', 'guid-1')).toBe(expectedKey);
    const file = DeckSubjectFileSchema.parse(JSON.parse(new TextDecoder().decode(subject.json)));
    const basic = file.notes.find((item) => item.key === expectedKey);
    expect(basic?.kind).toBe('basic');
    if (basic?.kind !== 'basic') throw new Error('Sin nota básica');
    expect(basic.front).not.toContain('<script');
    expect(basic.back).toContain('src="/deck-media/paco-mi/hematologia/m-0001.png"');
    expect(file.media).toEqual(['/deck-media/paco-mi/hematologia/m-0001.png']);
    expect(file).toMatchObject({
      deckKey: 'paco-mi',
      deckVersion: 2,
      subjectKey: 'hematologia',
      author: 'Paco',
    });
    // Una tarjeta por la básica y una por cada hueco
    expect(subject.cards).toBe(3);
    expect(subject.mediaParts).toHaveLength(1);
    expect(Object.keys(unzipSync(subject.mediaParts[0] ?? new Uint8Array()))).toEqual([
      'm-0001.png',
    ]);
    expect(subject.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('usa la rama y el tema que eligió el admin y omite las notas vacías', async () => {
    const packed = await packDeck(
      [note(), note({ guid: 'vacia', front: '<script>x</script>', back: '' })],
      meta,
      deps(),
      new Map([['hematologia', { branch: 'pediatrics', topic: 'neonatology' }]]),
    );
    expect(packed.skipped).toBe(1);
    expect(packed.subjects[0]?.notes[0]).toMatchObject({
      branch: 'pediatrics',
      topic: 'neonatology',
    });
  });

  it('las imágenes van en paquetes de hasta el tope y una que no cabe sola se omite', () => {
    const file = (name: string, size: number) => ({ name, bytes: new Uint8Array(size) });
    const { groups, skipped } = groupMedia(
      [file('a.png', 400), file('b.png', 400), file('c.png', 400), file('d.png', 5000)],
      1000,
    );
    expect(groups.map((group) => group.map((item) => item.name))).toEqual([
      ['a.png'],
      ['b.png'],
      ['c.png'],
    ]);
    expect(skipped).toBe(1);
    expect(groupMedia([file('a.png', 100), file('b.png', 100)], 1000).groups).toHaveLength(1);
  });

  it('el .json pasa a partes del tope y las rutas son las de deck_catalog_expected', async () => {
    expect(splitBytes(new Uint8Array(12), 5).map((part) => part.length)).toEqual([5, 5, 2]);
    const packed = await packDeck([note()], meta, deps());
    const files = uploadFilesOf('paco-mi', 2, packed.subjects);
    expect([...files.keys()]).toEqual([
      'paco-mi/v2/hematologia.json',
      'paco-mi/v2/hematologia.media-1.zip',
    ]);
  });

  it('el manifiesto lleva cifras, huella y una vista previa sin imágenes', async () => {
    const packed = await packDeck([note()], meta, deps());
    const manifest = manifestOf(
      {
        deckKey: 'paco-mi',
        name: 'Medicina interna (Paco)',
        description: '',
        author: 'Paco',
        license: 'third_party',
        authorizationNote: '[Prueba] Autorización simulada',
      },
      packed.subjects,
    );
    expect(manifest.subjects[0]).toMatchObject({
      subjectKey: 'hematologia',
      notes: 1,
      cards: 1,
      jsonBytes: packed.subjects[0]?.json.length,
      mediaParts: 1,
    });
    expect(manifest.preview).toHaveLength(1);
    expect(JSON.stringify(manifest.preview)).not.toMatch(/<img/);
    expect(previewNotes(packed.subjects, 0)).toEqual([]);
  });

  it('lee del paquete de Anki solo las imágenes que usan las notas', () => {
    const names = referencedImages([note(), note({ back: '<img src="otra%20foto.jpg">' })]);
    expect([...names].sort()).toEqual(['foto.png', 'otra foto.jpg']);
    const zip: Record<string, Uint8Array> = {
      media: new TextEncoder().encode(JSON.stringify({ 0: 'foto.png', 1: 'sobra.png' })),
      0: IMAGE,
      1: IMAGE,
    };
    const asked: string[] = [];
    const found = apkgMedia((wanted) => {
      const picked = Object.fromEntries(Object.entries(zip).filter(([name]) => wanted(name)));
      asked.push(...Object.keys(picked));
      return picked;
    }, names);
    expect([...found.keys()]).toEqual(['foto.png']);
    expect(asked).toEqual(['media', '0']);
  });

  it('la clave de un submazo es corta y sin acentos', () => {
    expect(subjectKeyOf('Patología Mamaria')).toBe('patologia-mamaria');
    expect(subjectKeyOf('***')).toBe('general');
  });
});
