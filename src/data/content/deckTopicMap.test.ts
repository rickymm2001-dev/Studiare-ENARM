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

  it('lo que no se encuentra queda sin tema para que el admin lo elija', () => {
    expect(propose(['Mazo', 'Cosas varias'])).toEqual({ branch: null, topic: null });
    expect(propose(['Urgencias', 'Toxicología'])).toEqual({ branch: null, topic: null });
  });
});
