// La fuente de un mazo precargado (B13, 4.4 del plan de B13). El vocabulario de MedlinePlus dice su fuente
// y su licencia en lugar del crédito de un autor, y se reconoce solo por su clave o por su autor. Ni la
// rama ni el tema bastan, porque el mazo de un tercero también puede ser de Inglés médico y debe seguir
// diciendo de quién es. Los mazos compartidos con autorización siguen diciendo de quién son.
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
    expect(deckSourceOf({ key: VOCABULARY_DECK_KEY })).toEqual(MEDLINEPLUS_SOURCE);
    // Aunque el autor sea otro o falte, la clave del vocabulario manda
    expect(deckSourceOf({ key: VOCABULARY_DECK_KEY, author: null })).toEqual(MEDLINEPLUS_SOURCE);
    expect(MEDLINEPLUS_SOURCE).toEqual({
      name: 'MedlinePlus.gov (NLM)',
      license: 'Dominio público',
    });
  });

  it('con otra clave se reconoce porque su autor es MedlinePlus.gov (NLM)', () => {
    expect(
      deckSourceOf({ key: 'vocabulario-medlineplus', author: MEDLINEPLUS_SOURCE.name }),
    ).toEqual(MEDLINEPLUS_SOURCE);
    expect(deckSourceOf({ key: 'otro', author: `  ${MEDLINEPLUS_SOURCE.name} ` })).toEqual(
      MEDLINEPLUS_SOURCE,
    );
  });

  it('el mazo de un tercero de Inglés médico sigue diciendo su autor, aunque todos sus temas sean los del vocabulario', () => {
    // Era el hallazgo. Un mazo de otra persona con la rama y el tema del vocabulario perdía su crédito
    const input = {
      key: 'ingles-medico-de-un-tercero',
      author: 'Dra. Pérez',
      branches: ['medical_english', 'medical_english'],
      topics: [VOCABULARY_TOPIC, VOCABULARY_TOPIC],
    };
    expect(deckSourceOf(input)).toBeNull();
    // Y el parecido de nombre no basta, tiene que llamarse igual
    expect(deckSourceOf({ key: 'x', author: 'MedlinePlus' })).toBeNull();
    expect(deckSourceOf({ key: 'x', author: 'medlineplus.gov (nlm) y Pérez' })).toBeNull();
  });

  it('un mazo compartido con autorización o sin autor sigue sin fuente propia', () => {
    expect(deckSourceOf({ key: 'paco-gyo', author: 'Paco' })).toBeNull();
    expect(deckSourceOf({ key: 'sin-autor' })).toBeNull();
    expect(deckSourceOf({ key: 'sin-autor', author: null })).toBeNull();
    expect(deckSourceOf({ key: 'vacio', author: '' })).toBeNull();
  });

  it('un mazo es de inglés cuando todas sus ramas con rama son de Inglés médico', () => {
    expect(isEnglishDeck({ branches: ['medical_english', 'medical_english', null] })).toBe(true);
    expect(isEnglishDeck({ branches: ['medical_english', 'pediatrics'] })).toBe(false);
    expect(isEnglishDeck({ branches: ['pediatrics'] })).toBe(false);
    expect(isEnglishDeck({ branches: [null] })).toBe(false);
    expect(isEnglishDeck({ branches: [] })).toBe(false);
  });
});
