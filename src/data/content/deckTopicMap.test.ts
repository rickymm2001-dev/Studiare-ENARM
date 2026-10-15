// Rama y tema propuestos para cada submazo de un mazo de Anki (4.8 del plan de B11). Las tablas de los
// mazos de Paco son las mismas que usó la demo, y lo demás se propone por nombre contra la taxonomía
import { describe, expect, it } from 'vitest';
import { topicTaxonomy } from '@/demo/content';
import { PACO_DECKS, proposeDeckTopic } from './deckTopicMap';

const propose = (segments: string[]) => proposeDeckTopic(segments, topicTaxonomy);

describe('rama y tema de un submazo', () => {
  it('los mazos de Paco usan sus tablas, como en la demo', () => {
    expect(propose(['Medicina-Interna', 'Hematología', 'Anemias'])).toEqual({
      branch: 'internal_medicine',
      topic: 'hematology',
    });
    expect(propose(['Obstetricia', 'Control_Prenatal'])).toEqual({
      branch: 'obstetrics_gynecology',
      topic: 'prenatal_care',
    });
    expect(propose(['Urgencias', 'Quemaduras'])).toEqual({
      branch: 'general_surgery',
      topic: 'burns',
    });
    expect(PACO_DECKS.map((deck) => deck.key)).toEqual(['paco-mi', 'paco-gyo', 'paco-urgencias']);
  });

  it('un submazo de Paco sin tema en su tabla se busca por nombre dentro de su rama', () => {
    expect(propose(['Medicina-Interna', 'Cardiología'])).toEqual({
      branch: 'internal_medicine',
      topic: 'cardiology',
    });
  });

  it('otro mazo se propone por el nombre de la rama y del tema, sin acentos', () => {
    expect(propose(['Pediatria', 'Neonatologia'])).toEqual({
      branch: 'pediatrics',
      topic: 'neonatology',
    });
    expect(propose(['Repaso', 'Infectologia'])).toEqual({
      branch: 'internal_medicine',
      topic: 'infectious_diseases',
    });
  });

  it('los submazos del mazo de vocabulario en inglés son del tema de vocabulario médico (B13)', () => {
    for (const root of ['Inglés_médico', 'Inglés médico', 'Ingles-medico']) {
      expect(propose([root, 'Corazón_y_circulación']), root).toEqual({
        branch: 'medical_english',
        topic: 'medical_vocabulary',
      });
    }
    // Un submazo con el nombre del otro tema de la rama sigue yendo a ese tema
    expect(propose(['Inglés médico', 'Comprensión de lectura'])).toEqual({
      branch: 'medical_english',
      topic: 'reading_comprehension',
    });
    // Sin ese tema en la rama, o en una rama de español, no se propone
    expect(
      proposeDeckTopic(['Inglés médico', 'Infecciones'], {
        branches: [
          { key: 'medical_english', name: 'Inglés médico', section: 'english', topics: [] },
        ],
      }),
    ).toEqual({ branch: 'medical_english', topic: null });
    expect(propose(['Pediatría', 'Corazón_y_circulación'])).toEqual({
      branch: 'pediatrics',
      topic: null,
    });
  });

  it('lo que no se encuentra queda sin tema para que el admin lo elija', () => {
    expect(propose(['Mazo', 'Cosas varias'])).toEqual({ branch: null, topic: null });
    expect(propose(['Urgencias', 'Toxicología'])).toEqual({ branch: null, topic: null });
  });
});
