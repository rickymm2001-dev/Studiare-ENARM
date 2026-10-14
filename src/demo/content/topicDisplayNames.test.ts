// La tabla de nombres legibles de los mazos de Paco (B4 del plan del cambio, hallazgo H11). Cada
// rama, materia y tema que se muestra tiene su nombre revisable, ningún nombre pegado de ningún
// nivel llega a la pantalla, ni siquiera del cuarto o el quinto, y la tabla no guarda nombres que ya
// no se usan.
import { describe, expect, it } from 'vitest';
import { TOPIC_OUTLINE_DEPTH } from '@/engines/deckTopics';
import { sanitizeTag, tagSegments } from '@/engines/tagPath';
import { buildDeckEntities } from './deckEntities';
import { loadDemoDecks } from './decks';
import { plainTopicName, TOPIC_DISPLAY_NAMES, topicDisplayName } from './topicDisplayNames';

const decks = await loadDemoDecks();

/** Los niveles de las etiquetas de los mazos de demostración, hasta el nivel pedido */
const segmentsUpTo = (levels: number) =>
  new Set(
    decks.flatMap((deck) =>
      deck.notes.flatMap((note) => tagSegments(sanitizeTag(note.sourceTag)).slice(0, levels)),
    ),
  );
/** Los niveles que se muestran de cada etiqueta, rama, materia y tema */
const shownSegments = segmentsUpTo(TOPIC_OUTLINE_DEPTH);
/** Todos los niveles, también el cuarto y el quinto, como Linfoma y LH o Diarrea, Agentes y EColi */
const allSegments = segmentsUpTo(Number.POSITIVE_INFINITY);

/** Apellidos que se escriben unidos con guion. No son nombres pegados */
const EPONYMS = ['Churg-Strauss', 'Eaton-Lambert', 'Fitz-Hugh-Curtis', 'Guillain-Barré'];

/**
 * Un nombre pegado, una sigla, un nivel con guion bajo o palabras unidas con guion en lugar de
 * espacio, como los que trae la etiqueta
 */
const looksPasted = (raw: string) => {
  const name = EPONYMS.reduce((text, eponym) => text.replaceAll(eponym, ''), raw);
  return (
    name.includes('_') ||
    /\p{Ll}\p{Lu}/u.test(name) ||
    /\p{Lu}{2}\p{Ll}/u.test(name) ||
    /\p{L}\d|\d\p{L}/u.test(name) ||
    /^\p{Lu}{2,}s?$/u.test(name) ||
    /\p{L}-\p{Lu}/u.test(name)
  );
};

describe('nombres legibles de los mazos de Paco', () => {
  it('cada rama, materia y tema de los mazos de demostración tiene su nombre en la tabla', () => {
    const missing = [...shownSegments].filter((segment) => !(segment in TOPIC_DISPLAY_NAMES));
    expect(missing).toEqual([]);
  });

  it('cada nombre pegado de cualquier nivel tiene una entrada que lo vuelve legible', () => {
    const pasted = [...allSegments].filter(looksPasted);
    // Los que encontró la auditoría, las siglas de Reumatología del ejemplo de Ricardo y los del
    // cuarto y quinto nivel que llegaban a la columna de tema de Buscar tarjetas
    expect(pasted).toEqual(
      expect.arrayContaining([
        'AnticonceptivosyMPF',
        'Hemorragias1T',
        'Hemorragias3T',
        'AR',
        'LES',
        'LH',
        'LLA',
        'HepatitisB',
        'EvW',
        'EHGNA',
        'VCholerae',
        'EColi',
        'OTB',
        'Hipertensión-Portal',
        'Ca-Colorrectal',
      ]),
    );
    for (const segment of pasted) {
      const name = TOPIC_DISPLAY_NAMES[segment];
      expect(name, segment).toBeDefined();
      expect(looksPasted(name as string), `${segment} → ${String(name)}`).toBe(false);
    }
    expect(topicDisplayName('AnticonceptivosyMPF')).toBe(
      'Anticonceptivos y métodos de planificación familiar',
    );
    expect(topicDisplayName('Hemorragias1T')).toBe('Hemorragias del primer trimestre');
    expect(topicDisplayName('AR')).toBe('Artritis reumatoide');
    expect(topicDisplayName('LES')).toBe('Lupus eritematoso sistémico');
    // LH cuelga de Linfoma, así que es el linfoma de Hodgkin y no la hormona luteinizante
    expect(topicDisplayName('LH')).toBe('Linfoma de Hodgkin');
    expect(topicDisplayName('EvW')).toBe('Enfermedad de von Willebrand');
    // Isag no parece pegado, pero es una abreviatura de isquémico agudo
    expect(topicDisplayName('Isag')).toBe('Enfermedad vascular cerebral isquémica aguda');
  });

  it('los nombres se leen como título en español, sin espacios de más', () => {
    for (const [segment, name] of Object.entries(TOPIC_DISPLAY_NAMES)) {
      expect(name, segment).toBe(name.trim());
      expect(name, segment).not.toMatch(/\s{2}|_/);
      expect(name, segment).toMatch(/^\p{Lu}/u);
    }
  });

  it('la tabla no guarda niveles que ningún mazo usa', () => {
    const unused = Object.keys(TOPIC_DISPLAY_NAMES).filter((key) => !allSegments.has(key));
    expect(unused).toEqual([]);
  });

  it('fuera de la tabla los guiones bajos vuelven a ser espacios y lo demás queda igual', () => {
    expect(topicDisplayName('Cardio_Arritmias')).toBe('Cardio Arritmias');
    expect(topicDisplayName('Guillain-Barré')).toBe('Guillain-Barré');
    expect(topicDisplayName('constructor')).toBe('constructor');
    // Sin la tabla, como en un mazo importado, aunque el nivel se llame igual que uno de Paco
    expect(plainTopicName('Primarias')).toBe('Primarias');
    expect(plainTopicName('Fibrilación__auricular ')).toBe('Fibrilación auricular');
  });

  it('las materias de los mazos ya se llaman con su nombre legible', () => {
    const names = buildDeckEntities(decks).decks.map((deck) => deck.name);
    expect(names).toContain('Anticonceptivos y métodos de planificación familiar');
    expect(names).toContain('Hemorragias del primer trimestre');
    expect(names.filter(looksPasted)).toEqual([]);
  });
});
