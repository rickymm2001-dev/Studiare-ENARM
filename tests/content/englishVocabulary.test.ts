// Mazo de vocabulario médico en inglés con los temas de salud de MedlinePlus (B13, 4.6 del plan de B13).
// Corre el script con un XML chico de muestra, tests/fixtures/medlineplus, con nombres inventados que dicen
// [Prueba] y no son contenido médico. Revisa que los ids sean estables, que cada nota tenga su par en
// español, que no haya HTML ajeno, que cada nota lleve su fuente, que se descarte lo que no tiene par, que
// el mazo cumpla DemoDeckFileSchema y que el .apkg lo lea el importador de la app y lo parta por grupo el
// catálogo del admin. Sin red. El archivo real se baja a mano de medlineplus.gov
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { zipSync } from 'fflate';
import { JSDOM } from 'jsdom';
import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';
import { createCardSanitizer } from '@/data/content/cardHtml';
import { packDeck } from '@/data/content/deckPack';
import { proposeDeckTopic } from '@/data/content/deckTopicMap';
import { parseApkg } from '@/data/import/apkg';
import { loadSqlForTests } from '@/data/import/testing/fixtures';
import { DemoDeckFileSchema } from '@/data/schemas/content';
import { topicTaxonomy } from '@/demo/content';
import {
  VOCABULARY_DECK,
  VocabularyError,
  backOf,
  buildApkg,
  buildDeckFile,
  buildVocabulary,
  frontOf,
  main,
  noteKeyOf,
  parseTopicsXml,
  plainText,
  sourceTagOf,
  type MplusTopic,
} from '../../scripts/content/english-vocabulary.ts';

const FIXTURE = resolve(import.meta.dirname, '../fixtures/medlineplus/temas-muestra.xml');
const xml = readFileSync(FIXTURE, 'utf8');
const topics = parseTopicsXml(xml);
const { notes, report } = buildVocabulary(topics);
const byId = (id: string) => notes.find((note) => note.id === id);

describe('leer el XML de temas de salud', () => {
  it('lee cada tema con su idioma, sus nombres, sus grupos y su par en el otro idioma', () => {
    expect(topics).toHaveLength(12);
    expect(topics.filter((topic) => topic.language === 'Spanish')).toHaveLength(3);
    const alpha = topics.find((topic) => topic.id === '9001');
    expect(alpha).toMatchObject({
      language: 'English',
      title: '[Prueba] Alpha Topic',
      url: 'https://medlineplus.gov/prueba-alpha.html',
      alsoCalled: ['[Prueba] Alias A1', '[Prueba] Alias & A2'],
      mapped: [{ id: '9101', language: 'Spanish', title: '[Prueba] Tema Alfa' }],
    });
    expect(alpha?.groups.map((group) => [group.id, group.slug, group.name])).toEqual([
      ['901', 'pruebagroupone', '[Prueba] Group One'],
      ['902', 'pruebagrouptwo', '[Prueba] Group Two'],
    ]);
  });

  it('decodifica las entidades, junta los espacios y quita las etiquetas del texto', () => {
    expect(topics.find((topic) => topic.id === '9002')?.title).toBe('[Prueba] Beta & Gamma');
    expect(topics.find((topic) => topic.id === '9005')?.title).toBe('[Prueba] Zeta Topic');
    // Un nombre con etiquetas escapadas y una entidad doble queda en texto plano
    expect(topics.find((topic) => topic.id === '9008')?.alsoCalled).toEqual([
      '[Prueba] Alias E & F',
      '[Prueba] Alias A1',
    ]);
    expect(plainText('A &amp;amp; B &#39;c&#39; &#x27;d&#x27;<br/>e')).toBe("A & B 'c' 'd' e");
    expect(plainText('  <b>Hola</b>\n  mundo  ')).toBe('Hola mundo');
  });

  it('un archivo que no es XML o que no trae temas dice qué pasó', () => {
    expect(() => parseTopicsXml('esto no es xml <')).toThrow(VocabularyError);
    expect(() => parseTopicsXml('<health-topics total="0"></health-topics>')).toThrow(
      /no trae temas de salud/,
    );
    try {
      parseTopicsXml('<otra-cosa/>');
      throw new Error('Debió fallar');
    } catch (error) {
      expect((error as VocabularyError).code).toBe('no_topics');
    }
  });
});

describe('notas del vocabulario', () => {
  it('cada nota trae su nombre en inglés y su par en español, y se descarta lo que no', () => {
    expect(report).toMatchObject({
      englishTopics: 7,
      notes: 6,
      withoutSpanishPair: 1,
      duplicates: 1,
      emptyTitles: 1,
      noGroup: 1,
      sameInBothLanguages: 1,
    });
    expect(notes.map((note) => note.id).sort()).toEqual([
      '9001',
      '9002',
      '9004',
      '9005',
      '9008',
      '9009',
    ]);
    for (const note of notes) {
      expect(note.english).not.toBe('');
      expect(note.spanish).not.toBe('');
    }
    // Sin par en español, repetido y sin título no entran
    expect(byId('9003')).toBeUndefined();
    expect(byId('9007')).toBeUndefined();
    expect(notes.filter((note) => note.id === '9001')).toHaveLength(1);
    expect(byId('9001')?.spanish).toBe('[Prueba] Tema Alfa');
  });

  it('el par sale del tema en español, de su declaración o del tema en español que apunta al de inglés', () => {
    // 9001 con el tema en español 9101. 9004 solo con la declaración. 9008 solo porque el de español apunta a él
    expect(byId('9001')?.otherSpanish).toEqual([
      '[Prueba] Alias A en español',
      '[Prueba] Otro nombre A',
    ]);
    expect(byId('9004')).toMatchObject({ spanish: '[Prueba] Tema Épsilon', otherSpanish: [] });
    expect(byId('9008')).toMatchObject({
      spanish: '[Prueba] Tema Eta',
      otherSpanish: ['[Prueba] Nombre eta'],
      otherEnglish: ['[Prueba] Alias E & F', '[Prueba] Alias A1'],
    });
  });

  it('el submazo es el primer grupo en español, y sin nombre en español queda el de inglés y se avisa', () => {
    expect(byId('9001')?.group).toBe('[Prueba] Grupo Uno');
    expect(byId('9002')?.group).toBe('[Prueba] Grupo Uno');
    expect(byId('9008')?.group).toBe('[Prueba] Grupo Dos');
    expect(byId('9004')?.group).toBe(VOCABULARY_DECK.noGroup);
    expect(byId('9005')?.group).toBe('[Prueba] Group Three');
    expect(report.groupsWithoutSpanishName).toEqual(['[Prueba] Group Three']);
    expect(report.groups).toBe(4);
  });

  it('los ids son estables, mplus más el id del tema, y no dependen del orden del archivo ni de otros temas', () => {
    expect(noteKeyOf({ id: '9001' })).toBe('mplus-9001');
    const keys = buildDeckFile(notes).notes.map((note) => note.key);
    expect(keys).toEqual(expect.arrayContaining(['mplus-9001', 'mplus-9002', 'mplus-9009']));
    expect(new Set(keys).size).toBe(keys.length);
    // El mismo archivo en otro orden da las mismas notas, en el mismo orden. Si un id viniera repetido,
    // gana el primero del archivo, así que el repetido de la muestra se quita para esta comparación
    const unique = topics.filter((topic) => topic.title !== '[Prueba] Alpha Repetido');
    expect(buildVocabulary([...unique].reverse()).notes).toEqual(buildVocabulary(unique).notes);
    expect(buildVocabulary(unique).notes).toEqual(notes);
    // Un tema nuevo no cambia el id ni el contenido de los demás
    const extra: MplusTopic = {
      id: '9900',
      language: 'English',
      title: '[Prueba] Nuevo',
      url: '',
      alsoCalled: [],
      groups: [],
      mapped: [{ id: '9990', language: 'Spanish', title: '[Prueba] Nuevo en español' }],
    };
    const grown = buildVocabulary([...topics, extra]).notes;
    expect(grown).toHaveLength(notes.length + 1);
    expect(grown.filter((note) => note.id !== '9900')).toEqual(notes);
    // Y el script dos veces da lo mismo
    expect(JSON.stringify(buildVocabulary(topics).notes)).toBe(JSON.stringify(notes));
  });

  it('sin los temas en español, el par sale de la declaración y los grupos quedan en inglés', () => {
    const englishOnly = topics.filter((topic) => topic.language !== 'Spanish');
    const result = buildVocabulary(englishOnly);
    expect(result.notes.map((note) => note.id).sort()).toEqual([
      '9001',
      '9002',
      '9004',
      '9005',
      '9009',
    ]);
    expect(result.notes.find((note) => note.id === '9001')).toMatchObject({
      spanish: '[Prueba] Tema Alfa',
      group: '[Prueba] Group One',
      otherSpanish: [],
    });
    expect(result.report.groupsWithoutSpanishName).toEqual([
      '[Prueba] Group One',
      '[Prueba] Group Three',
      '[Prueba] Group Two',
    ]);
  });
});

describe('las tarjetas', () => {
  it('al frente va el nombre en inglés con lang en, y atrás el español, los otros nombres y la fuente', () => {
    const note = byId('9001');
    if (!note) throw new Error('Falta la nota');
    expect(frontOf(note)).toBe('<span lang="en">[Prueba] Alpha Topic</span>');
    expect(backOf(note)).toBe(
      '<b>[Prueba] Tema Alfa</b>' +
        '<br><i>En español también</i> [Prueba] Alias A en español; [Prueba] Otro nombre A' +
        '<br><i>En inglés también</i> <span lang="en">[Prueba] Alias A1; [Prueba] Alias &amp; A2</span>' +
        '<br><i>Fuente MedlinePlus.gov (NLM)</i>',
    );
    // Sin otros nombres solo lleva el español y la fuente
    expect(backOf(byId('9009') ?? note)).toBe(
      '<b>[Prueba] Theta</b><br><i>Fuente MedlinePlus.gov (NLM)</i>',
    );
  });

  it('cada nota lleva la fuente, solo va de inglés a español y no trae HTML ajeno', () => {
    const sanitizer = createCardSanitizer(new JSDOM('').window);
    const keepNothing = () => null;
    for (const note of notes) {
      const front = frontOf(note);
      const back = backOf(note);
      expect(back).toContain('Fuente MedlinePlus.gov (NLM)');
      expect(front).toMatch(/^<span lang="en">/);
      // Lo que escribe el script es exactamente lo que deja pasar el saneador de las tarjetas
      expect(sanitizer.sanitize(front, keepNothing)).toBe(front);
      expect(sanitizer.sanitize(back, keepNothing)).toBe(back);
      for (const text of [
        note.english,
        note.spanish,
        note.group,
        ...note.otherEnglish,
        ...note.otherSpanish,
      ])
        expect(text, text).not.toMatch(/[<>]/);
    }
    // Un nombre con símbolos de HTML sale escapado
    const tricky = {
      ...notes[0],
      english: 'A <b> & B',
      otherEnglish: ['<i>x</i>'],
    } as (typeof notes)[number];
    expect(frontOf(tricky)).toBe('<span lang="en">A &lt;b&gt; &amp; B</span>');
    expect(backOf(tricky)).toContain('&lt;i&gt;x&lt;/i&gt;');
  });
});

describe('el mazo de la demo', () => {
  const deck = buildDeckFile(notes);

  it('cumple DemoDeckFileSchema, es de inglés médico y queda pendiente de revisión médica', () => {
    const parsed = DemoDeckFileSchema.parse(deck);
    expect(parsed).toMatchObject({
      key: 'vocabulario-ingles',
      status: 'pending_physician_review',
      author: 'MedlinePlus.gov (NLM)',
      media: [],
    });
    expect(parsed.description).toContain('dominio público');
    expect(parsed.description).toContain('Pendiente de revisión médica');
    expect(parsed.notes).toHaveLength(6);
    for (const note of parsed.notes) {
      expect(note).toMatchObject({
        kind: 'basic',
        branch: 'medical_english',
        topic: 'medical_vocabulary',
      });
      expect(note.key).toMatch(/^mplus-\d+$/);
    }
  });

  it('la ruta de la etiqueta forma el submazo y el tema va en la segunda etiqueta', () => {
    const alpha = deck.notes.find((note) => note.key === 'mplus-9001');
    expect(alpha).toMatchObject({
      sourceTag: 'Inglés_médico::[Prueba]_Grupo_Uno',
      tags: ['Inglés_médico::[Prueba]_Grupo_Uno', 'topic:medical_vocabulary'],
    });
    expect(sourceTagOf({ group: '[Prueba] Grupo Uno' })).toBe('Inglés_médico::[Prueba]_Grupo_Uno');
    // Un grupo larguísimo no pasa del tope de la etiqueta
    expect(sourceTagOf({ group: 'x'.repeat(400) }).length).toBeLessThanOrEqual(200);
    for (const note of deck.notes) expect(note.tags.every((tag) => tag.length <= 80)).toBe(true);
  });

  it('las notas salen en un orden fijo, por grupo y por nombre', () => {
    expect(deck.notes.map((note) => note.key)).toEqual([
      'mplus-9005',
      'mplus-9008',
      'mplus-9009',
      'mplus-9001',
      'mplus-9002',
      'mplus-9004',
    ]);
  });
});

describe('el paquete .apkg', () => {
  it('lo lee el importador de la app, con una nota por tema y su ruta de etiqueta', async () => {
    const sql = await loadSqlForTests();
    const bytes = buildApkg(notes, sql);
    const parsed = parseApkg(bytes, sql, 'Vocabulario-ingles.apkg');
    expect(parsed.format).toBe('apkg_legacy');
    expect(parsed.notes).toHaveLength(6);
    expect(parsed.errors).toEqual([]);
    const alpha = parsed.notes.find((note) => note.guid === 'mplus-9001');
    expect(alpha).toMatchObject({
      kind: 'basic',
      front: '<span lang="en">[Prueba] Alpha Topic</span>',
      tags: ['Inglés_médico::[Prueba]_Grupo_Uno', 'topic:medical_vocabulary'],
      deckPath: ['Inglés médico', '[Prueba] Grupo Uno'],
    });
    expect(alpha?.back).toContain('Fuente MedlinePlus.gov (NLM)');
    expect(parsed.warnings.map((warning) => warning.code)).not.toContain('media_skipped');
  });

  it('es el mismo paquete cada vez', async () => {
    const sql = await loadSqlForTests();
    expect(buildApkg(notes, sql)).toEqual(buildApkg(notes, sql));
  });

  it('el catálogo del admin lo parte por grupo, con el tema de vocabulario propuesto y el inglés a la vista', async () => {
    const sql = await loadSqlForTests();
    const parsed = parseApkg(buildApkg(notes, sql), sql, 'Vocabulario-ingles.apkg');
    const sanitizer = createCardSanitizer(new JSDOM('').window);
    const packed = await packDeck(
      parsed.notes,
      { deckKey: VOCABULARY_DECK.key, deckVersion: 1, author: VOCABULARY_DECK.author },
      {
        sanitize: (html, resolveMedia) => sanitizer.sanitize(html, resolveMedia),
        media: () => null,
        zip: (files) => zipSync(files, { level: 0 }),
        propose: (segments) => proposeDeckTopic(segments, topicTaxonomy),
      },
    );
    expect(packed.skipped).toBe(0);
    expect(packed.subjects.map((subject) => subject.name).sort()).toEqual(
      ['Otros temas', '[Prueba] Group Three', '[Prueba] Grupo Dos', '[Prueba] Grupo Uno'].sort(),
    );
    for (const subject of packed.subjects) {
      expect(subject.branch).toBe('medical_english');
      expect(subject.topic).toBe('medical_vocabulary');
    }
    const all = packed.subjects.flatMap((subject) => subject.notes);
    expect(all).toHaveLength(6);
    for (const note of all) {
      if (note.kind !== 'basic') throw new Error('Debió ser básica');
      // El idioma de la tarjeta sobrevive al saneador del catálogo
      expect(note.front).toMatch(/^<span lang="en">/);
      expect(note.back).toContain('Fuente MedlinePlus.gov (NLM)');
      expect(note.key).toMatch(/^vocabulario-ingles-[0-9a-f]{12}$/);
    }
  });
});

describe('la línea de comandos', () => {
  it('sin el archivo se detiene limpio y dice cómo bajarlo a mano', async () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => void lines.push(args.join(' '));
    try {
      expect(await main([])).toBe(2);
      expect(await main(['no-existe-este-archivo.xml'])).toBe(2);
    } finally {
      console.log = original;
    }
    const output = lines.join('\n');
    expect(output).toContain('https://medlineplus.gov/xml.html');
    expect(output).toContain('esta sesión no abre medlineplus.gov');
    expect(output).toContain('No existe no-existe-este-archivo.xml');
  });

  it('con un archivo que no sirve lo dice y no escribe nada', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ingles-'));
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void errors.push(args.join(' '));
    try {
      const broken = join(dir, 'roto.xml');
      writeFileSync(broken, 'esto no es xml <');
      expect(
        await main([broken, '--json', join(dir, 'a.json'), '--apkg', join(dir, 'a.apkg')]),
      ).toBe(1);
      const empty = join(dir, 'vacio.xml');
      writeFileSync(empty, '<health-topics total="0"></health-topics>');
      expect(
        await main([empty, '--json', join(dir, 'a.json'), '--apkg', join(dir, 'a.apkg')]),
      ).toBe(1);
      // Un archivo solo con temas sin par en español tampoco saca ninguna nota
      const orphan = join(dir, 'huerfano.xml');
      writeFileSync(
        orphan,
        '<health-topics><health-topic id="1" title="[Prueba] Solo" language="English" url="https://x.org/a.html"/></health-topics>',
      );
      expect(
        await main([orphan, '--json', join(dir, 'a.json'), '--apkg', join(dir, 'a.apkg')]),
      ).toBe(1);
    } finally {
      console.error = original;
    }
    expect(errors.join('\n')).toContain('no es un XML válido');
    expect(errors.join('\n')).toContain('no trae temas de salud');
    expect(errors.join('\n')).toContain('Ningún tema en inglés trae su par en español');
    expect(existsSync(join(dir, 'a.json'))).toBe(false);
    expect(existsSync(join(dir, 'a.apkg'))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('con el archivo bueno escribe el mazo de la demo y el paquete, y cuenta lo que hizo', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ingles-'));
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => void lines.push(args.join(' '));
    try {
      expect(
        await main([FIXTURE, '--json', join(dir, 'mazo.json'), '--apkg', join(dir, 'mazo.apkg')]),
      ).toBe(0);
      expect(await main([FIXTURE, '--sin-json', '--sin-apkg'])).toBe(0);
      expect(await main(['--ayuda'])).toBe(0);
    } finally {
      console.log = original;
    }
    const text = readFileSync(join(dir, 'mazo.json'), 'utf8');
    // Sale con el formato del repo, así pasa npm run format:check sin tocarlo
    const config =
      (await prettier.resolveConfig(resolve(import.meta.dirname, '../../package.json'))) ?? {};
    expect(
      await prettier.check(text, { ...config, filepath: 'src/demo/content/decks/x.json' }),
    ).toBe(true);
    const deck = DemoDeckFileSchema.parse(JSON.parse(text));
    expect(deck.notes).toHaveLength(6);
    const sql = await loadSqlForTests();
    expect(parseApkg(readFileSync(join(dir, 'mazo.apkg')), sql, 'mazo.apkg').notes).toHaveLength(6);
    const output = lines.join('\n');
    expect(output).toContain('Temas en inglés 7. Notas 6 en 4 grupos.');
    expect(output).toContain('Sin par en español 1. Repetidos 1. Sin título 1. Sin grupo 1.');
    expect(output).toContain('Grupos que quedaron en inglés');
    expect(output).toContain('No lo subas al repo');
    rmSync(dir, { recursive: true, force: true });
  });
});
