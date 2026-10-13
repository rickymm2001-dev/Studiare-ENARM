// La tabla de nombres legibles de los mazos de Paco (B4 del plan del cambio, hallazgo H11). Cada
// rama, materia y tema que se muestra tiene su nombre revisable, ningún nombre pegado llega a la
// pantalla y la tabla no guarda nombres que ya no se usan.
import { describe, expect, it } from 'vitest';
import { sanitizeTag, tagSegments } from '@/engines/tagPath';
import { buildDeckEntities } from './deckEntities';
import { loadDemoDecks } from './decks';
import { TOPIC_DISPLAY_NAMES, topicDisplayName } from './topicDisplayNames';

const decks = await loadDemoDecks();
/** Los niveles que se muestran de cada etiqueta, rama, materia y tema */
const SHOWN_LEVELS = 3;
const shownSegments = new Set(
  decks.flatMap((deck) =>
    deck.notes.flatMap((note) => tagSegments(sanitizeTag(note.sourceTag)).slice(0, SHOWN_LEVELS)),
  ),
);

/** Un nombre pegado, una sigla o un nivel con guion bajo, como los que trae la etiqueta */
const looksPasted = (name: string) =>
  name.includes('_') ||
  /\p{Ll}\p{Lu}/u.test(name) ||
  /\p{Lu}{2}\p{Ll}/u.test(name) ||
  /\p{L}\d|\d\p{L}/u.test(name) ||
  /^\p{Lu}{2,}s?$/u.test(name);

describe('nombres legibles de los mazos de Paco', () => {
  it('cada rama, materia y tema de los mazos de demostración tiene su nombre en la tabla', () => {
    const missing = [...shownSegments].filter((segment) => !(segment in TOPIC_DISPLAY_NAMES));
    expect(missing).toEqual([]);
  });

  it('cada nombre pegado tiene una entrada que lo vuelve legible', () => {
    const pasted = [...shownSegments].filter(looksPasted);
    // Los que encontró la auditoría y las siglas de Reumatología del ejemplo de Ricardo
    expect(pasted).toEqual(
      expect.arrayContaining([
        'AnticonceptivosyMPF',
        'Hemorragias1T',
        'Hemorragias3T',
        'AR',
        'LES',
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
  });

  it('los nombres se leen como título en español, sin espacios de más', () => {
    for (const [segment, name] of Object.entries(TOPIC_DISPLAY_NAMES)) {
      expect(name, segment).toBe(name.trim());
      expect(name, segment).not.toMatch(/\s{2}|_/);
      expect(name, segment).toMatch(/^\p{Lu}/u);
    }
  });

  it('la tabla no guarda niveles que ningún mazo usa', () => {
    const unused = Object.keys(TOPIC_DISPLAY_NAMES).filter((key) => !shownSegments.has(key));
    expect(unused).toEqual([]);
  });

  it('fuera de la tabla, como en un mazo importado, los guiones bajos vuelven a ser espacios', () => {
    expect(topicDisplayName('Cardio_Arritmias')).toBe('Cardio Arritmias');
    expect(topicDisplayName('Guillain-Barré')).toBe('Guillain-Barré');
  });

  it('las materias de los mazos ya se llaman con su nombre legible', () => {
    const names = buildDeckEntities(decks).decks.map((deck) => deck.name);
    expect(names).toContain('Anticonceptivos y métodos de planificación familiar');
    expect(names).toContain('Hemorragias del primer trimestre');
    expect(names.filter(looksPasted)).toEqual([]);
  });
});
