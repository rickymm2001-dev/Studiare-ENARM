// La fuente de un mazo precargado (B13, 4.4 del plan de B13). El vocabulario de MedlinePlus dice su fuente
// y su licencia en lugar del crédito de un autor, se reconozca por su clave o por sus temas. Los mazos
// compartidos con autorización siguen diciendo de quién son.
import { describe, expect, it } from 'vitest';
import { topicTaxonomy } from '@/demo/content';
import {
  deckSourceOf,
  isEnglishDeck,
  MEDLINEPLUS_SOURCE,
  VOCABULARY_DECK_KEY,
  VOCABULARY_TOPIC,
} from './deckSource';

describe('fuente de un mazo', () => {
  it('el tema del vocabulario existe en Inglés médico, que es la sección en inglés', () => {
    const english = topicTaxonomy.branches.find((branch) => branch.section === 'english');
    expect(english?.key).toBe('medical_english');
    expect(english?.topics.map((topic) => topic.key)).toContain(VOCABULARY_TOPIC);
  });

  it('el mazo de vocabulario se reconoce por su clave', () => {
    expect(deckSourceOf({ key: VOCABULARY_DECK_KEY, branches: [], topics: [] })).toEqual(
      MEDLINEPLUS_SOURCE,
    );
    expect(MEDLINEPLUS_SOURCE).toEqual({
      name: 'MedlinePlus.gov (NLM)',
      license: 'Dominio público',
    });
  });

  it('con otra clave se reconoce porque todos sus temas son los del vocabulario', () => {
    expect(
      deckSourceOf({
        key: 'vocabulario-medlineplus',
        branches: ['medical_english', 'medical_english'],
        topics: [VOCABULARY_TOPIC, VOCABULARY_TOPIC, null],
      }),
    ).toEqual(MEDLINEPLUS_SOURCE);
  });

  it('un mazo compartido con autorización o con temas mezclados sigue diciendo su autor', () => {
    expect(
      deckSourceOf({
        key: 'paco-gyo',
        branches: ['obstetrics_gynecology'],
        topics: ['prenatal_care'],
      }),
    ).toBeNull();
    expect(
      deckSourceOf({
        key: 'mezcla',
        branches: ['medical_english', 'internal_medicine'],
        topics: [VOCABULARY_TOPIC, 'cardiology'],
      }),
    ).toBeNull();
    // Sin temas asignados no se supone nada
    expect(deckSourceOf({ key: 'sin-temas', branches: [null], topics: [null] })).toBeNull();
    expect(deckSourceOf({ key: 'vacio', branches: [], topics: [] })).toBeNull();
  });

  it('un mazo es de inglés cuando todas sus ramas con rama son de Inglés médico', () => {
    expect(isEnglishDeck({ branches: ['medical_english', 'medical_english', null] })).toBe(true);
    expect(isEnglishDeck({ branches: ['medical_english', 'pediatrics'] })).toBe(false);
    expect(isEnglishDeck({ branches: ['pediatrics'] })).toBe(false);
    expect(isEnglishDeck({ branches: [null] })).toBe(false);
    expect(isEnglishDeck({ branches: [] })).toBe(false);
  });
});
