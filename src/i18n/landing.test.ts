// El texto de la portada y las reglas del texto ajeno (B17, 5.2 y 5.3 del plan de B17). Revisa que cada
// lugar entre en su largo, que ningún texto lleve HTML, enlaces fuera de lista ni promesas que CLAUDE.md
// prohíbe (puntaje esperado, plaza asegurada, garantía de aprobar, 100%, el mejor, el único) y que el
// documento que se le da a la agencia traiga la tabla completa de lugares. Con los bloques del creador y de
// testimonios vacíos la portada no cambia. Esta es la prueba que protege el texto que llegue de fuera.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND } from '@/config/brand';
import {
  ALLOWED_LINK_HOSTS,
  BACKED_CLAIMS,
  blockProblems,
  LANDING_COUNTS,
  landingProblems,
  landingSlots,
  PHOTO_FILE,
  SLOT_FAMILIES,
  slotId,
  textProblems,
  validPermissionDate,
  type BackedClaim,
  type LandingContent,
} from '@/features/landing/slots';
import { t } from './es-MX';
import { landingText, type LandingCreator, type LandingTestimonial } from './landing';

const ROOT = join(import.meta.dirname, '..', '..');
const PHOTO_DIR = join(ROOT, 'public', 'landing');
const PORTADA = readFileSync(join(ROOT, 'docs', 'PORTADA.md'), 'utf8');

const creator: LandingCreator = {
  name: 'Dra. Persona de Prueba',
  role: 'Médica general y creadora de contenido de prueba',
  quote: 'Texto de prueba de la cita del creador, sin ningún dato real.',
  photo: { file: 'creador.webp', alt: 'Retrato de prueba' },
};
const testimonial: LandingTestimonial = {
  quote: 'Texto de prueba de un testimonio, sin ninguna persona real.',
  who: 'Persona de prueba, residente de prueba',
  permissionOn: '2026-10-01',
};

/** El texto real de la portada con lo que se le quiera cambiar, para probar cada regla */
const withText = (changes: Partial<LandingContent>): LandingContent => ({
  ...landingText,
  ...changes,
});

describe('texto de la portada, forma y lugares', () => {
  it('sigue en t.landing con la misma forma de antes', () => {
    expect(t.landing).toBe(landingText);
    expect(Object.keys(landingText.features)).toEqual([
      'technique',
      'fsrs',
      'biases',
      'game',
      'decks',
      'physicians',
    ]);
    expect(landingText.personas).toHaveLength(LANDING_COUNTS.personas);
    expect(landingText.method).toHaveLength(LANDING_COUNTS.method);
    for (const phrase of landingText.methodHighlights) {
      expect(landingText.methodIntro).toContain(phrase);
    }
    expect(landingText.faq.length).toBeGreaterThanOrEqual(LANDING_COUNTS.faqMin);
  });

  it('cada lugar tiene un id único y entra en su largo máximo', () => {
    const slots = landingSlots(landingText);
    expect(new Set(slots.map((slot) => slot.id)).size).toBe(slots.length);
    const over = slots
      .filter((slot) => Array.from(slot.value).length > slot.max)
      .map((slot) => `${slot.id} (${slot.max})`);
    expect(over).toEqual([]);
  });

  it('los lugares son los de la tabla de 5.2, con sus largos', () => {
    const limits = Object.fromEntries(SLOT_FAMILIES.map((family) => [family.id, family.max]));
    expect(limits).toEqual({
      'hero.badge': 60,
      'hero.title': 70,
      'hero.subtitle': 220,
      'hero.cta': 30,
      'hero.trust': 80,
      'hero.tagline': 60,
      'features.intro': 220,
      'features.N.title': 40,
      'features.N.text': 180,
      'method.intro': 260,
      'method.N.title': 50,
      'method.N.text': 240,
      'personas.N.who': 40,
      'personas.N.text': 140,
      'creator.name': 60,
      'creator.role': 80,
      'creator.quote': 240,
      'creator.photoAlt': 120,
      'testimonials.N.quote': 240,
      'testimonials.N.who': 60,
      'faq.N.question': 90,
      'faq.N.answer': 300,
      'final.title': 70,
      'meta.title': 60,
      'meta.description': 160,
    });
    expect(slotId('features.N.title', 3)).toBe('features.3.title');
    expect(slotId('hero.title')).toBe('hero.title');
    // Con los dos bloques vacíos no hay lugares del creador ni de testimonios
    const ids = landingSlots(withText({ creator: null, testimonials: [] })).map((slot) => slot.id);
    expect(ids.filter((id) => /^(?:creator|testimonials)\./.test(id))).toEqual([]);
    expect(ids).toContain('features.6.text');
    expect(ids).toContain('method.6.text');
    expect(ids).toContain('hero.tagline');
    expect(ids).toContain('personas.6.who');
    expect(ids).toContain('meta.description');
  });

  it('el título y la descripción de la marca entran en sus largos y en las reglas', () => {
    expect(Array.from(BRAND.name).length).toBeLessThanOrEqual(60);
    expect(Array.from(BRAND.description).length).toBeLessThanOrEqual(160);
    expect(textProblems('meta.description', BRAND.description, 160)).toEqual([]);
  });
});

describe('el texto que está publicado cumple las reglas', () => {
  it('ningún texto de la portada lleva problemas', () => {
    expect(landingProblems(landingText)).toEqual([]);
  });

  it('los bloques publicados no son de prueba y su foto existe con su texto alternativo', () => {
    expect(blockProblems(landingText.creator, landingText.testimonials)).toEqual([]);
    const photo = landingText.creator?.photo ?? null;
    const files = existsSync(PHOTO_DIR) ? readdirSync(PHOTO_DIR) : [];
    if (photo) {
      expect(files, 'la foto declarada no está en public/landing').toContain(photo.file);
      expect(photo.alt.trim()).not.toBe('');
      // Una foto de rostro de 800 px en webp pesa muy por debajo de esto
      expect(statSync(join(PHOTO_DIR, photo.file)).size).toBeLessThan(250_000);
    }
    // Un archivo en public/landing que ningún texto declara no se muestra nunca, y eso confunde. La foto
    // del héroe, portada.webp, la muestra la portada sola (D-149) y pesa poco
    const HERO_PHOTO = 'portada.webp';
    const loose = files.filter(
      (file) => file !== photo?.file && file !== HERO_PHOTO && file !== '.gitkeep',
    );
    expect(loose, 'archivos de public/landing sin declarar en creator.photo').toEqual([]);
    if (files.includes(HERO_PHOTO)) {
      expect(statSync(join(PHOTO_DIR, HERO_PHOTO)).size).toBeLessThan(300_000);
    }
    const marked = JSON.stringify([landingText.creator, landingText.testimonials]);
    expect(marked).not.toMatch(/prueba/i);
  });
});

describe('reglas del texto ajeno (5.3)', () => {
  const rejects: [string, string, string][] = [
    ['HTML', 'Prepara el <b>ENARM</b>', 'HTML'],
    ['una entidad', 'Repasa &amp; practica', 'HTML'],
    ['una marca de plantilla', 'Hola ${nombre}', 'HTML'],
    ['un valor sin llenar', 'Tu avance es undefined', 'sin llenar'],
    ['un enlace con esquema', 'Entra a https://ejemplo.com/oferta hoy', 'enlace a ejemplo.com'],
    ['un enlace con www', 'Visita www.ejemplo.mx para más', 'enlace a ejemplo.mx'],
    ['un dominio suelto', 'Escríbenos en ejemplo.mx', 'enlace a ejemplo.mx'],
    ['un correo', 'Escribe a contacto@ejemplo.com', 'enlace a ejemplo.com'],
    ['un enlace de WhatsApp', 'Pide informes en whatsapp:5215555555555', 'enlace a'],
    ['una cuenta con arroba', 'Sígueme en @drejemplo', 'menciona una cuenta'],
    ['signos de exclamación', 'Empieza hoy mismo!', 'exclamación'],
    ['signos de exclamación de apertura', '¡Empieza hoy mismo', 'exclamación'],
    ['dos puntos', 'Lo que incluye: todo', 'dos puntos'],
    ['trato de usted', 'Usted puede repasar cuando quiera', 'tú'],
    ['espacios de más', 'Repasa  mejor', 'espacios'],
    ['un salto de línea', 'Repasa\nmejor', 'espacios'],
    ['un texto vacío', '   ', 'vacío'],
    ['el puntaje esperado', 'Conoce tu puntaje esperado en el ENARM', 'puntaje'],
    ['predecir el puntaje', 'Te predecimos tu puntaje antes del examen', 'puntaje'],
    ['saber qué puntaje sacarás', 'Sabrás qué puntaje vas a sacar', 'puntaje'],
    ['una plaza asegurada', 'Tu plaza asegurada empieza aquí', 'plaza asegurada'],
    ['asegurar la plaza', 'Te aseguramos tu plaza', 'plaza asegurada'],
    ['una garantía de aprobar', 'Garantía de aprobar el ENARM', 'garantía de aprobar'],
    ['aprobar seguro', 'Aprueba el ENARM seguro', 'garantía de aprobar'],
    ['aprobarás', 'Aprobarás el ENARM a la primera', 'garantía de aprobar'],
    ['un 100%', 'Efectividad de 100%', '100%'],
    ['cien por ciento', 'Cien por ciento confiable', '100%'],
    ['el mejor', 'El mejor banco de preguntas', 'superlativo'],
    ['la mejor', 'Estudia con la mejor plataforma', 'superlativo'],
    ['el único', 'El único con FSRS en México', 'superlativo'],
    ['la única', 'La única que mide tu técnica', 'superlativo'],
    ['número uno', 'Somos el número 1 en preparación', 'superlativo'],
    ['un comparativo de precisión', 'FSRS, el algoritmo de repaso más preciso', 'comparativo'],
    ['un comparativo de rapidez', 'Aprendes más rápido que con otros', 'comparativo'],
    ['una cifra con porcentaje', 'El 87% de quienes la usan sube su nivel', 'cifra'],
    ['una cifra de personas', 'Más de 2,000 médicos ya estudian aquí', 'cifra'],
    ['miles de personas', 'Miles de residentes confían en nosotros', 'cifra'],
    // Variantes de las mismas promesas que la primera versión de las reglas dejaba pasar (revisión de B17)
    ['vas a pasar', 'Vas a pasar el ENARM con nosotros', 'garantía de aprobar'],
    ['vas a aprobar', 'Con Studiare vas a aprobar', 'garantía de aprobar'],
    ['aprobarás tu examen', 'Aprobarás tu examen con nosotros', 'garantía de aprobar'],
    ['pasarás el examen', 'Pasarás el examen sin problema', 'garantía de aprobar'],
    ['aprobarás a secas', 'Aprobarás con más confianza si estudias bien', 'garantía de aprobar'],
    ['saldrás con plaza', 'Saldrás con plaza', 'plaza asegurada'],
    ['tendrás tu plaza', 'Tendrás tu plaza de residencia', 'plaza asegurada'],
    ['la plaza está asegurada', 'Tu plaza está asegurada', 'plaza asegurada'],
    ['una negación de otra cosa', 'No pierdas tiempo y aprobarás el ENARM', 'garantía de aprobar'],
    [
      'una negación que no toca la promesa',
      'No dudes que aprobarás el ENARM',
      'garantía de aprobar',
    ],
    ['diez mil con número', 'Más de 10 mil alumnos estudian aquí', 'cifra'],
    ['diez mil con letra', 'Más de diez mil médicos nos usan', 'cifra'],
    ['un millar con punto', 'Somos 10.000 en la comunidad', 'cifra'],
    ['por ciento', 'El 90 por ciento aprueba', 'cifra'],
    ['una cantidad con letra', 'Cien médicos ya estudian aquí', 'cifra'],
    ['la plataforma más usada', 'Es la plataforma más usada del país', 'comparativo'],
    ['un superlativo de México', 'El banco más grande de México', 'comparativo'],
  ];

  it.each(rejects)('rechaza %s', (_name, text, expected) => {
    const problems = textProblems('hero.subtitle', text, 220);
    expect(problems.length, text).toBeGreaterThan(0);
    expect(problems.join(' | ').toLowerCase(), text).toContain(expected.toLowerCase());
    // Cada problema dice a qué lugar pertenece
    for (const problem of problems) expect(problem.startsWith('hero.subtitle ')).toBe(true);
  });

  const accepts = [
    'Prepara el ENARM entendiendo cómo respondes',
    'Nadie puede predecir tu puntaje del ENARM con honestidad.',
    'No te prometemos un puntaje esperado, te mostramos tu avance.',
    'Nunca te vamos a garantizar una plaza, porque nadie puede.',
    'Sesiones de 5 minutos que funcionan sin conexión.',
    'FSRS, un algoritmo moderno de repaso espaciado, decide qué repasar y cuándo.',
    'El contenido médico generado por IA queda como borrador marcado hasta que un médico lo aprueba.',
    'XP, niveles de R0 a Eminencia, rachas y retos de grupo.',
    'Mejor precio',
    '¿Me garantizan la plaza?',
    'Tu residencia empieza con el siguiente repaso',
    'Sí. Y si quieres, la instalas como app desde el navegador.',
    // La tercera persona de aprobar es del flujo editorial, donde un médico aprueba el contenido
    'Un médico aprobará cada tarjeta antes de que salga del borrador.',
    // Las respuestas honestas que niegan la promesa siguen entrando, con la negación cerca de lo que niegan
    'Nadie puede garantizar que aprobarás el ENARM.',
    'Ninguna plataforma puede garantizar que aprobarás el ENARM.',
    'No te prometemos que vas a pasar el ENARM, te damos mejores herramientas.',
    'Nadie en el mundo puede predecir tu puntaje del ENARM.',
    'No hay garantía de aprobar y no la ofrecemos.',
    'Nunca vamos a decirte que tu plaza está asegurada.',
    'Studiare no predice tu puntaje ni te asegura una plaza.',
    'Entre una sesión y otra pasarás muy poco tiempo en la app.',
  ];
  it.each(accepts)('acepta %s', (text) => {
    expect(textProblems('hero.subtitle', text, 220)).toEqual([]);
  });

  it('la negación no salva una promesa que viene después de una coma', () => {
    const problems = textProblems('hero.subtitle', 'No lo dudes, te aseguramos tu plaza');
    expect(problems.join(' ')).toContain('plaza asegurada');
  });

  it('la negación solo cubre la promesa que tiene cerca y en la misma idea', () => {
    // Un no que niega otra cosa, o que queda detrás de una conjunción, no salva la promesa
    for (const text of [
      'No pierdas tiempo y aprobarás el ENARM',
      'No lo pienses más, aprobarás tu examen',
      'No tienes que preocuparte porque aprobarás el ENARM',
      'No estudies solo, y vas a pasar el ENARM',
    ]) {
      expect(textProblems('hero.subtitle', text).join(' '), text).toContain('garantía de aprobar');
    }
    // La palabra ni dentro de otra, como en niño o año, no es una negación
    expect(
      textProblems('hero.subtitle', 'Un niño sabe que aprobarás el ENARM').join(' '),
    ).toContain('garantía de aprobar');
    expect(textProblems('hero.subtitle', 'Este año aprobarás el ENARM').join(' ')).toContain(
      'garantía de aprobar',
    );
  });

  describe('Unicode', () => {
    const invisibles = [
      ['un espacio de ancho cero', 'Somos el\u200B mejor curso'],
      ['un guion suave', 'Te ga\u00ADrantizamos aprobar el ENARM'],
      ['una inversión de dirección', 'Texto \u202Eevil\u202C'],
      ['una unión de ancho cero', 'Estudia\u200D mejor'],
      ['una marca de orden de bytes', '\uFEFFPrepara el ENARM'],
      ['un carácter de control', 'Prepara\u0007 el ENARM'],
    ] as const;

    it.each(invisibles)('rechaza %s', (_name, text) => {
      expect(textProblems('hero.subtitle', text).join(' | '), text).toContain(
        'caracteres invisibles',
      );
    });

    it('lee el texto sin los caracteres invisibles, así que no esconden una regla', () => {
      expect(textProblems('hero.subtitle', 'Somos el\u200B mejor curso').join(' ')).toContain(
        'superlativo',
      );
      expect(
        textProblems('hero.subtitle', 'Te ga\u00ADrantizamos aprobar el ENARM').join(' '),
      ).toContain('garantía de aprobar');
      expect(
        textProblems('hero.subtitle', 'Escribe a contacto@eje\u200Bmplo.com').join(' '),
      ).toContain('enlace a ejemplo.com');
    });

    it('lee el texto en forma NFKC, así que el ancho completo y las ligaduras no esconden una regla', () => {
      // Un dominio escrito con letras y puntos de ancho completo
      expect(textProblems('hero.subtitle', 'Entra a ｗｗｗ．evil．com').join(' ')).toContain(
        'enlace a evil.com',
      );
      // Una ligadura dentro de la palabra
      expect(textProblems('hero.subtitle', 'Es más e\uFB01caz que otros').join(' ')).toContain(
        'comparativo',
      );
      // Los signos de ancho completo valen igual que los normales
      expect(textProblems('hero.subtitle', 'Empieza hoy\uFF01').join(' ')).toContain('exclamación');
      expect(textProblems('hero.subtitle', 'Incluye\uFF1A todo').join(' ')).toContain('dos puntos');
      expect(textProblems('hero.subtitle', 'Prepara el \uFF1Cb\uFF1E').join(' ')).toContain('HTML');
    });

    it('el texto normal con acentos, eñes y signos de apertura sigue pasando', () => {
      expect(
        textProblems(
          'hero.subtitle',
          '¿Cómo se repasa mejor? Con sesiones cortas, sin ñoñerías.',
          220,
        ),
      ).toEqual([]);
    });
  });

  it('cuenta los caracteres de verdad, no las unidades UTF-16', () => {
    expect(textProblems('hero.cta', 'a'.repeat(30), 30)).toEqual([]);
    expect(textProblems('hero.cta', 'a'.repeat(31), 30).join(' ')).toContain(
      'pasa de 30 caracteres (tiene 31)',
    );
    // Una letra con acento escrita con marca combinada no es lo mismo que una precompuesta (NFC)
    expect(textProblems('hero.cta', 'café', 30).join(' ')).toContain('NFC');
    // Los emoji cuentan como un carácter y no dos
    expect(textProblems('hero.cta', '😀'.repeat(30), 30)).toEqual([]);
  });

  it('la lista de sitios permitidos y la de afirmaciones con respaldo empiezan vacías', () => {
    expect(ALLOWED_LINK_HOSTS).toEqual([]);
    expect(BACKED_CLAIMS).toEqual([]);
  });

  it('un enlace solo pasa si su sitio está en la lista, también un subdominio', () => {
    const text = 'Mira https://www.ejemplo.mx/ruta para más';
    expect(textProblems('hero.subtitle', text)).not.toEqual([]);
    expect(
      textProblems('hero.subtitle', text, undefined, { allowedHosts: ['ejemplo.mx'] }),
    ).toEqual([]);
    expect(
      textProblems('hero.subtitle', 'Mira https://blog.ejemplo.mx/', undefined, {
        allowedHosts: ['ejemplo.mx'],
      }),
    ).toEqual([]);
    // Un sitio que solo termina igual no es un subdominio
    expect(
      textProblems('hero.subtitle', 'Mira https://malejemplo.mx/', undefined, {
        allowedHosts: ['ejemplo.mx'],
      }),
    ).not.toEqual([]);
  });

  it('una afirmación con respaldo escrito pasa solo en su lugar y con su fuente', () => {
    const claim: BackedClaim = {
      slot: 'hero.subtitle',
      text: 'el mejor',
      backing: 'Estudio comparativo con fecha y enlace guardado en el expediente de la agencia',
    };
    const text = 'Estudia con el mejor banco de preguntas';
    expect(textProblems('hero.subtitle', text)).not.toEqual([]);
    expect(textProblems('hero.subtitle', text, 220, { backedClaims: [claim] })).toEqual([]);
    // En otro lugar no vale
    expect(textProblems('hero.title', text, 70, { backedClaims: [claim] })).not.toEqual([]);
    // Sin fuente tampoco
    expect(
      textProblems('hero.subtitle', text, 220, { backedClaims: [{ ...claim, backing: ' ' }] }),
    ).not.toEqual([]);
  });

  it('las reglas se aplican a todo el texto, también a los títulos que no son un lugar', () => {
    expect(
      landingProblems(withText({ pricingTitle: 'Planes con garantía de aprobar' })).join(' '),
    ).toContain('label.pricingTitle');
    expect(landingProblems(withText({ trust: 'x'.repeat(81) })).join(' ')).toContain(
      'hero.trust pasa de 80 caracteres',
    );
    expect(landingProblems(withText({ features: {} })).join(' ')).toContain('6 funciones');
    expect(landingProblems(withText({ personas: [] })).join(' ')).toContain('6 perfiles');
    expect(landingProblems(withText({ faq: [] })).join(' ')).toContain('3 preguntas');
  });
});

describe('bloques opcionales del creador y de testimonios', () => {
  it('un creador y un testimonio bien escritos pasan', () => {
    expect(blockProblems(creator, [testimonial])).toEqual([]);
    expect(landingProblems(withText({ creator, testimonials: [testimonial] }))).toEqual([]);
  });

  it('el creador sin foto es válido y no tiene lugar para el texto alternativo', () => {
    const noPhoto = { ...creator, photo: null };
    expect(blockProblems(noPhoto, [])).toEqual([]);
    const ids = landingSlots(withText({ creator: noPhoto })).map((slot) => slot.id);
    expect(ids).not.toContain('creator.photoAlt');
  });

  it('la foto lleva su texto alternativo, en su largo, y es un webp de public/landing', () => {
    expect(
      blockProblems({ ...creator, photo: { file: 'creador.webp', alt: ' ' } }, []).join(' '),
    ).toContain('creator.photoAlt está vacío');
    expect(
      blockProblems({ ...creator, photo: { file: 'creador.webp', alt: 'a'.repeat(121) } }, []).join(
        ' ',
      ),
    ).toContain('creator.photoAlt pasa de 120');
    for (const file of [
      'creador.png',
      '../creador.webp',
      'https://x.mx/c.webp',
      'Creador.webp',
      '',
    ]) {
      expect(PHOTO_FILE.test(file), file).toBe(false);
      expect(
        blockProblems({ ...creator, photo: { file, alt: 'Retrato de prueba' } }, []).join(' '),
      ).toContain('creator.photoFile');
    }
    expect(PHOTO_FILE.test('creador.webp')).toBe(true);
    expect(PHOTO_FILE.test('creador-2.webp')).toBe(true);
  });

  it('el creador y los testimonios respetan sus largos', () => {
    const long = blockProblems(
      { ...creator, name: 'n'.repeat(61), role: 'r'.repeat(81), quote: 'q'.repeat(241) },
      [{ ...testimonial, quote: 'q'.repeat(241), who: 'w'.repeat(61) }],
    ).join(' | ');
    for (const id of [
      'creator.name pasa de 60',
      'creator.role pasa de 80',
      'creator.quote pasa de 240',
      'testimonials.1.quote pasa de 240',
      'testimonials.1.who pasa de 60',
    ]) {
      expect(long).toContain(id);
    }
  });

  it('cada testimonio trae la fecha del permiso por escrito de la persona', () => {
    const today = new Date('2026-10-22T12:00:00Z');
    expect(validPermissionDate('2026-10-22', today)).toBe(true);
    expect(validPermissionDate('2026-10-23', today)).toBe(false);
    expect(validPermissionDate('2026-02-30', today)).toBe(false);
    expect(validPermissionDate('22/10/2026', today)).toBe(false);
    expect(validPermissionDate('', today)).toBe(false);
    const problems = blockProblems(null, [{ ...testimonial, permissionOn: '' }], { today });
    expect(problems.join(' ')).toContain('testimonials.1.permissionOn');
  });

  it('hay un tope de seis testimonios', () => {
    const many = Array.from({ length: LANDING_COUNTS.testimonialsMax + 1 }, () => testimonial);
    expect(blockProblems(null, many).join(' ')).toContain('pasa de 6 testimonios');
    expect(blockProblems(null, many.slice(0, 6))).toEqual([]);
  });

  it('las reglas de texto valen también dentro de los bloques', () => {
    const bad = blockProblems(
      { ...creator, quote: 'Mira https://ejemplo.com y aprueba el ENARM seguro' },
      [{ ...testimonial, quote: 'Subí 87% mi nivel!' }],
    ).join(' | ');
    expect(bad).toContain('creator.quote lleva un enlace');
    expect(bad).toContain('creator.quote promete algo que no se puede');
    expect(bad).toContain('testimonials.1.quote lleva signos de exclamación');
    expect(bad).toContain('testimonials.1.quote "87%"');
  });
});

describe('docs/PORTADA.md, el documento de la agencia', () => {
  /** Las filas de las tablas del documento, partidas en celdas sin los acentos graves */
  const rows = PORTADA.split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim().replaceAll('`', '')),
    );

  it('trae la tabla completa de lugares con su largo máximo', () => {
    for (const family of SLOT_FAMILIES) {
      const row = rows.find((cells) => cells[0] === family.id);
      expect(row, `falta ${family.id} en la tabla de lugares`).toBeDefined();
      expect(row?.at(-1), `largo de ${family.id}`).toBe(String(family.max));
    }
  });

  it('dice las reglas que la prueba vigila y dónde se guardan las excepciones', () => {
    for (const word of [
      'puntaje',
      'plaza',
      'garantía',
      '100%',
      'el mejor',
      'el único',
      'testimonio',
      'permiso por escrito',
      'BACKED_CLAIMS',
      'ALLOWED_LINK_HOSTS',
      'public/landing',
      'texto alternativo',
      'Ricardo',
      'abogado',
      'invisibles',
      'aprobación final',
    ]) {
      expect(PORTADA, word).toContain(word);
    }
    expect(PORTADA).toMatch(/sin signos de exclamación/i);
    expect(PORTADA).toMatch(/trato de tú/);
  });

  it('no usa el signo de dos puntos en la prosa', () => {
    // Las tablas y los bloques de código quedan fuera, como en los demás documentos para Ricardo
    let inCode = false;
    const prose = PORTADA.split('\n').filter((line) => {
      if (line.startsWith('```')) {
        inCode = !inCode;
        return false;
      }
      return !inCode && !line.startsWith('|');
    });
    expect(prose.length).toBeGreaterThan(10);
    expect(prose.filter((line) => line.includes(':'))).toEqual([]);
  });
});
