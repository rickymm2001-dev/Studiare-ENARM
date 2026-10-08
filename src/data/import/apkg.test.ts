import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseApkg } from './apkg';
import { IMPORT_LIMITS } from './limits';
import {
  buildLegacyApkg,
  buildModernApkg,
  forgeZipSize,
  loadSqlForTests,
  standardModels,
  zstdBomb,
  zstdStore,
  type ApkgFixture,
} from './testing/fixtures';
import { ImportError } from './types';

const fixture: ApkgFixture = {
  models: {
    ...standardModels,
    occlusion: { name: 'Image Occlusion Enhanced' },
    triple: { name: 'Tres cartas', templates: 3 },
  },
  reviews: 12,
  notes: [
    {
      guid: 'g-basic',
      model: 'basic',
      fields: ['¿Triada de Beck?', 'Hipotensión, yugulares y ruidos apagados'],
      tags: 'cardio Medicina_Interna::Cardiología',
      deck: 'ENARM 2026::Cardiología',
    },
    {
      guid: 'g-reversed',
      model: 'reversed',
      fields: ['Metformina', 'Biguanida'],
      deck: 'ENARM 2026::Cardiología',
      ordinals: [0, 1],
    },
    {
      guid: 'g-cloze',
      model: 'cloze',
      fields: ['La {{c1::troponina}} sube a las {{c2::3 horas}}', 'Extra del hueco'],
      deck: 'ENARM 2026',
    },
    {
      guid: 'g-media',
      model: 'basic',
      fields: ['Con imagen <img src="foto.png"> y [sound:a.mp3]', 'Respuesta'],
      deck: 'Default',
    },
    { guid: 'g-io', model: 'occlusion', fields: ['Imagen', 'Máscara'], deck: 'Default' },
    {
      guid: 'g-many',
      model: 'triple',
      fields: ['Frente', 'Reverso', 'Más', ''],
      deck: 'A::B::C::D::E::F::G::H',
    },
    {
      guid: 'g-tagged-cloze',
      model: 'basic',
      fields: ['Un campo con {{c1::hueco}} aunque el tipo sea básico', 'x'],
      deck: 'Default',
    },
  ],
};

describe('importador de .apkg del formato viejo', () => {
  it('lee las notas, los tipos, los mazos y las etiquetas', async () => {
    const parsed = await run(await buildLegacyApkg(fixture));
    expect(parsed.source).toBe('apkg');
    expect(parsed.notes).toHaveLength(7);
    const by = (guid: string) => parsed.notes.find((note) => note.guid === guid);

    expect(by('g-basic')).toMatchObject({
      kind: 'basic',
      front: '¿Triada de Beck?',
      back: 'Hipotensión, yugulares y ruidos apagados',
      html: true,
      deckPath: ['ENARM 2026', 'Cardiología'],
      tags: ['cardio', 'Medicina_Interna::Cardiología'],
    });
    expect(by('g-reversed')?.kind).toBe('basic_reverse');
    expect(by('g-cloze')).toMatchObject({
      kind: 'cloze',
      front: 'La {{c1::troponina}} sube a las {{c2::3 horas}}',
      back: 'Extra del hueco',
    });
    // El mazo Default de Anki no es una carpeta del alumno
    expect(by('g-media')?.deckPath).toEqual([]);
    // Un campo con huecos se trata como cloze aunque su tipo diga básico
    expect(by('g-tagged-cloze')?.kind).toBe('cloze');
  });

  it('cada tipo raro se importa como básica y avisa', async () => {
    const parsed = await run(await buildLegacyApkg(fixture));
    const by = (guid: string) => parsed.notes.find((note) => note.guid === guid);
    expect(by('g-io')?.kind).toBe('basic');
    expect(by('g-many')).toMatchObject({ kind: 'basic', back: 'Reverso<br>Más' });
    const codes = Object.fromEntries(
      parsed.warnings.map((warning) => [warning.code, warning.count]),
    );
    expect(codes).toMatchObject({
      image_occlusion: 1,
      extra_templates: 1,
      // Una imagen y un audio
      media_skipped: 2,
      // Los repasos de Anki se ignoran y todas las tarjetas empiezan nuevas (D-010)
      revlog_ignored: 12,
      deck_too_deep: 1,
    });
  });

  it('quita los audios del texto y deja las imágenes para el saneador', async () => {
    const parsed = await run(await buildLegacyApkg(fixture));
    const media = parsed.notes.find((note) => note.guid === 'g-media');
    expect(media?.front).not.toContain('[sound:');
    expect(media?.front).toContain('<img');
  });

  it('un mazo de muchos niveles se corta y avisa', async () => {
    const parsed = await run(await buildLegacyApkg(fixture));
    expect(parsed.notes.find((note) => note.guid === 'g-many')?.deckPath).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
    ]);
  });

  it('un paquete vacío de notas no es un error', async () => {
    const parsed = await run(await buildLegacyApkg({ models: standardModels, notes: [] }));
    expect(parsed.notes).toEqual([]);
  });
});

describe('importador de .apkg del formato nuevo', () => {
  it('lee collection.anki21b comprimido con zstd y detecta el cloze por la configuración', async () => {
    const parsed = await run(await buildModernApkg(fixture));
    expect(parsed.notes).toHaveLength(7);
    const by = (guid: string) => parsed.notes.find((note) => note.guid === guid);
    expect(by('g-basic')).toMatchObject({
      kind: 'basic',
      deckPath: ['ENARM 2026', 'Cardiología'],
      tags: ['cardio', 'Medicina_Interna::Cardiología'],
    });
    expect(by('g-reversed')?.kind).toBe('basic_reverse');
    // El tipo cloze se sabe por el campo 1 de su configuración protobuf
    expect(by('g-cloze')).toMatchObject({ kind: 'cloze', back: 'Extra del hueco' });
    expect(by('g-io')?.kind).toBe('basic');
  });

  it('el formato nuevo gana sobre el collection.anki2 de relleno', async () => {
    const parsed = await run(await buildModernApkg(fixture));
    expect(parsed.notes.length).toBeGreaterThan(1);
  });
});

describe('importador de .apkg ante archivos dañados o hechos para fallar', () => {
  const codeOf = async (bytes: Uint8Array, limits = IMPORT_LIMITS) => {
    try {
      await run(bytes, limits);
    } catch (error) {
      if (error instanceof ImportError) return error.code;
      throw error;
    }
    return 'ok';
  };

  it('una bomba zip, que declara más de lo permitido, se rechaza sin descomprimir', async () => {
    const zip = forgeZipSize(
      await buildLegacyApkg(fixture),
      'collection.anki21',
      700 * 1024 * 1024,
    );
    expect(await codeOf(zip)).toBe('too_large');
  });

  it('un archivo de medios de más de 50 MB se rechaza', async () => {
    const zip = zipSync({ '0': strToU8('x'), 'collection.anki2': strToU8('y') });
    expect(await codeOf(forgeZipSize(zip, '0', 51 * 1024 * 1024))).toBe('too_large');
  });

  it('con demasiados archivos se rechaza', async () => {
    const files: Record<string, Uint8Array> = { 'collection.anki2': strToU8('y') };
    for (let index = 0; index < 20; index += 1) files[String(index)] = strToU8('m');
    expect(await codeOf(zipSync(files), { ...IMPORT_LIMITS, maxFiles: 10 })).toBe('too_many_files');
  });

  it('una ruta con .. o absoluta se rechaza', async () => {
    for (const name of ['../evil.txt', 'media/../../evil', '/etc/passwd', 'C:/windows/x']) {
      const zip = zipSync({ [name]: strToU8('x'), 'collection.anki2': strToU8('y') });
      expect(await codeOf(zip), name).toBe('unsafe_path');
    }
  });

  it('un zip sin base de datos no es un paquete', async () => {
    expect(await codeOf(zipSync({ 'otra-cosa.txt': strToU8('x') }))).toBe('no_collection');
  });

  it('una base de datos que no es SQLite se rechaza como dañada', async () => {
    const zip = zipSync({
      'collection.anki21': strToU8('esto no es sqlite, solo texto largo '.repeat(20)),
    });
    expect(await codeOf(zip)).toBe('corrupt');
  });

  it('un zip dañado se rechaza como dañado', async () => {
    const zip = await buildLegacyApkg(fixture);
    expect(await codeOf(zip.subarray(0, 40))).toBe('corrupt');
    const garbled = new Uint8Array(zip);
    garbled.fill(0x41, 200, 400);
    expect(['corrupt', 'ok']).toContain(await codeOf(garbled));
  });

  it('una bomba zstd que declara un tamaño enorme se rechaza antes de descomprimir', async () => {
    const huge = zstdStore(new Uint8Array(10));
    new DataView(huge.buffer).setBigUint64(5, BigInt(50 * 1024 * 1024 * 1024), true);
    const zip = zipSync({ 'collection.anki21b': huge });
    expect(await codeOf(zip)).toBe('too_large');
  });

  it('una bomba zstd que no declara su tamaño se corta al pasar el tope', async () => {
    const zip = zipSync({ 'collection.anki21b': zstdBomb(8 * 1024 * 1024) });
    expect(await codeOf(zip, { ...IMPORT_LIMITS, maxDatabaseBytes: 1024 * 1024 })).toBe(
      'too_large',
    );
  });

  it('un zip que miente achicando su tamaño no revienta la memoria ni deja datos a medias', async () => {
    const zip = forgeZipSize(await buildLegacyApkg(fixture), 'collection.anki21', 100);
    expect(['corrupt', 'ok']).toContain(await codeOf(zip));
  });
});

async function run(bytes: Uint8Array, limits = IMPORT_LIMITS) {
  return parseApkg(bytes, await loadSqlForTests(), 'prueba.apkg', limits);
}
