// Fuente del texto de un caso de lectura en inglés (B13, 1.4 del plan de B13). Armar y leer la
// referencia, cada licencia, el recorte del título, el enlace https y las formas inválidas. Todo el texto
// es simulado. La lista de casos de tests/fixtures/passage-sources.json es la misma que compara el
// servidor en la prueba EN9, así la lectura de aquí y la función SQL dan lo mismo.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  LICENSE_LABELS,
  PASSAGE_LICENSES,
  PASSAGE_SOURCE_MAX_LENGTH,
  PASSAGE_SOURCE_PREFIX,
  composePassageSource,
  formatPassageSource,
  isHttpsUrl,
  isPassageSourceRef,
  licenseFromSheet,
  licenseNeedsUrl,
  parsePassageSource,
  splitPassageSource,
  type PassageLicense,
  type PassageSource,
} from './passageSource';

interface ParityCase {
  name: string;
  refs: string[];
  issue: 'passage_source_missing' | 'license_not_allowed' | null;
}
const parity = (
  JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, '../../../tests/fixtures/passage-sources.json'),
      'utf8',
    ),
  ) as { cases: ParityCase[] }
).cases;

const refs = (...titles: string[]) => titles.map((title) => ({ title }));

describe('contrato de la fuente del texto', () => {
  it('son cinco licencias con su nombre exacto, y solo el texto propio no pide enlace', () => {
    expect([...PASSAGE_LICENSES]).toEqual(['team', 'public_domain', 'cc0', 'cc_by', 'cc_by_sa']);
    expect(LICENSE_LABELS).toEqual({
      team: 'Texto propio del equipo Studiare',
      public_domain: 'Dominio público',
      cc0: 'CC0',
      cc_by: 'CC BY',
      cc_by_sa: 'CC BY-SA',
    });
    expect(PASSAGE_SOURCE_PREFIX).toBe('Fuente del texto. ');
    expect(PASSAGE_LICENSES.filter(licenseNeedsUrl)).toEqual([
      'public_domain',
      'cc0',
      'cc_by',
      'cc_by_sa',
    ]);
  });
});

describe('armar la referencia', () => {
  it('sigue la forma Fuente del texto. título. licencia. enlace', () => {
    expect(
      formatPassageSource({
        title: 'Heart Attack, MedlinePlus.gov (NLM)',
        license: 'public_domain',
        url: 'https://medlineplus.gov/heartattack.html',
      }),
    ).toBe(
      'Fuente del texto. Heart Attack, MedlinePlus.gov (NLM). Dominio público. https://medlineplus.gov/heartattack.html',
    );
    expect(formatPassageSource({ title: '', license: 'team', url: null })).toBe(
      'Fuente del texto. Texto propio del equipo Studiare.',
    );
    expect(formatPassageSource({ title: 'Caso de ejemplo', license: 'team', url: null })).toBe(
      'Fuente del texto. Caso de ejemplo. Texto propio del equipo Studiare.',
    );
  });

  it('limpia espacios y saltos de línea, y no repite el punto del título', () => {
    expect(
      formatPassageSource({
        title: '  Heart\n  Attack. ',
        license: 'cc_by',
        url: ' https://example.org/a ',
      }),
    ).toBe('Fuente del texto. Heart Attack. CC BY. https://example.org/a');
  });

  it('recorta el título para que quepa en 300 caracteres y nunca el enlace', () => {
    const url = 'https://example.org/un/camino/largo?x=1';
    const title = 'Título muy largo '.repeat(40);
    const reference = formatPassageSource({ title, license: 'cc_by_sa', url });
    expect(reference.length).toBeLessThanOrEqual(PASSAGE_SOURCE_MAX_LENGTH);
    expect(reference.endsWith(` CC BY-SA. ${url}`)).toBe(true);
    expect(reference).toContain('…. CC BY-SA.');
    const parsed = parsePassageSource(refs(reference));
    expect(parsed).toMatchObject({ ok: true, source: { license: 'cc_by_sa', url } });
  });

  it('no parte un carácter fuera del plano básico al recortar', () => {
    const reference = formatPassageSource({
      title: '🩺'.repeat(200),
      license: 'cc0',
      url: 'https://example.org/a',
    });
    expect(reference.length).toBeLessThanOrEqual(PASSAGE_SOURCE_MAX_LENGTH);
    expect(reference).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    expect(parsePassageSource(refs(reference)).ok).toBe(true);
  });

  it('si el enlace solo ya no cabe, quita el título y deja pasar el largo para que el convertidor lo rechace', () => {
    const url = `https://example.org/${'a'.repeat(290)}`;
    const reference = formatPassageSource({ title: 'Título', license: 'cc_by', url });
    expect(reference).toBe(`Fuente del texto. CC BY. ${url}`);
    expect(reference.length).toBeGreaterThan(PASSAGE_SOURCE_MAX_LENGTH);
  });

  it('compone lo que haya aunque la licencia no sea de la lista o falte, y null si no hay nada', () => {
    expect(composePassageSource({ title: '', license: '', url: '' })).toBeNull();
    expect(composePassageSource({ title: ' ', license: '.', url: ' ' })).toBeNull();
    expect(
      composePassageSource({ title: 'Texto', license: 'CC BY-NC', url: 'https://a.org/x' }),
    ).toBe('Fuente del texto. Texto. CC BY-NC. https://a.org/x');
    expect(composePassageSource({ title: 'Texto', license: '', url: '' })).toBe(
      'Fuente del texto. Texto.',
    );
    expect(composePassageSource({ title: '', license: '', url: 'https://a.org/x' })).toBe(
      'Fuente del texto. https://a.org/x',
    );
    // Lo que no empieza con http o https, o trae espacios, no es un enlace y se deja fuera
    expect(
      composePassageSource({ title: 'Texto', license: 'CC BY', url: 'example.org/texto' }),
    ).toBe('Fuente del texto. Texto. CC BY.');
    expect(
      composePassageSource({ title: 'Texto', license: 'CC BY', url: 'https://a.org/x y' }),
    ).toBe('Fuente del texto. Texto. CC BY.');
    expect(composePassageSource({ title: '', license: '', url: 'example.org' })).toBeNull();
  });
});

describe('leer la referencia', () => {
  const sources: [PassageLicense, PassageSource][] = [
    ['team', { title: '', license: 'team', url: null }],
    ['team', { title: '[Prueba] Caso', license: 'team', url: null }],
    [
      'public_domain',
      { title: '[Prueba] Texto', license: 'public_domain', url: 'https://a.org/x' },
    ],
    ['cc0', { title: '[Prueba] Texto', license: 'cc0', url: 'https://a.org/x' }],
    ['cc_by', { title: '[Prueba] Texto', license: 'cc_by', url: 'https://a.org/x' }],
    ['cc_by_sa', { title: '[Prueba] Texto', license: 'cc_by_sa', url: 'https://a.org/x' }],
  ];

  it.each(sources)('lee de vuelta la fuente con la licencia %#', (_license, source) => {
    expect(parsePassageSource(refs(formatPassageSource(source)))).toEqual({ ok: true, source });
  });

  it('da lo mismo que la función SQL sobre la lista compartida de casos', () => {
    expect(parity.length).toBeGreaterThanOrEqual(30);
    for (const item of parity) {
      const result = parsePassageSource(refs(...item.refs));
      expect(result.ok ? null : result.issue, item.name).toBe(item.issue);
    }
  });

  it('toma la primera referencia que es la fuente y se salta las demás', () => {
    const result = parsePassageSource(
      refs(
        'Guía de práctica clínica simulada',
        'Fuente del texto. [Prueba] Uno. CC BY. https://a.org/uno',
        'Fuente del texto. [Prueba] Dos. CC0. https://a.org/dos',
      ),
    );
    expect(result).toMatchObject({ ok: true, source: { title: '[Prueba] Uno', license: 'cc_by' } });
  });

  it('una referencia normal no se confunde con una fuente', () => {
    expect(isPassageSourceRef('Guía de Práctica Clínica de diabetes gestacional')).toBe(false);
    expect(isPassageSourceRef('Ver la Fuente del texto. algo')).toBe(false);
    expect(isPassageSourceRef('Fuente del texto: algo')).toBe(false);
    expect(isPassageSourceRef('Fuente del textos. algo')).toBe(false);
    expect(isPassageSourceRef('Fuente del texto.algo')).toBe(false);
    expect(isPassageSourceRef('Fuénte del texto. algo')).toBe(false);
    expect(isPassageSourceRef('Fuente del texto.')).toBe(true);
    expect(isPassageSourceRef('  fuente   del TEXTO. algo')).toBe(true);
    expect(splitPassageSource('Guía de Práctica Clínica')).toBeNull();
    expect(parsePassageSource(refs('Guía de Práctica Clínica'))).toEqual({
      ok: false,
      issue: 'passage_source_missing',
    });
  });

  it('separa lo que hay aunque la fuente esté incompleta, para que el editor lo muestre', () => {
    expect(splitPassageSource('Fuente del texto. Texto. CC BY-NC. https://a.org/x')).toEqual({
      title: 'Texto',
      licenseText: 'CC BY-NC',
      url: 'https://a.org/x',
    });
    expect(splitPassageSource('Fuente del texto. Heart Attack, MedlinePlus.gov (NLM)')).toEqual({
      title: 'Heart Attack, MedlinePlus.gov (NLM)',
      licenseText: '',
      url: '',
    });
    expect(splitPassageSource('Fuente del texto. Texto propio del equipo Studiare.')).toEqual({
      title: '',
      licenseText: 'Texto propio del equipo Studiare',
      url: '',
    });
    expect(splitPassageSource('Fuente del texto.')).toEqual({
      title: '',
      licenseText: '',
      url: '',
    });
    expect(splitPassageSource('Fuente del texto. Texto. Dominio público. http://a.org/x')).toEqual({
      title: 'Texto',
      licenseText: 'Dominio público',
      url: 'http://a.org/x',
    });
  });

  it('una licencia con la versión en la referencia no es el nombre exacto', () => {
    expect(parsePassageSource(refs('Fuente del texto. Texto. CC BY 4.0. https://a.org/x'))).toEqual(
      { ok: false, issue: 'license_not_allowed' },
    );
    expect(licenseFromSheet('CC BY 4.0')).toBe('cc_by');
  });

  it('el enlace tiene que ser https con host con punto y sin espacios', () => {
    expect(isHttpsUrl('https://medlineplus.gov/heartattack.html')).toBe(true);
    expect(isHttpsUrl('HTTPS://Example.ORG/a?b=1#c')).toBe(true);
    expect(isHttpsUrl('https://example.org:8443')).toBe(true);
    for (const bad of [
      '',
      'http://example.org/a',
      'https://',
      'https://localhost/a',
      'https://exa mple.org',
      'ftp://example.org',
      'example.org/a',
      'https://.org',
    ])
      expect(isHttpsUrl(bad), bad).toBe(false);
  });

  it('para cualquier fuente válida, leer lo armado devuelve la misma fuente', () => {
    const title = fc.string({ minLength: 1, maxLength: 120 }).filter(
      (text) =>
        text
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/[.\s]+$/, '') !== '',
    );
    const license = fc.constantFrom(...PASSAGE_LICENSES);
    const host = fc.constantFrom('example.org', 'medlineplus.gov', 'ncbi.nlm.nih.gov', 'a-b.mx');
    const path = fc.constantFrom('', '/', '/a/b', '/a?x=1&y=2', '/a#b', '/artículo.html');
    fc.assert(
      fc.property(title, license, host, path, (rawTitle, kind, hostName, tail) => {
        const source: PassageSource = {
          title: rawTitle,
          license: kind,
          url: licenseNeedsUrl(kind) ? `https://${hostName}${tail}` : null,
        };
        const reference = formatPassageSource(source);
        const parsed = parsePassageSource(refs(reference));
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.source.license).toBe(kind);
        expect(parsed.source.url).toBe(source.url);
        // El título sale limpio y, si era largo, recortado con puntos suspensivos
        expect(formatPassageSource(parsed.source)).toBe(reference);
        expect(reference.length).toBeLessThanOrEqual(PASSAGE_SOURCE_MAX_LENGTH);
      }),
      { numRuns: 300 },
    );
  });
});

describe('la licencia que escribe el médico en el Sheet', () => {
  it.each([
    ['Texto propio del equipo Studiare', 'team'],
    ['texto propio', 'team'],
    ['team', 'team'],
    ['Dominio público', 'public_domain'],
    ['dominio publico', 'public_domain'],
    ['public_domain', 'public_domain'],
    ['CC0', 'cc0'],
    ['cc 0', 'cc0'],
    ['CC0 1.0', 'cc0'],
    ['CC BY', 'cc_by'],
    ['cc-by', 'cc_by'],
    ['CC BY 4.0', 'cc_by'],
    ['cc_by', 'cc_by'],
    ['CC BY-SA', 'cc_by_sa'],
    ['CC BY-SA 3.0', 'cc_by_sa'],
    ['cc by sa', 'cc_by_sa'],
  ] as const)('%s es %s', (value, license) => {
    expect(licenseFromSheet(value)).toBe(license);
  });

  it('vacía es null y cualquier otra cosa no entra, aunque se parezca', () => {
    expect(licenseFromSheet('')).toBeNull();
    expect(licenseFromSheet('   ')).toBeNull();
    for (const value of [
      'CC BY-NC',
      'CC BY-ND',
      'CC BY-NC-SA',
      'CC BY-NC-ND',
      'cc by nc 4.0',
      'Todos los derechos reservados',
      'Licencia abierta',
      'GPL',
      'CC',
      'CC BY SA NC',
    ])
      expect(licenseFromSheet(value), value).toBe('not_allowed');
  });
});
