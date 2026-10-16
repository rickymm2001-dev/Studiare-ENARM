// La fuente de un mazo precargado (B13, 4.2 y 4.4 del plan de B13). Los mazos de Paco se comparten con su
// autorización y dicen De quién son. El mazo de vocabulario médico en inglés se arma con los temas de
// salud de MedlinePlus.gov, de la Biblioteca Nacional de Medicina de EE. UU. (NLM), que son de dominio
// público, y NLM pide decir que la información viene de MedlinePlus.gov. Ese mazo no se comparte con
// autorización de nadie, así que dice su fuente y su licencia en lugar del crédito de un autor. Lo mismo
// vale para el mazo de la demo y para el del catálogo de la nube. Solo ese mazo se reconoce así, por su
// clave o por su autor. Ni la rama ni el tema bastan, porque el mazo de un tercero también puede ser de
// Inglés médico y ese sí lleva el crédito de su autor. Funciones puras.
import { branchSection } from '@/data/schemas/content';
import { topicTaxonomy } from '@/demo/content';

/** De dónde sale la información de un mazo y con qué licencia se puede usar */
export interface DeckSource {
  name: string;
  license: string;
}

/** La clave del mazo de vocabulario, la que escribe el script y la que lleva en el catálogo */
export const VOCABULARY_DECK_KEY = 'vocabulario-ingles';

/** El tema de la taxonomía de los submazos del vocabulario. Una prueba revisa que exista */
export const VOCABULARY_TOPIC = 'medical_vocabulary';

export const MEDLINEPLUS_SOURCE: DeckSource = {
  name: 'MedlinePlus.gov (NLM)',
  license: 'Dominio público',
};

const englishBranches = new Set(
  topicTaxonomy.branches.filter((branch) => branchSection(branch) === 'english').map((b) => b.key),
);

/** Lo que se sabe de un mazo para decir su fuente. El autor es el que dice el mazo en su archivo o en el catálogo */
export interface DeckSourceInput {
  key: string;
  author?: string | null | undefined;
}

/** Si todas las ramas del mazo son de Inglés médico, como las del vocabulario. Solo decide el idioma de sus notas de muestra */
export function isEnglishDeck(deck: { branches: readonly (string | null)[] }): boolean {
  const known = deck.branches.filter((branch): branch is string => branch !== null);
  return known.length > 0 && known.every((branch) => englishBranches.has(branch));
}

/**
 * La fuente del mazo, o null si es un mazo compartido con autorización, que dice su autor. El mazo de
 * vocabulario se reconoce por su clave, o por un autor que se llama igual que su fuente si Ricardo lo sube
 * al catálogo con otra clave. La rama y el tema no cuentan, porque el mazo de un tercero también puede ser
 * de Inglés médico y perdería el crédito de su autor
 */
export function deckSourceOf(deck: DeckSourceInput): DeckSource | null {
  const vocabulary =
    deck.key === VOCABULARY_DECK_KEY || deck.author?.trim() === MEDLINEPLUS_SOURCE.name;
  return vocabulary ? MEDLINEPLUS_SOURCE : null;
}
